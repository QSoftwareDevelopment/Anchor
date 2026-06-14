// app/page.tsx — the home is now the assistant. Server component:
// resolves the founder, builds today's glance, and hands off to the
// conversational dashboard.
import { redirect } from "next/navigation";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { todayISO, mondayOf } from "@/lib/utils";
import AssistantHome, { type Glance } from "@/components/assistant-home";

export const dynamic = "force-dynamic";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });

export default async function Home() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) redirect("/login");

  const today = todayISO();
  const monday = mondayOf(new Date());
  const [{ data: blocks }, { count: shipped }] = await Promise.all([
    supabase
      .from("schedule_blocks")
      .select("start_at, end_at, tasks(title, is_anchor, status)")
      .eq("founder_id", founder.user_id)
      .eq("block_date", today)
      .order("start_at"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("owner", founder.user_id)
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

  const glance: Glance = {
    dateLabel: new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" }),
    blocks: list,
    numberOne,
    shipped: shipped ?? 0,
  };

  return <AssistantHome founderName={founder.display_name} initialGlance={glance} />;
}
