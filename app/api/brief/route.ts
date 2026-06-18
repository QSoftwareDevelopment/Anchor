// app/api/brief/route.ts — GET: a concise, spoken-friendly daily briefing.
// Deterministic and warm (no LLM cost): your #1, your partner's focus + anchor,
// the next thing on the calendar, and what's at risk. Read aloud by the home.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder, listFounders } from "@/lib/supabase";
import { todayISO, mondayOf, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Blk = { start_at: string; tasks: { title: string; is_anchor: boolean; status: string } | null };
const one = (b: Blk[]) =>
  b.find((x) => x.tasks?.is_anchor && x.tasks.status !== "done") ?? b.find((x) => x.tasks?.status !== "done");
const eventDate = (iso: string, allDay: boolean) =>
  new Date(allDay ? `${iso.slice(0, 10)}T00:00:00` : iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

export async function GET() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = todayISO();
  const monday = mondayOf(new Date());
  const founders = await listFounders(supabase);
  const partner = founders.find((f) => f.user_id !== founder.user_id) ?? null;
  const nowISO = new Date().toISOString();

  const [{ data: myBlocks }, { data: theirBlocks }, { data: anchors }, { count: theirShipped }, { data: events }, { count: atRisk }] =
    await Promise.all([
      supabase.from("schedule_blocks").select("start_at, tasks(title, is_anchor, status)").eq("founder_id", founder.user_id).eq("block_date", today).order("start_at"),
      partner
        ? supabase.from("schedule_blocks").select("start_at, tasks(title, is_anchor, status)").eq("founder_id", partner.user_id).eq("block_date", today).order("start_at")
        : Promise.resolve({ data: [] }),
      supabase.from("anchor_commitments").select("founder_id, commitment").eq("week_start", monday),
      partner
        ? supabase.from("tasks").select("id", { count: "exact", head: true }).eq("owner", partner.user_id).eq("status", "done").gte("completed_at", `${monday}T00:00:00`)
        : Promise.resolve({ count: 0 }),
      supabase.from("calendar_events").select("title, start_at, all_day").eq("founder_id", founder.user_id).gte("start_at", nowISO).order("start_at").limit(1),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("owner", founder.user_id).gte("slip_count", 2).in("status", ["planned", "scheduled"]),
    ]);

  const norm = (rows: { start_at: string; tasks: unknown }[]) =>
    rows.map((r) => ({ start_at: r.start_at, tasks: Array.isArray(r.tasks) ? r.tasks[0] : r.tasks })) as Blk[];

  const hour = new Date().getHours();
  const timeWord = hour < 5 ? "you're up late" : hour < 12 ? "good morning" : hour < 18 ? "good afternoon" : "good evening";
  const dayLabel = new Date().toLocaleDateString("en-CA", { weekday: "long" });

  const parts: string[] = [`Hey ${founder.display_name}, ${timeWord}. It's ${dayLabel}.`];

  const mine = one(norm((myBlocks as unknown as { start_at: string; tasks: unknown }[]) ?? []));
  if (mine?.tasks) {
    parts.push(`Your number one is ${mine.tasks.title}${mine.start_at ? ` at ${formatTime(mine.start_at)}` : ""}.`);
  } else {
    parts.push(`Nothing's locked into your day yet — say the word and I'll plan it.`);
  }

  const ev = (events as { title: string; start_at: string; all_day: boolean }[] | null)?.[0];
  if (ev) {
    const when = ev.all_day
      ? `on ${eventDate(ev.start_at, true)}`
      : new Date(ev.start_at).toDateString() === new Date().toDateString()
        ? `at ${formatTime(ev.start_at)}`
        : `on ${eventDate(ev.start_at, false)}`;
    parts.push(`Next on the calendar: ${ev.title} ${when}.`);
  }

  if (partner) {
    const theirs = one(norm((theirBlocks as unknown as { start_at: string; tasks: unknown }[]) ?? []));
    const theirAnchor = (anchors ?? []).find((a) => a.founder_id === partner.user_id)?.commitment;
    if (theirs?.tasks) parts.push(`${partner.display_name} is focused on ${theirs.tasks.title}.`);
    else if (theirAnchor) parts.push(`${partner.display_name}'s anchor this week is ${theirAnchor}.`);
    if ((theirShipped ?? 0) > 0) parts.push(`They've shipped ${theirShipped} this week.`);
  }

  if ((atRisk ?? 0) > 0) {
    parts.push(`Heads up — ${atRisk} task${atRisk === 1 ? " has" : "s have"} slipped and need a decision.`);
  }

  parts.push(`That's the picture. What do you want to move first?`);

  return NextResponse.json({ text: parts.join(" "), greeting: `Hey ${founder.display_name}` });
}
