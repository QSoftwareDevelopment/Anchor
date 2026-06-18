// components/command-palette.tsx
// ============================================================
// COMMAND PALETTE — ⌘K / Ctrl-K from anywhere.
// Fuzzy-jump to any view and fire quick actions: capture a thought,
// add a calendar event, plan the day or week, sign out. Arrow keys +
// Enter, Esc to close. The "futuristic OS" spine of the app.
// ============================================================
"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import EventModal, { type CreatedEvent } from "@/components/event-modal";
import { speakSmart } from "@/lib/voice";

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  group: "Go to" | "Actions";
  keywords?: string;
  icon: ReactNode;
  run: () => void | Promise<void>;
};

const ic = (path: ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {path}
  </svg>
);

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"commands" | "capture">("commands");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [capture, setCapture] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [gcal, setGcal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setMode("commands");
    setCapture("");
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  async function plan(scope: "day" | "week") {
    close();
    flash(scope === "day" ? "Planning your day…" : "Planning your week…");
    try {
      const res = await fetch("/api/schedule/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      flash(`Planned ${data.placed} block${data.placed === 1 ? "" : "s"}${data.unplaced?.length ? ` · ${data.unplaced.length} didn't fit` : ""}.`);
      router.refresh();
    } catch (e) {
      flash(e instanceof Error && e.message ? e.message : "Couldn't plan right now.");
    }
  }

  const commands: Cmd[] = useMemo(
    () => [
      { id: "assistant", label: "Assistant", group: "Go to", keywords: "home chat ai partner", icon: ic(<><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></>), run: () => go("/") },
      { id: "today", label: "Today", group: "Go to", keywords: "day brief now", icon: ic(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>), run: () => go("/today") },
      { id: "week", label: "Week", group: "Go to", keywords: "weekly board 7 days", icon: ic(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M9 9v12M15 9v12" /></>), run: () => go("/week") },
      { id: "calendar", label: "Calendar", group: "Go to", keywords: "month events schedule", icon: ic(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>), run: () => go("/calendar") },
      { id: "goals", label: "Goals", group: "Go to", keywords: "big picture outcomes quarter okr", icon: ic(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>), run: () => go("/goals") },
      { id: "plan", label: "Plan", group: "Go to", keywords: "projects indicators", icon: ic(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h5" /></>), run: () => go("/plan") },
      { id: "inbox", label: "Inbox", group: "Go to", keywords: "captures triage", icon: ic(<><path d="M3 13h4l1.5 3h7L17 13h4" /><path d="M5 13V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" /></>), run: () => go("/inbox") },
      { id: "review", label: "Review", group: "Go to", keywords: "daily weekly reflect", icon: ic(<><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v4h-4" /></>), run: () => go("/review") },
      { id: "insights", label: "Insights", group: "Go to", keywords: "stats time data analytics", icon: ic(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />), run: () => go("/insights") },
      { id: "team", label: "Team", group: "Go to", keywords: "partner aaryan sid partnership who", icon: ic(<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /></>), run: () => go("/team") },
      { id: "money", label: "Money", group: "Go to", keywords: "finance revenue expense mrr runway burn", icon: ic(<><rect x="2.5" y="6" width="19" height="13" rx="2" /><circle cx="12" cy="12.5" r="2.5" /></>), run: () => go("/money") },
      { id: "contacts", label: "Contacts", group: "Go to", keywords: "crm clients leads", icon: ic(<><rect x="4" y="4" width="16" height="16" rx="1" /><circle cx="12" cy="10" r="2.5" /></>), run: () => go("/contacts") },
      { id: "resources", label: "Resources", group: "Go to", keywords: "links docs contracts brand dashboards", icon: ic(<><path d="M4 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /></>), run: () => go("/resources") },
      { id: "settings", label: "Settings", group: "Go to", keywords: "profile calendar energy ceiling", icon: ic(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87M4.6 9a1.7 1.7 0 0 0-.34-1.87" /></>), run: () => go("/settings") },

      { id: "brief", label: "Brief me", hint: "spoken", group: "Actions", keywords: "voice speak jarvis briefing status read aloud", icon: ic(<><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></>), run: () => { close(); fetch("/api/brief").then((r) => r.json()).then((d) => { if (d?.text) void speakSmart(d.text); }).catch(() => {}); } },
      { id: "new-event", label: "Add calendar event", hint: "meeting · call", group: "Actions", keywords: "create meeting appointment gcal new", icon: ic(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M12 13v4M10 15h4" /></>), run: () => { setOpen(false); fetch("/api/gcal/status").then((r) => r.json()).then((d) => setGcal(Boolean(d.connected))).catch(() => {}); setEventOpen(true); } },
      { id: "capture", label: "Capture a thought", hint: "to inbox", group: "Actions", keywords: "note idea brain dump todo", icon: ic(<><path d="M12 5v14M5 12h14" /></>), run: () => { setMode("capture"); setQuery(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 10); } },
      { id: "plan-day", label: "Plan my day", group: "Actions", keywords: "schedule today blocks", icon: ic(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>), run: () => plan("day") },
      { id: "plan-week", label: "Plan my week", group: "Actions", keywords: "schedule weekly blocks", icon: ic(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 13l2 2 4-4" /></>), run: () => plan("week") },
      { id: "signout", label: "Sign out", group: "Actions", keywords: "logout leave exit", icon: ic(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>), run: () => go("/signout") },
    ],
    [go] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => (c.label + " " + (c.keywords ?? "")).toLowerCase().includes(q));
  }, [query, commands]);

  // global ⌘K / Ctrl-K toggle, plus a click trigger via custom event
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setMode("commands");
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("qa:open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("qa:open-command-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (pathname.startsWith("/login") || pathname.startsWith("/signout")) {
    return eventOpen ? (
      <EventModal open={eventOpen} onClose={() => setEventOpen(false)} onCreated={() => flash("Event added.")} gcalConnected={gcal} />
    ) : null;
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") return close();
    if (mode === "capture") {
      if (e.key === "Enter") {
        e.preventDefault();
        void submitCapture();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void filtered[active]?.run();
    }
  }

  async function submitCapture() {
    const text = capture.trim();
    if (!text) return;
    close();
    flash("Captured to inbox.");
    try {
      await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: text }),
      });
      window.dispatchEvent(new CustomEvent("qa:captures-changed"));
      if (pathname.startsWith("/inbox")) router.refresh();
    } catch {
      flash("Didn't save. Try again.");
    }
  }

  let lastGroup = "";

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm qa-fade" onClick={close} />
          <div className="qa-pop-in qa-card-grad relative z-10 w-full max-w-xl overflow-hidden shadow-qa-lg">
            <div className="flex items-center gap-2.5 border-b border-qa-line px-4 py-3">
              <span className="text-qa-accent">
                {mode === "capture"
                  ? ic(<><path d="M12 5v14M5 12h14" /></>)
                  : ic(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>)}
              </span>
              <input
                ref={inputRef}
                value={mode === "capture" ? capture : query}
                onChange={(e) => (mode === "capture" ? setCapture(e.target.value) : setQuery(e.target.value))}
                onKeyDown={onInputKey}
                placeholder={mode === "capture" ? "Transmit to Anchor. Enter to capture..." : "Command Anchor OS..."}
                className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-qa-text-3"
              />
              <kbd className="hidden rounded border border-qa-line-strong bg-qa-glass px-1.5 py-0.5 font-mono text-[10px] text-qa-text-3 sm:block">
                esc
              </kbd>
            </div>

            {mode === "commands" ? (
              <div className="max-h-[52vh] overflow-y-auto py-2">
                {filtered.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-qa-text-3">No matches. Try “week”, “event”, “plan”…</p>
                )}
                {filtered.map((c, i) => {
                  const showGroup = c.group !== lastGroup;
                  lastGroup = c.group;
                  return (
                    <div key={c.id}>
                      {showGroup && (
                        <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-qa-text-3">{c.group}</p>
                      )}
                      <button
                        onMouseEnter={() => setActive(i)}
                        onClick={() => void c.run()}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                          i === active ? "bg-qa-accent-soft text-qa-text" : "text-qa-text-2"
                        }`}
                      >
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-qa-sm ${i === active ? "text-qa-accent" : "text-qa-text-3"}`}>
                          {c.icon}
                        </span>
                        <span className="flex-1 font-medium">{c.label}</span>
                        {c.hint && <span className="text-xs text-qa-text-3">{c.hint}</span>}
                        {i === active && (
                          <kbd className="rounded border border-qa-line-strong bg-qa-glass px-1.5 py-0.5 font-mono text-[10px] text-qa-text-3">↵</kbd>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-4">
                <button onClick={() => setMode("commands")} className="mb-3 text-xs text-qa-text-3 hover:text-qa-text">
                  ← back to commands
                </button>
                <button onClick={() => void submitCapture()} disabled={!capture.trim()} className="qa-btn qa-btn-primary w-full justify-center">
                  Capture to inbox
                </button>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-qa-line px-4 py-2 text-[11px] text-qa-text-3">
              <span className="flex items-center gap-1.5">
                <span className="grid h-4 w-4 place-items-center rounded font-mono text-[9px]" style={{ background: "var(--qa-grad)", color: "var(--qa-accent-text)" }}>A</span>
                Anchor OS
              </span>
              <span className="hidden gap-2 sm:flex">
                <span>↑↓ navigate</span><span>↵ select</span><span>esc close</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-qa-line-strong bg-[var(--qa-bg-2)]/95 px-4 py-2 text-sm shadow-qa-lg qa-pop-in md:bottom-6" role="status">
          {toast}
        </div>
      )}

      <EventModal
        open={eventOpen}
        onClose={() => setEventOpen(false)}
        onCreated={(_e: CreatedEvent, synced: boolean) => flash(synced ? "Event added & synced to Google Calendar." : "Event added.")}
        gcalConnected={gcal}
      />
    </>
  );
}
