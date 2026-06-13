// app/api/tasks/[id]/route.ts — PATCH update/complete/kill, DELETE
// Killing a task is a PATCH to status 'killed' — a decision, not a delete.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = [
    "title", "project_id", "owner", "status", "energy", "category",
    "estimate_minutes", "actual_minutes", "due_date", "week_assigned",
    "is_anchor", "notes",
  ] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  // completing a task stamps completed_at; un-completing clears it
  if (body.status === "done") update.completed_at = new Date().toISOString();
  if (body.status && body.status !== "done") update.completed_at = null;

  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: Params) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("tasks").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
