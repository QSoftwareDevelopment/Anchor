// app/api/anchors/route.ts — GET this week's anchors, POST set one
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { mondayOf } from "@/lib/utils";

export async function GET() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("anchor_commitments")
    .select("*, founders(display_name)")
    .eq("week_start", mondayOf(new Date()));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { data, error } = await supabase
    .from("anchor_commitments")
    .upsert(
      {
        week_start: body.week_start ?? mondayOf(new Date()),
        founder_id: body.founder_id ?? founder.user_id,
        commitment: body.commitment,
        task_id: body.task_id ?? null,
        kept: body.kept ?? null,
      },
      { onConflict: "week_start,founder_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
