// app/api/contacts/route.ts — GET list, POST create. Clients & leads CRM.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FIELDS = "id, name, company, email, phone, stage, owner, last_touch, next_step, next_step_date, notes, created_at";

export async function GET() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("contacts")
    .select(FIELDS)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      name: body.name,
      company: body.company ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      stage: body.stage ?? "lead",
      owner: body.owner ?? founder.user_id,
      last_touch: body.last_touch ?? null,
      next_step: body.next_step ?? null,
      next_step_date: body.next_step_date ?? null,
      notes: body.notes ?? null,
      created_by: founder.user_id,
    })
    .select(FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}
