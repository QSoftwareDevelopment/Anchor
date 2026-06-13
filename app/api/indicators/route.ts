// app/api/indicators/route.ts — GET by goal, POST create, PATCH entry upsert
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export async function GET(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const goalId = url.searchParams.get("goal_id");

  let query = supabase
    .from("indicators")
    .select("*, indicator_entries(week_start, actual)")
    .order("created_at");
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
    .from("indicators")
    .insert({
      goal_id: body.goal_id,
      name: body.name,
      weekly_target: body.weekly_target,
      unit: body.unit ?? "count",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH: upsert a weekly actual entry { indicator_id, week_start, actual }
export async function PATCH(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { data, error } = await supabase
    .from("indicator_entries")
    .upsert(
      {
        indicator_id: body.indicator_id,
        week_start: body.week_start,
        actual: body.actual,
      },
      { onConflict: "indicator_id,week_start" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
