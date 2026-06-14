// lib/schedule-run.ts
// ============================================================
// The I/O wrapper around the pure scheduler. Reads the founder's
// profile + open tasks + Google Calendar busy times, builds a
// schedule for the given days, writes schedule_blocks, and mirrors
// each block to Google Calendar when connected.
//
// Single implementation, shared by the agent (lib/agent.ts) and the
// REST planning endpoints so day/week planning never drifts apart.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSchedule, type SchedulableTask, type BusyInterval } from "@/lib/scheduler";
import { fetchBusy, createBlockEvent, clearAgentEvents } from "@/lib/gcal";

export type ScheduleRunResult = {
  placed: number;
  unplaced: { title: string; reason: string }[];
  minutes_by_day: Record<string, number>;
};

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function scheduleDaysFor(
  supabase: SupabaseClient,
  founderUserId: string,
  days: Date[],
  now: Date
): Promise<ScheduleRunResult> {
  const [{ data: profile }, { data: tokenRow }, { data: tasks }] = await Promise.all([
    supabase.from("founder_profiles").select("*").eq("user_id", founderUserId).maybeSingle(),
    supabase.from("gcal_tokens").select("refresh_token, calendar_id").eq("user_id", founderUserId).maybeSingle(),
    supabase.from("tasks").select("*").eq("owner", founderUserId).in("status", ["planned", "scheduled"]),
  ]);
  if (!profile) throw new Error("No profile yet — set up energy windows in Settings (or run the seed).");

  const schedulable: SchedulableTask[] = (tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    energy: t.energy,
    category: t.category,
    estimateMinutes: t.estimate_minutes ?? 30,
    dueDate: t.due_date ?? undefined,
    isAnchor: t.is_anchor,
    slipCount: t.slip_count,
  }));

  const dayKeys = days.map(dateKey);

  // wipe our existing blocks for those days (DB + GCal best-effort)
  await supabase.from("schedule_blocks").delete().eq("founder_id", founderUserId).in("block_date", dayKeys);
  let busy: BusyInterval[] = [];
  if (tokenRow) {
    try {
      const span0 = new Date(days[0]);
      span0.setHours(0, 0, 0, 0);
      const span1 = new Date(days[days.length - 1]);
      span1.setHours(23, 59, 59, 0);
      await clearAgentEvents(tokenRow, span0, span1);
      busy = await fetchBusy(tokenRow, span0, span1);
    } catch {
      busy = [];
    }
  }

  const result = buildSchedule({
    profile: {
      userId: founderUserId,
      energyWindows: profile.energy_windows ?? [],
      dailyCeilingMinutes: profile.daily_ceiling_minutes ?? 300,
      multipliers: profile.multipliers ?? { _default: 1.5 },
      timezone: profile.timezone ?? "America/Toronto",
    },
    tasks: schedulable,
    busy,
    days,
    now,
  });

  for (const block of result.blocks) {
    const bd = dateKey(block.start);
    let gcalId: string | null = null;
    if (tokenRow) {
      try {
        gcalId = await createBlockEvent(
          tokenRow,
          { title: block.title, start: block.start, end: block.end, taskId: block.taskId },
          profile.timezone ?? "America/Toronto"
        );
      } catch {
        gcalId = null;
      }
    }
    await supabase.from("schedule_blocks").insert({
      task_id: block.taskId,
      founder_id: founderUserId,
      block_date: bd,
      start_at: block.start.toISOString(),
      end_at: block.end.toISOString(),
      gcal_event_id: gcalId,
    });
    await supabase.from("tasks").update({ status: "scheduled" }).eq("id", block.taskId);
  }

  return {
    placed: result.blocks.length,
    unplaced: result.unplaced.map((u) => ({ title: u.task.title, reason: u.reason })),
    minutes_by_day: result.minutesPlannedByDay,
  };
}
