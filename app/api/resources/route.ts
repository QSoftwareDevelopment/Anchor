// app/api/resources/route.ts — GET list, POST create. Shared links/docs hub.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("resources")
    .select("id, title, url, category, notes, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resources: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const { data, error } = await supabase
    .from("resources")
    .insert({
      title: body.title,
      url: body.url ?? null,
      category: body.category ?? "link",
      notes: body.notes ?? null,
      created_by: founder.user_id,
    })
    .select("id, title, url, category, notes, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resource: data });
}
