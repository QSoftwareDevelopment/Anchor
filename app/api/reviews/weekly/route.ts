// app/api/reviews/weekly/route.ts
// GET: the prepared Sunday review + proposed plan for next week.
// POST: founders confirm → write assignments, anchors, indicator
// actuals, then run the scheduler for Mon–Fri and push to GCal.
// The agent proposed; this endpoint is the founders committing.
import { NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase, currentFounder } from "@/lib/supabase";
import { buildSchedule, type SchedulableTask, type BusyInterval } from "@/lib/scheduler";
import { fetchBusy, createBlockEvent, clearAgentEvents } from "@/lib/gcal";
import { mondayOf, nextMondayOf } from "@/lib/utils";

export const maxDuration = 60;

export async function GET() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // The upcoming week's review row (prepared Friday by weekly-prep)
  const nextMonday = nextMondayOf(new Date());
  const thisMonday = mondayOf(new Date());

  // Prefer next week's prepared row; fall back to this week's
  // (covers running the review on Sunday vs Monday).
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("type", "weekly")
    .in("period_start", [nextMonday, thisMonday])
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data ?? null);
}

type ConfirmBody = {
  week_start: string;
  one_metric: string;
  anchor_sid: string;
  anchor_aaryan: string;
  confirmed_assignments: { task_id: string; owner: string; week_start: string }[];
  indicator_entries: { indicator_id: string; actual: number }[];
};

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as ConfirmBody;
  const weekStart = body.week_start || nextMondayOf(new Date());
  const reviewOfWeek = mondayOf(new Date());

  // 1. task assignments
  for (const a of body.confirmed_assignments ?? []) {
    await supabase
      .from("tasks")
      .update({ owner: a.owner, week_assigned: a.week_start || weekStart })
      .eq("id", a.task_id);
  }

  // 2. indicator actuals for the week being reviewed
  for (const e of body.indicator_entries ?? []) {
    await supabase.from("indicator_entries").upsert(
      { indicator_id: e.indicator_id, week_start: reviewOfWeek, actual: e.actual },
      { onConflict: "indicator_id,week_start" }
    );
  }

  // 3. anchor commitments
  const { data: founders } = await supabase
    .from("founders")
    .select("user_id, display_name, profiles(*), gcal_tokens(*)");
  const sid = (founders ?? []).find((f) => f.display_name.toLowerCase() === "sid");
  const aaryan = (founders ?? []).find((f) => f.display_name.toLowerCase() === "aaryan");

  const anchorPairs: { founder: typeof sid; commitment: string }[] = [
    { founder: sid, commitment: body.anchor_sid },
    { founder: aaryan, commitment: body.anchor_aaryan },
  ];
  for (const { founder: f, commitment } of anchorPairs) {
    if (!f || !commitment?.trim()) continue;
    await supabase.from("anchor_commitments").upsert(
      { week_start: weekStart, founder_id: f.user_id, commitment: commitment.trim() },
      { onConflict: "week_start,founder_id" }
    );
  }

  // 4. stamp the one metric on the review row
  await supabase
    .from("reviews")
    .update({ one_metric: body.one_metric, responses: { confirmed_by: founder.user_id, confirmed_at: new Date().toISOString() } })
    .eq("type", "weekly")
    .eq("period_start", weekStart);

  // 5. run the scheduler for Mon–Fri per founder, write GCal + blocks.
  // Uses the service client: this confirmed plan covers BOTH founders,
  // and gcal_tokens are self-only under RLS.
  const service = createServiceSupabase();
  const days: Date[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const weekEnd = new Date(days[4]);
  weekEnd.setHours(23, 59, 59, 0);

  const scheduleResults: Record<string, { placed: number; unplaced: number }> = {};

  for (const f of founders ?? []) {
    const profile = Array.isArray(f.profiles) ? f.profiles[0] : f.profiles;
    if (!profile) continue;
    const { data: tokenRow } = await service
      .from("gcal_tokens")
      .select("refresh_token, calendar_id")
      .eq("user_id", f.user_id)
      .maybeSingle();

    const { data: tasks } = await service
      .from("tasks")
      .select("*")
      .eq("owner", f.user_id)
      .eq("week_assigned", weekStart)
      .in("status", ["planned", "scheduled"]);

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

    let busy: BusyInterval[] = [];
    if (tokenRow) {
      try {
        await clearAgentEvents(tokenRow, days[0], weekEnd);
        busy = await fetchBusy(tokenRow, days[0], weekEnd);
      } catch {
        busy = []; // calendar unreachable — schedule against an open week
      }
    }

    const result = buildSchedule({
      profile: {
        userId: f.user_id,
        energyWindows: profile.energy_windows ?? [],
        dailyCeilingMinutes: profile.daily_ceiling_minutes,
        multipliers: profile.multipliers ?? { _default: 1.5 },
        timezone: profile.timezone,
      },
      tasks: schedulable,
      busy,
      days,
    });

    await service
      .from("schedule_blocks")
      .delete()
      .eq("founder_id", f.user_id)
      .gte("block_date", weekStart)
      .lte("block_date", weekEnd.toISOString().slice(0, 10));

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
      await service.from("schedule_blocks").insert({
        task_id: block.taskId,
        founder_id: f.user_id,
        block_date: block.start.toISOString().slice(0, 10),
        start_at: block.start.toISOString(),
        end_at: block.end.toISOString(),
        gcal_event_id: gcalId,
      });
      await service.from("tasks").update({ status: "scheduled" }).eq("id", block.taskId);
    }

    scheduleResults[f.display_name] = {
      placed: result.blocks.length,
      unplaced: result.unplaced.length,
    };
  }

  return NextResponse.json({ ok: true, schedule: scheduleResults });
}
