// app/api/cron/weekly-prep/route.ts
// Friday cron (~4pm Toronto). Assembles the Sunday review:
//  1. this week's completion + slip data per founder
//  2. indicator actuals vs targets
//  3. weekly Review Agent → review markdown
//  4. Planner Agent → next week's proposed plan
// Both stored on the reviews row for NEXT Monday (type 'weekly').
import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase";
import { callClaude, extractJSON } from "@/lib/anthropic";
import {
  WEEKLY_REVIEW_PROMPT,
  PLANNER_PROMPT,
  type PlannerResult,
} from "@/lib/agents";
import { mondayOf, nextMondayOf, weeksUntil } from "@/lib/utils";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  const now = new Date();
  const thisMonday = mondayOf(now);
  const nextMonday = nextMondayOf(now);
  const weekEnd = new Date(thisMonday + "T00:00:00");
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndKey = weekEnd.toISOString().slice(0, 10);

  // ---- gather ----
  const [
    { data: founders },
    { data: goals },
    { data: projects },
    { data: anchors },
    { data: lastWeekly },
  ] = await Promise.all([
    supabase.from("founders").select("user_id, display_name, founder_profiles(*)"),
    supabase
      .from("goals")
      .select("*, indicators(*, indicator_entries(week_start, actual))")
      .eq("status", "active"),
    supabase
      .from("projects")
      .select("*, goals(outcome), tasks(*)")
      .in("status", ["active", "paused"]),
    supabase
      .from("anchor_commitments")
      .select("*, founders(display_name)")
      .eq("week_start", thisMonday),
    supabase
      .from("reviews")
      .select("challenger_question, agent_summary")
      .eq("type", "weekly")
      .eq("period_start", thisMonday)
      .maybeSingle(),
  ]);

  // per-founder week stats
  const founderStats = await Promise.all(
    (founders ?? []).map(async (f) => {
      const [{ count: completedCount }, { count: slippedCount }] =
        await Promise.all([
          supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("owner", f.user_id)
            .eq("status", "done")
            .gte("completed_at", `${thisMonday}T00:00:00`),
          supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("owner", f.user_id)
            .eq("week_assigned", thisMonday)
            .not("status", "in", "(done,killed)"),
        ]);
      const anchor = (anchors ?? []).find((a) => a.founder_id === f.user_id);
      return {
        id: f.user_id,
        name: f.display_name,
        completed_count: completedCount ?? 0,
        slipped_count: slippedCount ?? 0,
        anchor_kept: anchor?.kept ?? null,
      };
    })
  );

  // indicators: actual for this week + trend vs prior week
  const indicatorRows = (goals ?? []).flatMap((g) =>
    (g.indicators ?? []).map(
      (ind: {
        name: string;
        weekly_target: number;
        indicator_entries: { week_start: string; actual: number }[];
      }) => {
        const entries = [...(ind.indicator_entries ?? [])].sort((a, b) =>
          a.week_start < b.week_start ? -1 : 1
        );
        const actual = entries.find((e) => e.week_start === thisMonday)?.actual ?? 0;
        const prev = entries.filter((e) => e.week_start < thisMonday).pop()?.actual;
        const trend =
          prev == null || actual === prev ? "flat" : actual > prev ? "up" : "down";
        return { name: ind.name, weekly_target: ind.weekly_target, actual, trend };
      }
    )
  );

  const projectRows = (projects ?? []).map((p) => ({
    name: p.name,
    status: p.status,
    tasks_done: (p.tasks ?? []).filter((t: { status: string }) => t.status === "done").length,
    tasks_open: (p.tasks ?? []).filter(
      (t: { status: string }) => t.status === "planned" || t.status === "scheduled"
    ).length,
  }));

  const minWeeksToTarget = Math.min(
    ...((goals ?? []).map((g) => weeksUntil(g.target_date)) ?? [99]),
    99
  );

  // ---- weekly review agent ----
  let reviewMarkdown: string | null = null;
  try {
    reviewMarkdown = await callClaude(
      WEEKLY_REVIEW_PROMPT,
      JSON.stringify({
        week_start: thisMonday,
        week_end: weekEndKey,
        founders: founderStats,
        goals: (goals ?? []).map((g) => ({
          outcome: g.outcome,
          target_date: g.target_date,
          status: g.status,
        })),
        indicators: indicatorRows,
        projects: projectRows,
        last_challenger_question: lastWeekly?.challenger_question ?? null,
        weeks_to_target: minWeeksToTarget,
      })
    );
  } catch (err) {
    reviewMarkdown = null;
  }

  // ---- planner agent ----
  let plan: PlannerResult | null = null;
  try {
    const plannerInput = {
      week_start: nextMonday,
      founders: (founders ?? []).map((f) => {
        const profile = Array.isArray(f.founder_profiles) ? f.founder_profiles[0] : f.founder_profiles;
        return {
          id: f.user_id,
          name: f.display_name,
          daily_ceiling_minutes: profile?.daily_ceiling_minutes ?? 300,
          energy_windows_summary: JSON.stringify(profile?.energy_windows ?? []),
        };
      }),
      goals: (goals ?? []).map((g) => ({
        outcome: g.outcome,
        target_date: g.target_date,
        weeks_remaining: weeksUntil(g.target_date),
        indicators: (g.indicators ?? []).map(
          (ind: {
            name: string;
            weekly_target: number;
            indicator_entries: { week_start: string; actual: number }[];
          }) => ({
            name: ind.name,
            weekly_target: ind.weekly_target,
            last_actual:
              [...(ind.indicator_entries ?? [])]
                .sort((a, b) => (a.week_start < b.week_start ? -1 : 1))
                .pop()?.actual ?? null,
          })
        ),
      })),
      projects: (projects ?? []).map((p) => {
        const goal = Array.isArray(p.goals) ? p.goals[0] : p.goals;
        const ownerName = (founders ?? []).find((f) => f.user_id === p.owner)?.display_name;
        return {
          id: p.id,
          name: p.name,
          goal_name: goal?.outcome ?? null,
          owner_name: ownerName ?? null,
          status: p.status,
          open_tasks: (p.tasks ?? [])
            .filter((t: { status: string }) => t.status === "planned" || t.status === "scheduled")
            .map((t: { id: string; title: string; estimate_minutes: number | null; energy: string; slip_count: number }) => ({
              id: t.id,
              title: t.title,
              estimate_minutes: t.estimate_minutes ?? 30,
              energy: t.energy,
              slip_count: t.slip_count,
            })),
        };
      }),
      last_week_summary: reviewMarkdown ?? "",
      anchor_commitments_last_week: (anchors ?? []).map((a) => {
        const fr = Array.isArray(a.founders) ? a.founders[0] : a.founders;
        return {
          founder_name: fr?.display_name ?? "",
          commitment: a.commitment,
          kept: a.kept,
        };
      }),
    };
    plan = extractJSON<PlannerResult>(await callClaude(PLANNER_PROMPT, JSON.stringify(plannerInput)));
  } catch {
    plan = null;
  }

  // extract challenger question from the review markdown (last section)
  const challenger =
    reviewMarkdown?.split("## The question")[1]?.trim().split("\n")[0] ?? null;

  // ---- persist on next Monday's weekly review row ----
  const { error } = await supabase.from("reviews").upsert(
    {
      type: "weekly",
      period_start: nextMonday,
      agent_summary: {
        review_markdown: reviewMarkdown,
        proposed_plan: plan,
        prepared_at: now.toISOString(),
        review_of_week: thisMonday,
      },
      challenger_question: challenger,
    },
    { onConflict: "type,period_start" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    review_ready: Boolean(reviewMarkdown),
    plan_ready: Boolean(plan),
    for_week: nextMonday,
  });
}
