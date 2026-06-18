// app/week/page.tsx
// ============================================================
// WEEK — a seven-day board of the founder's scheduled deep/shallow
// blocks and their calendar events, side by side. Navigate weeks,
// plan the whole week into energy windows in one tap, and drop in
// events that sync to Google Calendar.
// ============================================================
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { formatTime, mondayOf } from "@/lib/utils";
import EventModal, { type CreatedEvent } from "@/components/event-modal";

type Block = {
  id: string;
  start_at: string;
  end_at: string;
  block_date: string;
  tasks: { id: string; title: string; is_anchor: boolean; status: string; energy: "deep" | "shallow" } | null;
};
type Ev = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  category?: string;
};

const supabase = createBrowserSupabase();
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayStartISO(key: string) {
  return new Date(`${key}T00:00:00`).toISOString();
}
function dayEndISO(key: string) {
  return new Date(`${key}T23:59:59`).toISOString();
}
function eventDayKey(ev: Pick<Ev, "start_at" | "all_day">) {
  return ev.all_day ? ev.start_at.slice(0, 10) : isoDate(new Date(ev.start_at));
}

export default function WeekPage() {
  const [monday, setMonday] = useState<string>(() => mondayOf(new Date()));
  const [me, setMe] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<Ev | null>(null);
  const [gcal, setGcal] = useState(false);

  const days = useMemo(() => {
    return DAY_NAMES.map((_, i) => {
      const d = new Date(monday + "T00:00:00");
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [monday]);

  const weekEnd = useMemo(() => {
    const d = new Date(monday + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return isoDate(d);
  }, [monday]);

  const load = useCallback(
    async (uid: string) => {
      setLoading(true);
      const [{ data: blk }, evRes] = await Promise.all([
        supabase
          .from("schedule_blocks")
          .select("id, start_at, end_at, block_date, tasks(id, title, is_anchor, status, energy)")
          .eq("founder_id", uid)
          .gte("block_date", monday)
          .lte("block_date", weekEnd)
          .order("start_at"),
        fetch(`/api/events?from=${encodeURIComponent(dayStartISO(monday))}&to=${encodeURIComponent(dayEndISO(weekEnd))}`).then((r) => r.json()).catch(() => ({ events: [] })),
      ]);
      setBlocks((blk as unknown as Block[]) ?? []);
      setEvents((evRes.events as Ev[]) ?? []);
      setLoading(false);
    },
    [monday, weekEnd]
  );

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return setLoading(false);
      setMe(uid);
      fetch("/api/gcal/status").then((r) => r.json()).then((d) => setGcal(Boolean(d.connected))).catch(() => {});
    })();
  }, []);

  useEffect(() => {
    if (me) void load(me);
  }, [me, load]);

  function shift(weeks: number) {
    const d = new Date(monday + "T00:00:00");
    d.setDate(d.getDate() + weeks * 7);
    setMonday(mondayOf(d));
    setNote(null);
  }

  async function planWeek() {
    setPlanning(true);
    setNote(null);
    try {
      const res = await fetch("/api/schedule/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "week", week_start: monday }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      if (me) await load(me);
      setNote(
        `Planned ${data.placed} block${data.placed === 1 ? "" : "s"} across the week` +
          (data.unplaced?.length ? ` · ${data.unplaced.length} didn't fit` : "") +
          "."
      );
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "Couldn't plan the week.");
    }
    setPlanning(false);
  }

  function onCreated(ev: CreatedEvent, synced: boolean) {
    setEvents((es) => [...es, ev as Ev].sort((a, b) => a.start_at.localeCompare(b.start_at)));
    setNote(synced ? "Event added and synced to Google Calendar." : "Event added.");
  }
  function onUpdated(ev: CreatedEvent, synced: boolean) {
    setEvents((es) => es.map((e) => (e.id === ev.id ? (ev as Ev) : e)).sort((a, b) => a.start_at.localeCompare(b.start_at)));
    setNote(syncMessage("updated", synced, gcal));
  }
  function onDeleted(id: string) {
    setEvents((es) => es.filter((e) => e.id !== id));
    setNote("Event deleted.");
  }
  function openNew(d?: string) {
    setEditing(null);
    setModalDate(d);
    setModalOpen(true);
  }
  function openEdit(ev: Ev) {
    setEditing(ev);
    setModalOpen(true);
  }

  const todayKey = isoDate(new Date());
  const monthLabel = days[0].toLocaleDateString("en-CA", { month: "long", year: "numeric" });
  const shippedThisWeek = blocks.filter((b) => b.tasks?.status === "done").length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="qa-eyebrow">Week of {days[0].toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</p>
          <h1 className="mt-0.5 text-2xl font-[650]">{monthLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-qa-sm border border-qa-line-strong bg-qa-glass">
            <button onClick={() => shift(-1)} aria-label="Previous week" className="grid h-9 w-9 place-items-center text-qa-text-2 hover:text-qa-text">
              <Chevron dir="left" />
            </button>
            <button onClick={() => setMonday(mondayOf(new Date()))} className="border-x border-qa-line px-3 text-sm font-medium hover:text-qa-accent">
              This week
            </button>
            <button onClick={() => shift(1)} aria-label="Next week" className="grid h-9 w-9 place-items-center text-qa-text-2 hover:text-qa-text">
              <Chevron dir="right" />
            </button>
          </div>
          <button onClick={() => openNew()} className="qa-btn qa-btn-ghost text-sm">
            + Event
          </button>
          <button onClick={planWeek} disabled={planning} className="qa-btn qa-btn-primary text-sm">
            {planning ? "Planning…" : "Plan week"}
          </button>
        </div>
      </div>

      {(shippedThisWeek > 0 || note) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-qa-text-2">
          {shippedThisWeek > 0 && (
            <span><span className="font-semibold text-qa-text">{shippedThisWeek}</span> shipped this week</span>
          )}
          {note && <span className="text-qa-accent qa-fade" role="status">{note}</span>}
        </div>
      )}

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {DAY_NAMES.map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-qa bg-qa-surface" />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7">
          {days.map((day, i) => {
            const key = isoDate(day);
            const isToday = key === todayKey;
            const dayBlocks = blocks.filter((b) => b.block_date === key);
            const dayEvents = events.filter((e) => eventDayKey(e) === key);
            const items = [
              ...dayEvents.map((e) => ({ kind: "event" as const, sort: e.start_at, e })),
              ...dayBlocks.map((b) => ({ kind: "block" as const, sort: b.start_at, b })),
            ].sort((a, b) => a.sort.localeCompare(b.sort));

            return (
              <div
                key={key}
                className={`qa-rise flex min-h-[180px] flex-col rounded-qa border p-2.5 ${
                  isToday ? "border-qa-accent/45 bg-qa-accent-soft" : "border-qa-line bg-qa-glass"
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <button
                  onClick={() => openNew(key)}
                  className="group flex items-center justify-between rounded-qa-sm px-1 py-0.5 text-left"
                  title="Add event"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-qa-text-2">{DAY_NAMES[i]}</span>
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-sm font-[650] ${isToday ? "bg-qa-accent text-white" : "text-qa-text"}`}>
                    {day.getDate()}
                  </span>
                </button>

                <div className="mt-2 flex-1 space-y-1.5">
                  {items.length === 0 && <p className="px-1 pt-2 text-xs text-qa-text-3">—</p>}
                  {items.map((it) =>
                    it.kind === "event" ? (
                      <button
                        key={`e${it.e.id}`}
                        onClick={() => openEdit(it.e)}
                        className="block w-full rounded-qa-sm border-l-2 border-qa-accent-2 bg-qa-glass-2 px-2 py-1.5 text-left transition-colors hover:bg-qa-glass"
                        title="Edit event"
                      >
                        <p className="truncate text-xs font-medium">{it.e.title}</p>
                        <p className="font-mono text-[10px] text-qa-text-3">
                          {it.e.all_day ? "all day" : formatTime(it.e.start_at)}
                        </p>
                      </button>
                    ) : (
                      <div
                        key={`b${it.b.id}`}
                        className={`rounded-qa-sm border-l-2 px-2 py-1.5 ${
                          it.b.tasks?.status === "done" ? "border-qa-success/60 opacity-60" : "border-qa-accent bg-qa-glass-2"
                        }`}
                      >
                        <p className={`truncate text-xs ${it.b.tasks?.status === "done" ? "line-through" : "font-medium"}`}>
                          {it.b.tasks?.title ?? "—"}
                          {it.b.tasks?.is_anchor && <span className="ml-1 text-qa-accent">⚓</span>}
                        </p>
                        <p className="font-mono text-[10px] text-qa-text-3">{formatTime(it.b.start_at)}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EventModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onCreated={onCreated}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
        event={editing as CreatedEvent | null}
        defaultDate={editing ? undefined : modalDate}
        gcalConnected={gcal}
      />
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}

function syncMessage(action: "updated", synced: boolean, connected: boolean) {
  if (synced) return `Event ${action} and synced to Google Calendar.`;
  if (connected) return `Event ${action} in Anchor. Google sync needs attention.`;
  return `Event ${action} in Anchor. Connect Google Calendar to sync future events.`;
}
