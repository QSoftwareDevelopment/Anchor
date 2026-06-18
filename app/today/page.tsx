// app/today/page.tsx
// ============================================================
// TODAY — the daily brief. Home screen, <60-second interaction.
//
// Behavioral design (each choice is deliberate):
//  - Von Restorff / isolation effect: the #1 task is one isolated,
//    visually distinct hero. Everything else is quieter.
//  - Goal-gradient effect: a progress ring fills as the day's blocks
//    complete — the visible shrinking gap pulls you to finish.
//  - Progress principle (Amabile): a calm "this week shipped" line
//    keeps real progress in view. The strongest motivator is seeing
//    meaningful work move; we surface it without streaks or scores.
//  - Peak–end rule (Kahneman): finishing a task pops with a satisfying
//    micro-animation; a fully-done day ends on a warm close.
//  - Fresh-start effect (Dai/Milkman/Riis): after dark days you are
//    greeted clean — never handed a backlog.
//  - Fitts's Law: large, reachable tap targets, especially on mobile.
//  - Per-task "Not today": move one task without nuking the plan.
//
// No guilt anywhere: an empty day is a quiet outline, not a red zero.
// ============================================================
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import ProgressRing from "@/components/progress-ring";
import EventModal, { type CreatedEvent } from "@/components/event-modal";
import { formatTime, todayISO, mondayOf } from "@/lib/utils";

type Block = {
  id: string;
  start_at: string;
  end_at: string;
  tasks: {
    id: string;
    title: string;
    is_anchor: boolean;
    status: string;
    energy: "deep" | "shallow";
  } | null;
};
type Unplaced = { task_id: string; title: string; reason: string };
type TodayEvent = {
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

function dayStartISO(key: string) {
  return new Date(`${key}T00:00:00`).toISOString();
}
function dayEndISO(key: string) {
  return new Date(`${key}T23:59:59`).toISOString();
}

export default function TodayPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [events, setEvents] = useState<TodayEvent[]>([]);
  const [unplaced, setUnplaced] = useState<Unplaced[]>([]);

  // event add/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TodayEvent | null>(null);
  const [gcal, setGcal] = useState(false);
  const [partnerFlag, setPartnerFlag] = useState<{ name: string; commitment: string } | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // momentum
  const [weekShipped, setWeekShipped] = useState(0);
  const [weekTowardGoal, setWeekTowardGoal] = useState(0);
  const [daysDark, setDaysDark] = useState<number | null>(null);

  // interaction state
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [replanning, setReplanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const today = todayISO();

  async function loadBlocks(uid: string) {
    const { data } = await supabase
      .from("schedule_blocks")
      .select("id, start_at, end_at, tasks(id, title, is_anchor, status, energy)")
      .eq("founder_id", uid)
      .eq("block_date", today)
      .order("start_at");
    setBlocks((data as unknown as Block[]) ?? []);
  }

  async function loadEvents() {
    const res = await fetch(`/api/events?from=${encodeURIComponent(dayStartISO(today))}&to=${encodeURIComponent(dayEndISO(today))}`)
      .then((r) => r.json())
      .catch(() => ({ events: [] }));
    setEvents((res.events as TodayEvent[]) ?? []);
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }
      setMe(uid);
      await loadBlocks(uid);
      void loadEvents();
      fetch("/api/gcal/status").then((r) => r.json()).then((d) => setGcal(Boolean(d.connected))).catch(() => {});

      const monday = mondayOf(new Date());

      const [{ data: r }, { data: shipped }, { data: lastActive }, { data: anchors }] =
        await Promise.all([
          supabase
            .from("reviews")
            .select("agent_summary")
            .eq("type", "daily")
            .eq("period_start", today)
            .maybeSingle(),
          // this week's shipped work + how much of it moved a goal forward
          supabase
            .from("tasks")
            .select("id, projects(goal_id)")
            .eq("owner", uid)
            .eq("status", "done")
            .gte("completed_at", `${monday}T00:00:00`),
          // most recent day with any scheduled block — powers fresh-start
          supabase
            .from("schedule_blocks")
            .select("block_date")
            .eq("founder_id", uid)
            .lt("block_date", today)
            .order("block_date", { ascending: false })
            .limit(1),
          // partner's anchor THIS week (scoped so a stale one never resurfaces)
          supabase
            .from("anchor_commitments")
            .select("commitment, founder_id, founders(display_name)")
            .eq("week_start", monday)
            .neq("founder_id", uid)
            .limit(1),
        ]);

      setUnplaced(
        (r?.agent_summary as Record<string, { unplaced?: Unplaced[] }> | null)?.[uid]
          ?.unplaced ?? []
      );

      const shippedRows = (shipped as { projects: { goal_id: string | null } | { goal_id: string | null }[] | null }[]) ?? [];
      setWeekShipped(shippedRows.length);
      setWeekTowardGoal(
        shippedRows.filter((row) => {
          const p = Array.isArray(row.projects) ? row.projects[0] : row.projects;
          return Boolean(p?.goal_id);
        }).length
      );

      const last = (lastActive as { block_date: string }[] | null)?.[0]?.block_date;
      if (last) {
        const gap = Math.round(
          (new Date(today + "T00:00:00").getTime() - new Date(last + "T00:00:00").getTime()) /
            86_400_000
        );
        setDaysDark(gap);
      } else {
        setDaysDark(null);
      }

      const a = (anchors as
        | { commitment: string; founders: { display_name: string } | { display_name: string }[] | null }[]
        | null)?.[0];
      if (a) {
        const fr = Array.isArray(a.founders) ? a.founders[0] : a.founders;
        setPartnerFlag({ name: fr?.display_name ?? "Partner", commitment: a.commitment });
      }
      setLoading(false);
    })();
  }, [today]);

  async function markDone(taskId: string) {
    setJustDone((s) => new Set(s).add(taskId));
    setBlocks((bs) =>
      bs.map((b) =>
        b.tasks?.id === taskId ? { ...b, tasks: { ...b.tasks!, status: "done" } } : b
      )
    );
    setWeekShipped((n) => n + 1);
    await supabase
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", taskId);
  }

  async function moveTask(taskId: string, target: "tomorrow" | "later") {
    setMenuFor(null);
    // optimistic: drop the task's future blocks from today's view
    const now = Date.now();
    setBlocks((bs) =>
      bs.filter((b) => !(b.tasks?.id === taskId && new Date(b.start_at).getTime() >= now))
    );
    setNote(target === "tomorrow" ? "Moved to tomorrow." : "Set aside for later.");
    try {
      const res = await fetch("/api/schedule/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, target }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setNote("Couldn't move it — refresh and try again.");
      if (me) await loadBlocks(me);
    }
  }

  async function replanToday() {
    if (!me) return;
    setReplanning(true);
    setNote(null);
    try {
      const res = await fetch("/api/schedule/replan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      await loadBlocks(me);
      setNote(
        data.unplaced?.length > 0
          ? `Replanned. ${data.unplaced.length} task${data.unplaced.length === 1 ? "" : "s"} didn't fit — they'll surface tonight.`
          : "Replanned around the rest of your day."
      );
    } catch {
      setNote("Couldn't replan — try again in a minute.");
    }
    setReplanning(false);
  }

  // event handlers
  function onEventCreated(ev: CreatedEvent, synced: boolean) {
    setEvents((es) => [...es, ev as TodayEvent].sort((a, b) => a.start_at.localeCompare(b.start_at)));
    setNote(syncMessage("added", synced, gcal));
  }
  function onEventUpdated(ev: CreatedEvent, synced: boolean) {
    setEvents((es) => es.map((e) => (e.id === ev.id ? (ev as TodayEvent) : e)).sort((a, b) => a.start_at.localeCompare(b.start_at)));
    setNote(syncMessage("updated", synced, gcal));
  }
  function onEventDeleted(id: string) {
    setEvents((es) => es.filter((e) => e.id !== id));
    setNote("Event deleted.");
  }
  function openNewEvent() {
    setEditingEvent(null);
    setModalOpen(true);
  }
  function openEditEvent(ev: TodayEvent) {
    setEditingEvent(ev);
    setModalOpen(true);
  }

  const liveBlocks = useMemo(() => blocks.filter((b) => b.tasks), [blocks]);
  const doneCount = liveBlocks.filter((b) => b.tasks!.status === "done").length;
  const total = liveBlocks.length;
  const allDone = total > 0 && doneCount === total;

  // merged chronological timeline of task blocks + calendar events
  const timeline = useMemo(() => {
    const blockItems = liveBlocks.map((b) => ({ kind: "block" as const, sort: b.start_at, block: b }));
    const eventItems = events.map((e) => ({ kind: "event" as const, sort: e.start_at, ev: e }));
    return [...blockItems, ...eventItems].sort((a, b) => a.sort.localeCompare(b.sort));
  }, [liveBlocks, events]);

  const numberOne =
    liveBlocks.find((b) => b.tasks!.is_anchor && b.tasks!.status !== "done") ??
    liveBlocks.find((b) => b.tasks!.status !== "done");

  const dateLabel = new Date().toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <div className="h-4 w-40 animate-pulse rounded bg-qa-surface-2" />
        <div className="mt-4 h-32 animate-pulse rounded-qa bg-qa-surface" />
        <div className="mt-4 h-40 animate-pulse rounded-qa bg-qa-surface" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-8" onClick={() => menuFor && setMenuFor(null)}>
      <p className="qa-eyebrow">{dateLabel}</p>

      {/* ---------- HERO ---------- */}
      {numberOne?.tasks ? (
        <section className="qa-rise mt-3 rounded-qa border border-qa-accent/25 bg-qa-accent-soft p-5">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="qa-eyebrow text-qa-accent">Today&apos;s one thing</p>
              <h1 className="mt-1 text-[26px] font-[650] leading-tight">
                {numberOne.tasks.title}
                {numberOne.tasks.is_anchor && (
                  <span className="ml-2 align-middle text-xs font-semibold text-qa-accent">
                    anchor
                  </span>
                )}
              </h1>
              <p className="mt-1.5 font-mono text-sm text-qa-text-2">
                {formatTime(numberOne.start_at)} – {formatTime(numberOne.end_at)}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => markDone(numberOne.tasks!.id)} className="qa-btn qa-btn-primary">
                  Mark done
                </button>
                <MoveMenu
                  open={menuFor === numberOne.tasks.id}
                  onToggle={(e) => {
                    e.stopPropagation();
                    setMenuFor((m) => (m === numberOne.tasks!.id ? null : numberOne.tasks!.id));
                  }}
                  onMove={(t) => moveTask(numberOne.tasks!.id, t)}
                />
              </div>
            </div>
            {total > 0 && (
              <ProgressRing value={doneCount / total} size={68}>
                <span className="font-mono text-sm font-semibold">
                  {doneCount}/{total}
                </span>
              </ProgressRing>
            )}
          </div>
        </section>
      ) : (
        <section className="qa-rise mt-3 rounded-qa border border-qa-line bg-white p-6 text-center shadow-qa-sm">
          {allDone ? (
            <>
              <FullRingCheck />
              <h1 className="mt-3 text-xl font-[650]">That&apos;s the plan, done.</h1>
              <p className="mt-1 text-sm text-qa-text-2">
                {doneCount} shipped today. Close the day when you&apos;re ready.
              </p>
            </>
          ) : daysDark !== null && daysDark >= 3 ? (
            <>
              <h1 className="text-xl font-[650]">Welcome back.</h1>
              <p className="mt-1 text-sm text-qa-text-2">
                Clean slate — nothing piled up. Capture a thought above, or plan the day.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-[650]">Clear day.</h1>
              <p className="mt-1 text-sm text-qa-text-2">
                Nothing scheduled. Capture anything that comes up above.
              </p>
            </>
          )}
        </section>
      )}

      {/* ---------- MOMENTUM (progress principle) ---------- */}
      {weekShipped > 0 && (
        <p className="mt-3 px-1 text-sm text-qa-text-2">
          <span className="font-semibold text-qa-text">This week:</span> {weekShipped} shipped
          {weekTowardGoal > 0 && (
            <>
              {" · "}
              <span className="text-qa-accent">{weekTowardGoal}</span> moved a goal forward
            </>
          )}
        </p>
      )}

      {/* ---------- SCHEDULE (task blocks + events, merged by time) ---------- */}
      {timeline.length > 0 ? (
        <section className="mt-6">
          <div className="mb-1 flex items-center justify-between">
            <p className="qa-eyebrow">The day</p>
            <button onClick={openNewEvent} className="qa-chip">
              + Event
            </button>
          </div>
          {timeline.map((it) => {
            if (it.kind === "event") {
              const e = it.ev;
              return (
                <button
                  key={`e${e.id}`}
                  onClick={() => openEditEvent(e)}
                  className="group flex w-full items-center gap-3 border-t border-qa-line py-3 text-left transition-colors hover:bg-qa-glass/40"
                >
                  <span className="w-[74px] shrink-0 font-mono text-sm tabular-nums text-qa-text-2">
                    {e.all_day ? "all day" : formatTime(e.start_at)}
                  </span>
                  <span title="event" className="h-2 w-2 shrink-0 rounded-full bg-qa-accent-2" />
                  <span className="min-w-0 flex-1 text-[15px]">
                    {e.title}
                    {e.location && <span className="ml-2 text-xs text-qa-text-3">· {e.location}</span>}
                  </span>
                  <span className="rounded-full border border-qa-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-qa-text-3">
                    event
                  </span>
                </button>
              );
            }
            const b = it.block;
            const t = b.tasks!;
            const done = t.status === "done";
            const isNumberOne = numberOne?.tasks?.id === t.id;
            return (
              <div
                key={b.id}
                className="group flex items-center gap-3 border-t border-qa-line py-3"
                style={{ opacity: done ? 0.5 : 1 }}
              >
                <span className="w-[74px] shrink-0 font-mono text-sm tabular-nums text-qa-text-2">
                  {formatTime(b.start_at)}
                </span>
                <span
                  title={t.energy}
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    t.energy === "deep" ? "bg-qa-accent" : "border-[1.5px] border-qa-line-strong"
                  }`}
                />
                <span
                  className={`min-w-0 flex-1 text-[15px] ${done ? "line-through" : ""} ${
                    isNumberOne && !done ? "font-medium" : ""
                  }`}
                >
                  {t.title}
                </span>

                {!done && (
                  <div className="flex items-center gap-1">
                    <MoveMenu
                      open={menuFor === t.id}
                      compact
                      onToggle={(e) => {
                        e.stopPropagation();
                        setMenuFor((m) => (m === t.id ? null : t.id));
                      }}
                      onMove={(target) => moveTask(t.id, target)}
                    />
                    <button
                      onClick={() => markDone(t.id)}
                      aria-label={`Mark ${t.title} done`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-qa-sm border-[1.5px] border-qa-line-strong transition-colors hover:border-qa-accent hover:bg-white"
                    >
                      <span className="h-[18px] w-[18px] rounded-[5px]" />
                    </button>
                  </div>
                )}
                {done && (
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-qa-sm bg-qa-accent text-qa-accent-text ${
                      justDone.has(t.id) ? "animate-qa-pop" : ""
                    }`}
                    aria-hidden
                  >
                    <CheckIcon animate={justDone.has(t.id)} />
                  </span>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        !loading && (
          <div className="mt-6 flex justify-center">
            <button onClick={openNewEvent} className="qa-btn qa-btn-ghost text-sm">
              + Add an event
            </button>
          </div>
        )
      )}

      {/* ---------- REPLAN (a fresh start, never a failure) ---------- */}
      {liveBlocks.length > 0 && !allDone && (
        <section className="mt-5">
          <button onClick={replanToday} disabled={replanning} className="qa-btn qa-btn-ghost text-sm">
            {replanning ? "Replanning…" : "Day changed? Replan the rest"}
          </button>
        </section>
      )}

      {note && (
        <p className="mt-3 text-sm text-qa-text-2 qa-fade" role="status">
          {note}
        </p>
      )}

      {/* ---------- FLAGS — partner + unfit work. Neutral, no red. ---------- */}
      {(partnerFlag || unplaced.length > 0) && (
        <section className="mt-7 rounded-qa bg-qa-surface p-4 text-sm">
          {partnerFlag && (
            <p className="m-0">
              <span className="font-semibold">{partnerFlag.name}&apos;s anchor this week:</span>{" "}
              {partnerFlag.commitment}
            </p>
          )}
          {unplaced.map((u) => (
            <p key={u.task_id} className="mt-2">
              <span className="font-semibold">Didn&apos;t fit today:</span> {u.title} — {u.reason}
            </p>
          ))}
        </section>
      )}

      <EventModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingEvent(null); }}
        onCreated={onEventCreated}
        onUpdated={onEventUpdated}
        onDeleted={onEventDeleted}
        event={editingEvent as CreatedEvent | null}
        defaultDate={editingEvent ? undefined : today}
        gcalConnected={gcal}
      />
    </div>
  );
}

/* ---------- small inline pieces ---------- */

function CheckIcon({ animate }: { animate?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5 10 17.5 19 6.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? "qa-check-path" : ""}
      />
    </svg>
  );
}

function syncMessage(action: "added" | "updated", synced: boolean, connected: boolean) {
  if (synced) return `Event ${action} and synced to Google Calendar.`;
  if (connected) return `Event ${action} in Anchor. Google sync needs attention.`;
  return `Event ${action} in Anchor. Connect Google Calendar to sync future events.`;
}

function FullRingCheck() {
  return (
    <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-qa-success-soft text-qa-success qa-pop">
      <CheckIcon animate />
    </div>
  );
}

// "Not today" — moves a single task without disturbing the rest.
// Autonomy (Self-Determination Theory): a low-cost override the founder
// controls, instead of an all-or-nothing replan.
function MoveMenu({
  open,
  onToggle,
  onMove,
  compact,
}: {
  open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onMove: (target: "tomorrow" | "later") => void;
  compact?: boolean;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-label="Move this task"
        aria-expanded={open}
        className={
          compact
            ? "grid h-9 w-9 place-items-center rounded-qa-sm text-qa-text-2 opacity-0 transition-opacity hover:bg-qa-surface focus-visible:opacity-100 group-hover:opacity-100"
            : "qa-btn qa-btn-ghost px-3 py-2 text-sm"
        }
      >
        {compact ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        ) : (
          "Not today"
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-qa-sm border border-qa-line bg-white py-1 shadow-qa-lg qa-fade"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onMove("tomorrow")}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-qa-surface"
          >
            Tomorrow
          </button>
          <button
            onClick={() => onMove("later")}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-qa-surface"
          >
            Later
          </button>
        </div>
      )}
    </div>
  );
}
