// app/api/cron/nightly/route.ts
// ============================================================
// NIGHTLY REPLAN — Phase 2
// Runs ~02:00 Toronto time via Vercel cron. For each founder:
//  1. wipe tomorrow's agent-created events (never real meetings)
//  2. gather tomorrow's still-open tasks for the week
//  3. fetch real busy times from Google Calendar
//  4. run buildSchedule() for tomorrow
//  5. write blocks to GCal + schedule_blocks table
//  6. stash unplaced tasks for the morning brief to surface
//
// vercel.json:
//   { "crons": [{ "path": "/api/cron/nightly", "schedule": "0 7 * * *" }] }
//   (07:00 UTC ≈ 02:00–03:00 Toronto depending on DST)
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildSchedule, type SchedulableTask } from "@/lib/scheduler";
import { fetchBusy, createBlockEvent, clearAgentEvents } from "@/lib/gcal";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function mondayOf(d: Date): string {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - ((day + 6) % 7));
  return x.toISOString().slice(0, 10);
}

// ---------- multiplier learning (Phase 5) ----------
// Nightly, per founder: look at tasks completed in the last 21 days
// that carry BOTH an estimate and an actual, take the median
// actual/estimate ratio per category (median — one wild outlier
// shouldn't swing the planning model), and blend it into the stored
// multiplier with an EMA. Needs 3+ samples per category to move.
// Result: estimates quietly get realistic without anyone tuning them.
function learnMultipliers(
  current: Record<string, number>,
  doneTasks: { category: string; estimate_minutes: number | null; actual_minutes: number | null }[]
): Record<string, number> {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const t of doneTasks) {
    if (!t.estimate_minutes || !t.actual_minutes) continue;
    const ratio = t.actual_minutes / t.estimate_minutes;
    if (ratio < 0.2 || ratio > 6) continue; // junk entries
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category)!.push(ratio);
    all.push(ratio);
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const clamp = (n: number) => Math.min(3, Math.max(0.5, Math.round(n * 100) / 100));
  const next = { ...current };
  for (const [cat, ratios] of byCategory) {
    if (ratios.length < 3) continue;
    const old = current[cat] ?? current["_default"] ?? 1.5;
    next[cat] = clamp(0.7 * old + 0.3 * median(ratios));
  }
  if (all.length >= 5) {
    const old = current["_default"] ?? 1.5;
    next["_default"] = clamp(0.7 * old + 0.3 * median(all));
  }
  return next;
}

export async function GET(req: Request) {
  // Protect the endpoint
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Created inside the handler so builds don't require env vars.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // service role: cron acts for both founders
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayEnd = new Date(tomorrow);
  dayEnd.setHours(23, 59, 59, 0);

  const { data: founders, error: fErr } = await supabase
    .from("founders")
    .select("user_id, display_name, profiles(*), gcal_tokens(*)");
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  const results: Record<string, unknown> = {};

  for (const f of founders ?? []) {
    const profile = Array.isArray(f.profiles) ? f.profiles[0] : f.profiles;
    const tokens = Array.isArray(f.gcal_tokens) ? f.gcal_tokens[0] : f.gcal_tokens;
    if (!profile) continue;

    // 0. learn multipliers from the last 21 days of estimate vs actual,
    //    so tonight's plan already uses the updated model
    const since = new Date();
    since.setDate(since.getDate() - 21);
    const { data: recentDone } = await supabase
      .from("tasks")
      .select("category, estimate_minutes, actual_minutes")
      .eq("owner", f.user_id)
      .eq("status", "done")
      .gte("completed_at", since.toISOString())
      .not("actual_minutes", "is", null);
    const learned = learnMultipliers(
      profile.multipliers ?? { _default: 1.5 },
      recentDone ?? []
    );
    if (JSON.stringify(learned) !== JSON.stringify(profile.multipliers)) {
      await supabase
        .from("profiles")
        .update({ multipliers: learned })
        .eq("user_id", f.user_id);
      profile.multipliers = learned;
    }

    // 2. open tasks assigned to this founder for the current week
    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("owner", f.user_id)
      .eq("week_assigned", mondayOf(new Date()))
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

    // 1 + 3. calendar: clear our old events, then read real busy times
    let busy: { start: Date; end: Date }[] = [];
    if (tokens) {
      await clearAgentEvents(tokens, tomorrow, dayEnd);
      busy = await fetchBusy(tokens, tomorrow, dayEnd);
    }

    // 4. schedule
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
      days: [tomorrow],
    });

    // 5. persist: gcal events + schedule_blocks rows
    await supabase
      .from("schedule_blocks")
      .delete()
      .eq("founder_id", f.user_id)
      .eq("block_date", tomorrow.toISOString().slice(0, 10));

    for (const block of result.blocks) {
      let gcalId: string | null = null;
      if (tokens) {
        gcalId = await createBlockEvent(tokens, {
          title: block.title,
          start: block.start,
          end: block.end,
          taskId: block.taskId,
        }, profile.timezone);
      }
      await supabase.from("schedule_blocks").insert({
        task_id: block.taskId,
        founder_id: f.user_id,
        block_date: tomorrow.toISOString().slice(0, 10),
        start_at: block.start.toISOString(),
        end_at: block.end.toISOString(),
        gcal_event_id: gcalId,
      });
      await supabase.from("tasks").update({ status: "scheduled" }).eq("id", block.taskId);
    }

    // 6. unplaced → stored on the daily review row for the morning brief.
    // Read-merge-write: a plain upsert here would clobber the OTHER
    // founder's data (and any shutdown summaries) on the shared row.
    const periodKey = tomorrow.toISOString().slice(0, 10);
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("agent_summary")
      .eq("type", "daily")
      .eq("period_start", periodKey)
      .maybeSingle();
    const existingSummary =
      (existingReview?.agent_summary as Record<string, Record<string, unknown>>) ?? {};
    await supabase.from("reviews").upsert(
      {
        type: "daily",
        period_start: periodKey,
        agent_summary: {
          ...existingSummary,
          [f.user_id]: {
            ...(existingSummary[f.user_id] ?? {}),
            planned_minutes: result.minutesPlannedByDay,
            unplaced: result.unplaced.map((u) => ({
              task_id: u.task.id,
              title: u.task.title,
              reason: u.reason,
            })),
          },
        },
      },
      { onConflict: "type,period_start" }
    );

    results[f.display_name] = {
      placed: result.blocks.length,
      unplaced: result.unplaced.length,
    };
  }

  return NextResponse.json({ ok: true, results });
}
