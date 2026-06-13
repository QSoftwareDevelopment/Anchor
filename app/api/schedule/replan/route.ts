// app/api/schedule/replan/route.ts
// POST — replan the REST of today for the current founder.
// For when the day blows up: meetings ran over, something urgent
// landed, the morning plan is fiction by 1pm. Fresh starts, not
// backlogs — the founder asks, the scheduler rebuilds from now.
//
// Hard rules preserved:
//  - the daily ceiling counts minutes ALREADY worked today, so a
//    replan can't smuggle extra hours past it
//  - only agent-tagged GCal events are touched
//  - what doesn't fit comes back as unplaced, never crammed
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { buildSchedule, type SchedulableTask, type BusyInterval } from "@/lib/scheduler";
import { fetchBusy, createBlockEvent, clearAgentEvents } from "@/lib/gcal";
import { mondayOf, todayISO } from "@/lib/utils";

export const maxDuration = 30;

export async function POST() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const today = todayISO();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 0);

  const [{ data: profile }, { data: tokenRow }, { data: tasks }, { data: todayBlocks }] =
    await Promise.all([
      supabase.from("founder_profiles").select("*").eq("user_id", founder.user_id).maybeSingle(),
      // gcal_tokens RLS is self-only — the session client can read its own row
      supabase
        .from("gcal_tokens")
        .select("refresh_token, calendar_id")
        .eq("user_id", founder.user_id)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("*")
        .eq("owner", founder.user_id)
        .eq("week_assigned", mondayOf(now))
        .in("status", ["planned", "scheduled"]),
      supabase
        .from("schedule_blocks")
        .select("id, task_id, start_at, end_at, gcal_event_id, tasks(status)")
        .eq("founder_id", founder.user_id)
        .eq("block_date", today),
    ]);

  if (!profile)
    return NextResponse.json({ error: "no profile — set up Settings first" }, { status: 400 });

  // Minutes already spent today (blocks that started before now),
  // so the ceiling holds across the whole day, not just the replan.
  const spentMinutes = (todayBlocks ?? [])
    .filter((b) => new Date(b.start_at) < now)
    .reduce((sum, b) => {
      const end = new Date(b.end_at) < now ? new Date(b.end_at) : now;
      return sum + Math.max(0, (end.getTime() - new Date(b.start_at).getTime()) / 60_000);
    }, 0);
  const remainingCeiling = Math.max(
    0,
    profile.daily_ceiling_minutes - Math.round(spentMinutes)
  );

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

  // Calendar: wipe OUR remaining events for today, read real busy times
  let busy: BusyInterval[] = [];
  if (tokenRow) {
    try {
      await clearAgentEvents(tokenRow, now, dayEnd);
      busy = await fetchBusy(tokenRow, now, dayEnd);
    } catch {
      busy = [];
    }
  }

  const result = buildSchedule({
    profile: {
      userId: founder.user_id,
      energyWindows: profile.energy_windows ?? [],
      dailyCeilingMinutes: remainingCeiling,
      multipliers: profile.multipliers ?? { _default: 1.5 },
      timezone: profile.timezone,
    },
    tasks: schedulable,
    busy,
    days: [dayStart],
    now,
  });

  // Remove only FUTURE blocks for not-done tasks — keep the morning's
  // history intact for the evening review.
  const futureIds = (todayBlocks ?? [])
    .filter((b) => {
      const t = Array.isArray(b.tasks) ? b.tasks[0] : b.tasks;
      return new Date(b.start_at) >= now && t?.status !== "done";
    })
    .map((b) => b.id);
  if (futureIds.length > 0) {
    await supabase.from("schedule_blocks").delete().in("id", futureIds);
  }

  for (const block of result.blocks) {
    let gcalId: string | null = null;
    if (tokenRow) {
      try {
        gcalId = await createBlockEvent(
          tokenRow,
          { title: block.title, start: block.start, end: block.end, taskId: block.taskId },
          profile.timezone
        );
      } catch {
        gcalId = null;
      }
    }
    await supabase.from("schedule_blocks").insert({
      task_id: block.taskId,
      founder_id: founder.user_id,
      block_date: today,
      start_at: block.start.toISOString(),
      end_at: block.end.toISOString(),
      gcal_event_id: gcalId,
    });
    await supabase.from("tasks").update({ status: "scheduled" }).eq("id", block.taskId);
  }

  return NextResponse.json({
    ok: true,
    placed: result.blocks.length,
    unplaced: result.unplaced.map((u) => ({ title: u.task.title, reason: u.reason })),
    remaining_ceiling_minutes: remainingCeiling,
  });
}
