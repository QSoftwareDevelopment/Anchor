// app/api/projects/route.ts — GET list, POST create
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export async function GET(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const goalId = url.searchParams.get("goal_id");

  let query = supabase
    .from("projects")
    .select("*, goals(outcome), tasks(id, status)")
    .order("created_at", { ascending: false });
  if (goalId) query = query.eq("goal_id", goalId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      goal_id: body.goal_id ?? null,
      name: body.name,
      owner: body.owner ?? founder.user_id,
      premortem: body.premortem ?? null,
      kill_criteria: body.kill_criteria ?? null,
      kill_date: body.kill_date ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
