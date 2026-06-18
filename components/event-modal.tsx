// components/event-modal.tsx
// A premium add/edit for calendar events. Posts to /api/events (or
// PATCH/DELETE /api/events/[id] when editing), which mirrors changes to
// Google Calendar when connected. Reused by Calendar, Week, Today, and
// the command palette.
"use client";

import { useEffect, useRef, useState } from "react";

export type CreatedEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  category?: string;
  gcal_event_id?: string | null;
};

const CATEGORIES = ["event", "meeting", "call", "personal", "deep"];

const pad = (n: number) => String(n).padStart(2, "0");
function localParts(iso: string) {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
function localInstant(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

export default function EventModal({
  open,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
  defaultDate,
  event,
  gcalConnected,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (e: CreatedEvent, synced: boolean) => void;
  onUpdated?: (e: CreatedEvent, synced: boolean) => void;
  onDeleted?: (id: string) => void;
  defaultDate?: string; // YYYY-MM-DD
  event?: CreatedEvent | null; // when set, the modal edits this event
  gcalConnected?: boolean;
}) {
  const editing = Boolean(event);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("event");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (event) {
      const s = event.all_day ? { date: event.start_at.slice(0, 10), time: "09:00" } : localParts(event.start_at);
      const e = event.all_day ? { date: event.end_at.slice(0, 10), time: "10:00" } : localParts(event.end_at);
      setTitle(event.title);
      setDate(s.date);
      setStart(s.time);
      setEnd(e.time);
      setAllDay(event.all_day);
      setLocation(event.location ?? "");
      setNotes(event.notes ?? "");
      setCategory(event.category ?? "event");
    } else {
      setTitle("");
      setDate(defaultDate ?? new Date().toISOString().slice(0, 10));
      setStart("09:00");
      setEnd("10:00");
      setAllDay(false);
      setLocation("");
      setNotes("");
      setCategory("event");
    }
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [open, event, defaultDate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give it a name.");
      return;
    }
    setBusy(true);
    setError(null);

    let start_at = `${date}T00:00:00.000Z`;
    let end_at = `${date}T23:59:59.000Z`;
    if (!allDay) {
      const startMs = new Date(`${date}T${start}:00`).getTime();
      const endMs = new Date(`${date}T${end}:00`).getTime();
      if (endMs <= startMs) {
        setError("End time must be after start time.");
        return;
      }
      start_at = localInstant(date, start);
      end_at = localInstant(date, end);
    }
    const payload = {
      title: title.trim(),
      start_at,
      end_at,
      all_day: allDay,
      location: location.trim() || null,
      notes: notes.trim() || null,
      category,
    };

    try {
      if (editing && event) {
        const res = await fetch(`/api/events/${event.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "failed");
        onUpdated?.(data.event ?? { ...event, ...payload }, Boolean(data.synced));
      } else {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "failed");
        onCreated?.(data.event, data.synced);
      }
      onClose();
    } catch {
      setError("Couldn't save the event. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDeleted?.(event.id);
      onClose();
    } catch {
      setError("Couldn't delete. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={editing ? "Edit event" : "Add event"}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm qa-fade" onClick={onClose} />
      <div className="qa-pop-in qa-card-grad relative z-10 w-full max-w-md p-5 shadow-qa-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-[650]">{editing ? "Edit event" : "New event"}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-qa-sm text-qa-text-2 hover:bg-qa-glass">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            ref={titleRef}
            className="qa-input"
            placeholder="What's the event?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="flex gap-2">
            <input type="date" className="qa-input flex-1" value={date} onChange={(e) => setDate(e.target.value)} />
            <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-qa-sm border border-qa-line-strong bg-qa-glass px-3 text-sm">
              <input type="checkbox" className="accent-[var(--qa-accent)]" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              All day
            </label>
          </div>

          {!allDay && (
            <div className="flex items-center gap-2">
              <input type="time" className="qa-input flex-1 font-mono" value={start} onChange={(e) => setStart(e.target.value)} />
              <span className="text-qa-text-2">to</span>
              <input type="time" className="qa-input flex-1 font-mono" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`qa-chip ${category === c ? "qa-chip-on" : ""}`}
              >
                {c}
              </button>
            ))}
          </div>

          <input className="qa-input" placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <textarea
            className="qa-input min-h-[64px] resize-none"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {error && <p className="text-sm text-qa-warn">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            {editing ? (
              <button type="button" onClick={remove} disabled={deleting} className="text-sm font-medium text-qa-warn hover:underline disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            ) : (
              <span className="text-xs text-qa-text-3">
                {gcalConnected ? "Will sync to Google Calendar" : "Saved here · connect Calendar to sync"}
              </span>
            )}
            <button disabled={busy} className="qa-btn qa-btn-primary">
              {busy ? "Saving…" : editing ? "Save changes" : "Add event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
