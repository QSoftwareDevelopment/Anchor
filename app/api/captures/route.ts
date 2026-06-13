// app/api/captures/route.ts — POST new capture → triage agent
// The capture is saved FIRST, then triaged. A triage failure never
// fails the capture — the founder's thought is already safe.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { callClaude, extractJSON } from "@/lib/anthropic";
import { TRIAGE_PROMPT, type TriageResult } from "@/lib/agents";
import { todayISO } from "@/lib/utils";

export const maxDuration = 30;

export async function GET() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("captures")
    .select("*")
    .eq("state", "pending")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const rawText = String(body.raw_text ?? "").trim();
  if (!rawText) return NextResponse.json({ error: "empty capture" }, { status: 400 });

  // 1. Save the capture immediately
  const { data: capture, error: insErr } = await supabase
    .from("captures")
    .insert({ raw_text: rawText, captured_by: founder.user_id, source: "app" })
    .select()
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // 2. Context for the triage agent
  const [{ data: projects }, { data: founders }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, owner, goals(outcome), founders!projects_owner_fkey(display_name)")
      .eq("status", "active"),
    supabase.from("founders").select("user_id, display_name"),
  ]);

  // 3. Triage — agent errors are stored, never thrown to the founder
  let triage: TriageResult | { error: true; raw: string };
  try {
    const response = await callClaude(
      TRIAGE_PROMPT,
      JSON.stringify({
        raw_text: rawText,
        projects: (projects ?? []).map((p) => {
          const goal = Array.isArray(p.goals) ? p.goals[0] : p.goals;
          const ownerRow = Array.isArray(p.founders) ? p.founders[0] : p.founders;
          return {
            id: p.id,
            name: p.name,
            goal_name: goal?.outcome ?? null,
            owner_name: ownerRow?.display_name ?? null,
          };
        }),
        founders: (founders ?? []).map((f) => ({ id: f.user_id, name: f.display_name })),
        today: todayISO(),
        capturing_founder_id: founder.user_id,
      })
    );
    triage = extractJSON<TriageResult>(response);
  } catch (err) {
    triage = { error: true, raw: err instanceof Error ? err.message : String(err) };
  }

  // 4. Store the triage on the capture
  const { data: updated, error: upErr } = await supabase
    .from("captures")
    .update({ triage })
    .eq("id", capture.id)
    .select()
    .single();

  if (upErr) return NextResponse.json(capture); // capture is safe regardless
  return NextResponse.json(updated);
}
