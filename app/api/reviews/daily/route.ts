// app/api/reviews/daily/route.ts — POST evening shutdown.
// Saves the founder's responses, gathers the day's data, calls the
// daily Review Agent, returns the summary for immediate display.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { callClaude } from "@/lib/anthropic";
import { DAILY_REVIEW_PROMPT } from "@/lib/agents";
import { todayISO, formatTime } from "@/lib/utils";

export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    // strings (legacy) or {id, actual_minutes} objects
    done_confirmed: (string | { id: string; actual_minutes: number | null })[];
    blockers: string;
    notes: string;
  };
  const today = todayISO();

  // Confirm done tasks + record actual minutes (powers multiplier learning)
  const doneItems = (body.done_confirmed ?? []).map((d) =>
    typeof d === "string" ? { id: d, actual_minutes: null } : d
  );
  for (const item of doneItems) {
    const update: Record<string, unknown> = {};
    if (item.actual_minutes && item.actual_minutes > 0)
      update.actual_minutes = item.actual_minutes;
    const { data: cur } = await supabase
      .from("tasks")
      .select("status")
      .eq("id", item.id)
      .maybeSingle();
    if (cur && cur.status !== "done") {
      update.status = "done";
      update.completed_at = new Date().toISOString();
    }
    if (Object.keys(update).length > 0) {
      await supabase.from("tasks").update(update).eq("id", item.id);
    }
  }

  // Gather data for the agent
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);

  const [{ data: completed }, { data: slipped }, { data: tomorrowBlocks }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("title, category, estimate_minutes, actual_minutes")
        .eq("owner", founder.user_id)
        .eq("status", "done")
        .gte("completed_at", `${today}T00:00:00`)
        .lte("completed_at", `${today}T23:59:59`),
      // scheduled today but not done = slipped (neutral information)
      supabase
        .from("schedule_blocks")
        .select("tasks(title, slip_count, status)")
        .eq("founder_id", founder.user_id)
        .eq("block_date", today),
      supabase
        .from("schedule_blocks")
        .select("start_at, end_at, tasks(title)")
        .eq("founder_id", founder.user_id)
        .eq("block_date", tomorrowKey)
        .order("start_at"),
    ]);

  const slippedTasks = (slipped ?? [])
    .map((b) => (Array.isArray(b.tasks) ? b.tasks[0] : b.tasks))
    .filter(
      (t): t is { title: string; slip_count: number; status: string } =>
        Boolean(t) && t!.status !== "done" && t!.status !== "killed"
    )
    .map((t) => ({ title: t.title, slip_count: t.slip_count, reason_if_known: null }));

  // Call the Review Agent — failure degrades to a plain confirmation
  let summary: string;
  try {
    summary = await callClaude(
      DAILY_REVIEW_PROMPT,
      JSON.stringify({
        founder_name: founder.display_name,
        date: today,
        completed_tasks: completed ?? [],
        slipped_tasks: slippedTasks,
        blockers: body.blockers ?? "",
        tomorrow_blocks: (tomorrowBlocks ?? []).map((b) => {
          const t = Array.isArray(b.tasks) ? b.tasks[0] : b.tasks;
          return {
            title: t?.title ?? "—",
            start_time: formatTime(b.start_at),
            end_time: formatTime(b.end_at),
          };
        }),
      })
    );
  } catch {
    summary = `Day closed. ${completed?.length ?? 0} task${
      (completed?.length ?? 0) === 1 ? "" : "s"
    } done. Tomorrow's plan is on the Today screen in the morning.`;
  }

  // Persist responses + agent summary, keyed per founder inside the row
  const { data: existing } = await supabase
    .from("reviews")
    .select("id, agent_summary, responses")
    .eq("type", "daily")
    .eq("period_start", today)
    .maybeSingle();

  const mergedSummary = {
    ...((existing?.agent_summary as Record<string, unknown>) ?? {}),
    [founder.user_id]: {
      ...(((existing?.agent_summary as Record<string, Record<string, unknown>>) ?? {})[
        founder.user_id
      ] ?? {}),
      shutdown_summary: summary,
    },
  };
  const mergedResponses = {
    ...((existing?.responses as Record<string, unknown>) ?? {}),
    [founder.user_id]: {
      done_confirmed: body.done_confirmed,
      blockers: body.blockers,
      notes: body.notes,
    },
  };

  const { error } = await supabase.from("reviews").upsert(
    {
      type: "daily",
      period_start: today,
      agent_summary: mergedSummary,
      responses: mergedResponses,
    },
    { onConflict: "type,period_start" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ summary });
}
