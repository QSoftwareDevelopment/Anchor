// app/calendar/page.tsx
// ============================================================
// CALENDAR — a month grid over the founder's scheduled task blocks
// and their events. Click any day to see it in detail and add an
// event (which syncs to Google Calendar when connected).
// ============================================================
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { formatTime } from "@/lib/utils";
import EventModal, { type CreatedEvent } from "@/components/event-modal";

type Block = {
  id: string;
  start_at: string;
  block_date: string;
  tasks: { title: string; is_anchor: boolean; status: string } | null;
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
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selected, setSelected] = useState<string>(() => isoDate(new Date()));
  const [me, setMe] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Ev | null>(null);
  const [gcal, setGcal] = useState(false);

  // 6-week grid starting from the Monday on/before the 1st
  const gridStart = useMemo(() => {
    const d = new Date(cursor);
    const offset = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - offset);
    return d;
  }, [cursor]);

  const gridDays = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [gridStart]
  );

  const rangeStart = isoDate(gridDays[0]);
  const rangeEnd = isoDate(gridDays[41]);

  const load = useCallback(
    async (uid: string) => {
      setLoading(true);
      const [{ data: blk }, evRes] = await Promise.all([
        supabase
          .from("schedule_blocks")
          .select("id, start_at, block_date, tasks(title, is_anchor, status)")
          .eq("founder_id", uid)
          .gte("block_date", rangeStart)
          .lte("block_date", rangeEnd)
          .order("start_at"),
        fetch(`/api/events?from=${rangeStart}T00:00:00&to=${rangeEnd}T23:59:59`).then((r) => r.json()).catch(() => ({ events: [] })),
      ]);
      setBlocks((blk as unknown as Block[]) ?? []);
      setEvents((evRes.events as Ev[]) ?? []);
      setLoading(false);
    },
    [rangeStart, rangeEnd]
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

  function shiftMonth(n: number) {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + n);
    setCursor(d);
  }

  function countFor(key: string) {
    const b = blocks.filter((x) => x.block_date === key).length;
    const e = events.filter((x) => x.start_at.slice(0, 10) === key).length;
    return { b, e, total: b + e };
  }

  function onCreated(ev: CreatedEvent, synced: boolean) {
    setEvents((es) => [...es, ev as Ev].sort((a, b) => a.start_at.localeCompare(b.start_at)));
    void synced;
  }
  function onUpdated(ev: CreatedEvent) {
    setEvents((es) => es.map((e) => (e.id === ev.id ? (ev as Ev) : e)).sort((a, b) => a.start_at.localeCompare(b.start_at)));
  }
  function onDeleted(id: string) {
    setEvents((es) => es.filter((e) => e.id !== id));
  }
  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(ev: Ev) {
    setEditing(ev);
    setModalOpen(true);
  }

  const todayKey = isoDate(new Date());
  const monthLabel = cursor.toLocaleDateString("en-CA", { month: "long", year: "numeric" });

  const selDate = new Date(selected + "T00:00:00");
  const selBlocks = blocks.filter((b) => b.block_date === selected);
  const selEvents = events.filter((e) => e.start_at.slice(0, 10) === selected);
  const selItems = [
    ...selEvents.map((e) => ({ kind: "event" as const, sort: e.start_at, e })),
    ...selBlocks.map((b) => ({ kind: "block" as const, sort: b.start_at, b })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="qa-eyebrow">Calendar</p>
          <h1 className="mt-0.5 text-2xl font-[650]">{monthLabel}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-qa-sm border border-qa-line-strong bg-qa-glass">
            <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="grid h-9 w-9 place-items-center text-qa-text-2 hover:text-qa-text">
              <Chevron dir="left" />
            </button>
            <button
              onClick={() => {
                const d = new Date();
                d.setDate(1);
                d.setHours(0, 0, 0, 0);
                setCursor(d);
                setSelected(isoDate(new Date()));
              }}
              className="border-x border-qa-line px-3 text-sm font-medium hover:text-qa-accent"
            >
              Today
            </button>
            <button onClick={() => shiftMonth(1)} aria-label="Next month" className="grid h-9 w-9 place-items-center text-qa-text-2 hover:text-qa-text">
              <Chevron dir="right" />
            </button>
          </div>
          <button onClick={openNew} className="qa-btn qa-btn-primary text-sm">
            + Event
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* month grid */}
        <div className="qa-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-qa-line">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-qa-text-3">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {gridDays.map((day, i) => {
              const key = isoDate(day);
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = key === todayKey;
              const isSel = key === selected;
              const { b, e, total } = countFor(key);
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`relative flex min-h-[64px] flex-col items-start gap-1 border-b border-r border-qa-line p-1.5 text-left transition-colors sm:min-h-[84px] ${
                    i % 7 === 6 ? "border-r-0" : ""
                  } ${isSel ? "bg-qa-accent-soft" : "hover:bg-qa-glass"} ${inMonth ? "" : "opacity-40"}`}
                >
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full text-xs font-[650] ${
                      isToday ? "bg-qa-accent text-white" : isSel ? "text-qa-accent" : "text-qa-text"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {total > 0 && (
                    <div className="mt-auto flex flex-wrap gap-1">
                      {b > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-qa-glass-2 px-1.5 py-0.5 text-[10px] text-qa-text-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-qa-accent" />
                          {b}
                        </span>
                      )}
                      {e > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-qa-glass-2 px-1.5 py-0.5 text-[10px] text-qa-text-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-qa-accent-2" />
                          {e}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* selected-day detail */}
        <aside className="qa-card h-fit p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="qa-eyebrow">{selDate.toLocaleDateString("en-CA", { weekday: "long" })}</p>
              <p className="text-lg font-[650]">{selDate.toLocaleDateString("en-CA", { month: "long", day: "numeric" })}</p>
            </div>
            <button onClick={openNew} aria-label="Add event to this day" className="grid h-8 w-8 place-items-center rounded-qa-sm border border-qa-line-strong text-qa-text-2 hover:text-qa-accent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {loading && <p className="text-sm text-qa-text-3">Loading…</p>}
            {!loading && selItems.length === 0 && <p className="text-sm text-qa-text-3">Nothing on this day. Add an event above.</p>}
            {selItems.map((it) =>
              it.kind === "event" ? (
                <button
                  key={`e${it.e.id}`}
                  onClick={() => openEdit(it.e)}
                  className="block w-full rounded-qa-sm border-l-2 border-qa-accent-2 bg-qa-glass px-3 py-2 text-left transition-colors hover:bg-qa-glass-2"
                  title="Edit event"
                >
                  <p className="text-sm font-medium">{it.e.title}</p>
                  <p className="font-mono text-xs text-qa-text-3">
                    {it.e.all_day ? "All day" : `${formatTime(it.e.start_at)} – ${formatTime(it.e.end_at)}`}
                    {it.e.location ? ` · ${it.e.location}` : ""}
                  </p>
                </button>
              ) : (
                <div key={`b${it.b.id}`} className="rounded-qa-sm border-l-2 border-qa-accent bg-qa-glass px-3 py-2">
                  <p className={`text-sm ${it.b.tasks?.status === "done" ? "line-through opacity-60" : "font-medium"}`}>
                    {it.b.tasks?.title ?? "—"}
                    {it.b.tasks?.is_anchor && <span className="ml-1 text-qa-accent">⚓</span>}
                  </p>
                  <p className="font-mono text-xs text-qa-text-3">{formatTime(it.b.start_at)}</p>
                </div>
              )
            )}
          </div>

          <div className="mt-4 flex items-center gap-3 border-t border-qa-line pt-3 text-[11px] text-qa-text-3">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-qa-accent" /> task block</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-qa-accent-2" /> event</span>
          </div>
        </aside>
      </div>

      <EventModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onCreated={onCreated}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
        event={editing as CreatedEvent | null}
        defaultDate={editing ? undefined : selected}
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
