// app/team/page.tsx
// ============================================================
// TEAM — the partnership at a glance. Both founders side by side:
// what each is doing today, this week's anchor, what they've shipped,
// and their open work — with one-tap hand-off between partners.
// The "what is my partner doing / planning" surface.
// ============================================================
"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { formatTime, todayISO, mondayOf } from "@/lib/utils";

type Founder = { user_id: string; display_name: string };
type Blk = { id: string; start_at: string; tasks: { title: string; is_anchor: boolean; status: string } | null };
type OpenTask = { id: string; title: string; energy: string; estimate_minutes: number | null; is_anchor: boolean };
type FounderState = {
  founder: Founder;
  blocks: Blk[];
  anchor: string | null;
  shipped: number;
  open: OpenTask[];
};

const supabase = createBrowserSupabase();

export default function TeamPage() {
  const [me, setMe] = useState<string | null>(null);
  const [states, setStates] = useState<FounderState[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const today = todayISO();
  const monday = mondayOf(new Date());

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setMe(uid);

    const { data: founders } = await supabase.from("founders").select("user_id, display_name").order("display_name");
    const list = (founders as Founder[]) ?? [];

    const results = await Promise.all(
      list.map(async (f) => {
        const [{ data: blocks }, { data: anchor }, { count: shipped }, { data: open }] = await Promise.all([
          supabase.from("schedule_blocks").select("id, start_at, tasks(title, is_anchor, status)").eq("founder_id", f.user_id).eq("block_date", today).order("start_at"),
          supabase.from("anchor_commitments").select("commitment").eq("founder_id", f.user_id).eq("week_start", monday).maybeSingle(),
          supabase.from("tasks").select("id", { count: "exact", head: true }).eq("owner", f.user_id).eq("status", "done").gte("completed_at", `${monday}T00:00:00`),
          supabase.from("tasks").select("id, title, energy, estimate_minutes, is_anchor").eq("owner", f.user_id).in("status", ["planned", "scheduled"]).order("is_anchor", { ascending: false }).limit(8),
        ]);
        return {
          founder: f,
          blocks: (blocks as unknown as Blk[]) ?? [],
          anchor: anchor?.commitment ?? null,
          shipped: shipped ?? 0,
          open: (open as OpenTask[]) ?? [],
        };
      })
    );
    setStates(results);
    setLoading(false);
  }, [today, monday]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handOff(taskId: string, toId: string, toName: string) {
    setNote(`Handed to ${toName}.`);
    // optimistic: remove from current owner's open list
    setStates((prev) =>
      prev.map((st) => ({ ...st, open: st.open.filter((t) => t.id !== taskId) }))
    );
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: toId, status: "planned" }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setNote("Couldn't hand it off — refresh and try again.");
      await load();
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="h-7 w-40 animate-pulse rounded bg-qa-surface-2" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="h-80 animate-pulse rounded-qa bg-qa-surface" />
          <div className="h-80 animate-pulse rounded-qa bg-qa-surface" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="qa-eyebrow">The partnership</p>
          <h1 className="mt-0.5 text-2xl font-[650]">Team</h1>
        </div>
        {note && <span className="text-sm text-qa-accent qa-fade" role="status">{note}</span>}
      </div>
      <p className="mt-1 text-sm text-qa-text-2">Everyone&apos;s day, anchor, and open work — hand things off with one tap.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {states.map((st, i) => {
          const isMe = st.founder.user_id === me;
          const others = states.filter((o) => o.founder.user_id !== st.founder.user_id).map((o) => o.founder);
          return (
            <section
              key={st.founder.user_id}
              className={`qa-rise rounded-qa border p-5 ${isMe ? "qa-card-grad" : "border-qa-line bg-qa-glass"}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white"
                    style={{ background: "var(--qa-grad)" }}
                  >
                    {st.founder.display_name.charAt(0)}
                  </span>
                  <div>
                    <p className="font-[650] leading-tight">
                      {st.founder.display_name}
                      {isMe && <span className="ml-1.5 text-xs font-medium text-qa-text-3">you</span>}
                    </p>
                    <p className="text-xs text-qa-text-2">
                      <span className="font-semibold text-qa-text">{st.shipped}</span> shipped this week
                    </p>
                  </div>
                </div>
              </div>

              {/* anchor */}
              <div className="mt-4 rounded-qa-sm border border-qa-line bg-qa-glass px-3 py-2">
                <p className="qa-eyebrow text-qa-accent">Anchor this week</p>
                <p className="mt-0.5 text-sm">{st.anchor ?? <span className="text-qa-text-3">Not set yet.</span>}</p>
              </div>

              {/* today */}
              <div className="mt-4">
                <p className="qa-eyebrow mb-1.5">Today</p>
                {st.blocks.length === 0 ? (
                  <p className="text-sm text-qa-text-3">Nothing scheduled.</p>
                ) : (
                  <div className="space-y-1.5">
                    {st.blocks.map((b) => (
                      <div key={b.id} className="flex items-center gap-2.5 text-sm">
                        <span className="w-14 shrink-0 font-mono text-xs text-qa-text-3">{formatTime(b.start_at)}</span>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${b.tasks?.status === "done" ? "bg-qa-success" : "bg-qa-accent"}`} />
                        <span className={`min-w-0 flex-1 truncate ${b.tasks?.status === "done" ? "line-through text-qa-text-3" : ""}`}>
                          {b.tasks?.title ?? "—"}
                          {b.tasks?.is_anchor && <span className="ml-1 text-qa-accent">⚓</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* open work + hand-off */}
              <div className="mt-4 border-t border-qa-line pt-3">
                <p className="qa-eyebrow mb-1.5">Open work ({st.open.length})</p>
                {st.open.length === 0 ? (
                  <p className="text-sm text-qa-text-3">Clear.</p>
                ) : (
                  <div className="space-y-1.5">
                    {st.open.map((t) => (
                      <div key={t.id} className="group flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {t.title}
                          {t.is_anchor && <span className="ml-1 text-qa-accent">⚓</span>}
                          <span className="ml-1.5 font-mono text-xs text-qa-text-3">{t.estimate_minutes ?? 30}m</span>
                        </span>
                        {others.map((o) => (
                          <button
                            key={o.user_id}
                            onClick={() => handOff(t.id, o.user_id, o.display_name)}
                            className="shrink-0 rounded-full border border-qa-line-strong px-2 py-0.5 text-[11px] text-qa-text-2 opacity-0 transition-opacity hover:border-qa-accent hover:text-qa-accent focus-visible:opacity-100 group-hover:opacity-100"
                            title={`Hand to ${o.display_name}`}
                          >
                            → {o.display_name}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
