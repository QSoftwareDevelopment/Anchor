// app/api/resources/[id]/route.ts — PATCH edit, DELETE.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const update: Record<string, unknown> = {};
  for (const k of ["title", "url", "category", "notes"]) if (k in body) update[k] = body[k];

  const { data, error } = await supabase
    .from("resources")
    .update(update)
    .eq("id", params.id)
    .select("id, title, url, category, notes, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resource: data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("resources").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
