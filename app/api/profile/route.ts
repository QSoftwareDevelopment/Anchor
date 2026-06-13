// app/api/profile/route.ts — GET own profile, PATCH editable fields.
// The scheduler's hard constraints (ceiling, windows, multipliers)
// finally get a UI; this is its data layer.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export async function GET() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("founder_profiles")
    .select("*")
    .eq("user_id", founder.user_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, display_name: founder.display_name });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const update: Record<string, unknown> = {};

  if (typeof body.daily_ceiling_minutes === "number") {
    // sane bounds: 1h–14h. The ceiling is a promise to yourself, not a dare.
    update.daily_ceiling_minutes = Math.min(840, Math.max(60, body.daily_ceiling_minutes));
  }
  if (typeof body.timezone === "string" && body.timezone) update.timezone = body.timezone;
  if ("phone" in body) update.phone = body.phone || null;
  if (Array.isArray(body.energy_windows)) {
    const valid = body.energy_windows.every(
      (w: { days?: unknown; start?: unknown; end?: unknown }) =>
        Array.isArray(w.days) &&
        typeof w.start === "string" &&
        typeof w.end === "string" &&
        /^\d{2}:\d{2}$/.test(w.start) &&
        /^\d{2}:\d{2}$/.test(w.end)
    );
    if (!valid)
      return NextResponse.json({ error: "invalid energy windows" }, { status: 400 });
    update.energy_windows = body.energy_windows;
  }
  if (body.multipliers && typeof body.multipliers === "object") {
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.multipliers)) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      cleaned[k] = Math.min(3, Math.max(0.5, n)); // clamp to sanity
    }
    if (!cleaned._default) cleaned._default = 1.5;
    update.multipliers = cleaned;
  }

  const { data, error } = await supabase
    .from("founder_profiles")
    .update(update)
    .eq("user_id", founder.user_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
