// app/api/schedule/move/route.ts
// POST — move ONE task off today, without disturbing the rest of the
// plan. The complement to /api/schedule/replan (which rebuilds the
// whole day): here the founder says "not this one, not today" and only
// that task moves.
//
// This is the granular control the daily loop was missing — previously
// the only lever was replan-everything. One-tap, reversible-feeling,
// and honest: the task goes back in the pool, it is not crammed elsewhere.
//
// Hard rules preserved:
//  - only THIS task's own future blocks today are removed
//  - only agent-tagged GCal events are deleted (real meetings untouched)
//  - week_assigned is left alone, so moving within the week is NOT
//    counted as a slip (fresh starts, not backlogs)
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { deleteEvent } from "@/lib/gcal";
import { todayISO } from "@/lib/utils";

export const maxDuration = 30;

type Body = { task_id?: string; target?: "tomorrow" | "later" };

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { task_id, target = "tomorrow" } = (await req.json()) as Body;
  if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 });

  const now = new Date();
  const today = todayISO();

  // The task's future blocks for the current founder today.
  const { data: blocks } = await supabase
    .from("schedule_blocks")
    .select("id, start_at, gcal_event_id")
    .eq("founder_id", founder.user_id)
    .eq("task_id", task_id)
    .eq("block_date", today);

  const futureBlocks = (blocks ?? []).filter((b) => new Date(b.start_at) >= now);

  // Best-effort: pull this calendar's events for any removed blocks.
  if (futureBlocks.some((b) => b.gcal_event_id)) {
    const { data: tokenRow } = await supabase
      .from("gcal_tokens")
      .select("refresh_token, calendar_id")
      .eq("user_id", founder.user_id)
      .maybeSingle();
    if (tokenRow) {
      for (const b of futureBlocks) {
        if (!b.gcal_event_id) continue;
        try {
          await deleteEvent(tokenRow, b.gcal_event_id);
        } catch {
          // 410/network — the block row removal below is the source of truth
        }
      }
    }
  }

  if (futureBlocks.length > 0) {
    await supabase
      .from("schedule_blocks")
      .delete()
      .in(
        "id",
        futureBlocks.map((b) => b.id)
      );
  }

  // Put the task back in the pool. due_date biases where the scheduler
  // places it next; week_assigned is deliberately untouched.
  const update: Record<string, unknown> = { status: "planned" };
  if (target === "tomorrow") {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    update.due_date = `${y}-${m}-${d}`;
  } else {
    update.due_date = null; // "later" — no urgency, no backlog pressure
  }

  const { error } = await supabase.from("tasks").update(update).eq("id", task_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    target,
    removed_blocks: futureBlocks.length,
  });
}
