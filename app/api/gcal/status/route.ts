// app/api/gcal/status/route.ts — GET: is Google Calendar connected
// for the current founder? Used by Settings to show connect/disconnect.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("gcal_tokens")
    .select("calendar_id, updated_at")
    .eq("user_id", founder.user_id)
    .maybeSingle();

  return NextResponse.json({
    connected: Boolean(data),
    calendar_id: data?.calendar_id ?? null,
    connected_at: data?.updated_at ?? null,
  });
}
