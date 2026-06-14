// app/api/agent/route.ts — the assistant's turn.
// Runs the operating-partner agent (tool-use loop against Supabase),
// persists the exchange best-effort, and returns a fresh "glance" so the
// dashboard updates the moment the agent changes anything.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { runAgent, type ChatMessage } from "@/lib/agent";
import { todayISO, mondayOf } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });

async function glance(supabase: SupabaseClient, userId: string) {
  const today = todayISO();
  const monday = mondayOf(new Date());
  const [{ data: blocks }, { count: shipped }] = await Promise.all([
    supabase
      .from("schedule_blocks")
      .select("start_at, end_at, tasks(id, title, is_anchor, status)")
      .eq("founder_id", userId)
      .eq("block_date", today)
      .order("start_at"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("owner", userId)
      .eq("status", "done")
      .gte("completed_at", `${monday}T00:00:00`),
  ]);
  const list = (blocks ?? []).map((blk) => {
    const t = Array.isArray(blk.tasks) ? blk.tasks[0] : blk.tasks;
    return {
      time: fmtTime(blk.start_at),
      title: t?.title ?? "—",
      is_anchor: t?.is_anchor ?? false,
      done: t?.status === "done",
    };
  });
  const numberOne = list.find((b) => b.is_anchor && !b.done) ?? list.find((b) => !b.done) ?? null;
  return {
    dateLabel: new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" }),
    blocks: list,
    numberOne,
    shipped: shipped ?? 0,
  };
}

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { messages?: ChatMessage[] };
  const messages = (body.messages ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20);
  if (messages.length === 0) return NextResponse.json({ error: "no message" }, { status: 400 });

  let text = "";
  let actions: { kind: string; label: string; detail?: string }[] = [];
  try {
    const out = await runAgent(messages, { supabase, founder, now: new Date() });
    text = out.text;
    actions = out.actions;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const friendly = /ANTHROPIC_API_KEY|401|403/.test(msg)
      ? "I can't reach my reasoning engine — the ANTHROPIC_API_KEY looks missing or invalid. Add it to the environment and I'll be right here."
      : "Something hiccupped on my end. Give me another go in a moment.";
    return NextResponse.json({ text: friendly, actions: [], glance: await glance(supabase, founder.user_id) });
  }

  // Best-effort persistence — degrades silently if the table isn't there yet.
  try {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const rows = [];
    if (lastUser) rows.push({ founder_id: founder.user_id, role: "user", content: lastUser.content });
    rows.push({ founder_id: founder.user_id, role: "assistant", content: text });
    await supabase.from("agent_messages").insert(rows);
  } catch {
    /* no agent_messages table yet — conversation still works, just not saved */
  }

  return NextResponse.json({ text, actions, glance: await glance(supabase, founder.user_id) });
}
