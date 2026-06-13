// app/api/captures/[id]/route.ts — PATCH approve / redirect / dismiss
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import type { TriageResult } from "@/lib/agents";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    action: "approve" | "redirect" | "dismiss";
    overrides?: Partial<TriageResult>;
  };

  const { data: capture, error: capErr } = await supabase
    .from("captures")
    .select("*")
    .eq("id", params.id)
    .single();
  if (capErr || !capture)
    return NextResponse.json({ error: "capture not found" }, { status: 404 });

  if (body.action === "dismiss") {
    const { data, error } = await supabase
      .from("captures")
      .update({ state: "dismissed" })
      .eq("id", params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const triage: TriageResult = { ...(capture.triage ?? {}), ...(body.overrides ?? {}) };

  if (body.action === "redirect") {
    // Update the proposal, keep pending so the founder can re-approve
    const { data, error } = await supabase
      .from("captures")
      .update({ triage })
      .eq("id", params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // approve → create the task
  if (!triage.project_id) {
    return NextResponse.json(
      { error: "Pick a project before approving — the agent didn't find a match." },
      { status: 400 }
    );
  }

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert({
      project_id: triage.project_id,
      title: triage.title ?? capture.raw_text,
      owner: triage.owner ?? capture.captured_by,
      status: "planned",
      energy: triage.energy ?? "shallow",
      category: triage.category ?? "general",
      estimate_minutes: triage.estimate_minutes ?? 30,
      due_date: triage.suggested_date ?? null,
      notes: capture.raw_text,
      created_by: capture.captured_by,
    })
    .select()
    .single();
  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });

  const { data, error } = await supabase
    .from("captures")
    .update({ state: "approved", task_id: task.id, triage })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, task });
}
