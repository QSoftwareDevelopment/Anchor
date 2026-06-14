// app/api/agent/history/route.ts — load the saved conversation.
// Returns [] if the agent_messages table doesn't exist yet, so the
// assistant works before the migration is run.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ messages: [] });

  try {
    const { data, error } = await supabase
      .from("agent_messages")
      .select("role, content, created_at")
      .eq("founder_id", founder.user_id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return NextResponse.json({ messages: [] });
    return NextResponse.json({
      messages: (data ?? []).map((m) => ({ role: m.role, content: m.content })),
    });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}
