// app/api/tasks/route.ts — GET list (filterable), POST create
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export async function GET(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  let query = supabase
    .from("tasks")
    .select("*, projects(name)")
    .order("created_at", { ascending: false });

  const projectId = url.searchParams.get("project_id");
  const owner = url.searchParams.get("owner");
  const week = url.searchParams.get("week_assigned");
  const status = url.searchParams.get("status");
  if (projectId) query = query.eq("project_id", projectId);
  if (owner) query = query.eq("owner", owner);
  if (week) query = query.eq("week_assigned", week);
  if (status) query = query.in("status", status.split(","));

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
    .from("tasks")
    .insert({
      project_id: body.project_id,
      title: body.title,
      owner: body.owner ?? founder.user_id,
      status: body.status ?? "planned",
      energy: body.energy ?? "shallow",
      category: body.category ?? "general",
      estimate_minutes: body.estimate_minutes ?? 30,
      due_date: body.due_date ?? null,
      week_assigned: body.week_assigned ?? null,
      is_anchor: body.is_anchor ?? false,
      notes: body.notes ?? null,
      created_by: founder.user_id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
