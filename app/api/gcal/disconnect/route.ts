// app/api/gcal/disconnect/route.ts — POST: forget the current founder's
// Google Calendar tokens. Existing synced events stay on Google (we just
// stop touching them); future plans won't push until reconnected.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export async function POST() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("gcal_tokens")
    .delete()
    .eq("user_id", founder.user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, connected: false });
}
