// app/page.tsx — the home is the Jarvis command center. Server component:
// resolves the founder, assembles a rich glance (their day, their partner,
// the week, what's at risk, upcoming events) and hands off to the
// conversational dashboard.
import { redirect } from "next/navigation";
import { createServerSupabase, currentFounder, listFounders } from "@/lib/supabase";
import { todayISO, mondayOf } from "@/lib/utils";
import AssistantHome, { type Glance } from "@/components/assistant-home";

export const dynamic = "force-dynamic";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
const fmtEventDate = (iso: string, allDay: boolean) =>
  new Date(allDay ? `${iso.slice(0, 10)}T00:00:00` : iso).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });

type Blk = { start_at: string; tasks: { title: string; is_anchor: boolean; status: string } | null };
const normBlocks = (rows: { start_at: string; tasks: unknown }[] | null) =>
  (rows ?? []).map((blk) => ({
    start_at: blk.start_at,
    tasks: (Array.isArray(blk.tasks) ? blk.tasks[0] : blk.tasks) as Blk["tasks"],
  }));

export default async function Home() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) redirect("/login");

  const today = todayISO();
  const monday = mondayOf(new Date());
  const nowISO = new Date().toISOString();
  const founders = await listFounders(supabase);
  const partner = founders.find((f) => f.user_id !== founder.user_id) ?? null;

  const [
    { data: blocks },
    { count: shipped },
    { data: partnerBlocks },
    { data: anchors },
    { count: partnerShipped },
    { data: events },
    { count: atRisk },
    { data: gcal },
  ] = await Promise.all([
    supabase.from("schedule_blocks").select("start_at, end_at, tasks(title, is_anchor, status)").eq("founder_id", founder.user_id).eq("block_date", today).order("start_at"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("owner", founder.user_id).eq("status", "done").gte("completed_at", `${monday}T00:00:00`),
    partner
      ? supabase.from("schedule_blocks").select("start_at, tasks(title, is_anchor, status)").eq("founder_id", partner.user_id).eq("block_date", today).order("start_at")
      : Promise.resolve({ data: [] }),
    supabase.from("anchor_commitments").select("founder_id, commitment").eq("week_start", monday),
    partner
      ? supabase.from("tasks").select("id", { count: "exact", head: true }).eq("owner", partner.user_id).eq("status", "done").gte("completed_at", `${monday}T00:00:00`)
      : Promise.resolve({ count: 0 }),
    supabase.from("calendar_events").select("title, start_at, all_day").eq("founder_id", founder.user_id).gte("start_at", nowISO).order("start_at").limit(3),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("owner", founder.user_id).gte("slip_count", 2).in("status", ["planned", "scheduled"]),
    supabase.from("gcal_tokens").select("user_id").eq("user_id", founder.user_id).maybeSingle(),
  ]);

  const list = normBlocks(blocks as { start_at: string; tasks: unknown }[]).map((blk) => ({
    time: fmtTime(blk.start_at),
    title: blk.tasks?.title ?? "—",
    is_anchor: blk.tasks?.is_anchor ?? false,
    done: blk.tasks?.status === "done",
  }));
  const numberOne = list.find((b) => b.is_anchor && !b.done) ?? list.find((b) => !b.done) ?? null;

  // partner glance
  const pBlocks = normBlocks(partnerBlocks as { start_at: string; tasks: unknown }[]);
  const pOne = pBlocks.find((b) => b.tasks?.is_anchor && b.tasks.status !== "done") ?? pBlocks.find((b) => b.tasks?.status !== "done");
  const partnerGlance = partner
    ? {
        name: partner.display_name,
        numberOne: pOne?.tasks?.title ?? null,
        anchor: (anchors ?? []).find((a) => a.founder_id === partner.user_id)?.commitment ?? null,
        shipped: partnerShipped ?? 0,
      }
    : null;

  const upcoming = ((events as { title: string; start_at: string; all_day: boolean }[]) ?? []).map((e) => ({
    title: e.title,
    when: e.all_day ? "all day" : fmtTime(e.start_at),
    date: fmtEventDate(e.start_at, e.all_day),
  }));

  const glance: Glance = {
    dateLabel: new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" }),
    blocks: list,
    numberOne,
    shipped: shipped ?? 0,
    atRisk: atRisk ?? 0,
    partner: partnerGlance,
    upcoming,
    calendarConnected: Boolean(gcal),
  };

  return <AssistantHome founderName={founder.display_name} initialGlance={glance} />;
}
