// app/api/contacts/[id]/route.ts — PATCH edit (stage, next step, etc.), DELETE.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

type Params = { params: { id: string } };
const FIELDS = "id, name, company, email, phone, stage, owner, last_touch, next_step, next_step_date, notes, created_at";

export async function PATCH(req: Request, { params }: Params) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const update: Record<string, unknown> = {};
  for (const k of ["name", "company", "email", "phone", "stage", "owner", "last_touch", "next_step", "next_step_date", "notes"]) {
    if (k in body) update[k] = body[k];
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(update)
    .eq("id", params.id)
    .select(FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("contacts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
