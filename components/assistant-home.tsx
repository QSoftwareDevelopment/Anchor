// components/assistant-home.tsx
// The assistant-first home: a personal welcome, a live glance of today,
// and a conversation with the operating partner that can actually act.
"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type Glance = {
  dateLabel: string;
  blocks: { time: string; title: string; is_anchor: boolean; done: boolean }[];
  numberOne: { time: string; title: string; is_anchor: boolean; done: boolean } | null;
  shipped: number;
};
type Action = { kind: string; label: string; detail?: string };
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[] };

const SUGGESTIONS = [
  "Plan my day",
  "Add a meeting to my calendar",
  "What should I focus on this week?",
  "What slipped — and what should I do about it?",
  "Where's my time going?",
  "Draft next week's plan",
  "Set my anchor for the week",
];

export default function AssistantHome({
  founderName,
  initialGlance,
}: {
  founderName: string;
  initialGlance: Glance;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [glance, setGlance] = useState<Glance>(initialGlance);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hour, setHour] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setHour(new Date().getHours()), []);

  // load saved conversation (empty if persistence isn't set up yet)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agent/history");
        const data = await res.json();
        if (Array.isArray(data.messages) && data.messages.length) setMessages(data.messages);
      } catch {
        /* fresh start */
      }
    })();
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const greeting =
    hour == null ? "Welcome back" : hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || loading) return;
      const next = [...messages, { role: "user" as const, content: clean }];
      setMessages(next);
      setInput("");
      if (taRef.current) taRef.current.style.height = "auto";
      setLoading(true);
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
        });
        const data = await res.json();
        setMessages((m) => [...m, { role: "assistant", content: data.text ?? "Done.", actions: data.actions ?? [] }]);
        if (data.glance) setGlance(data.glance);
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "I lost the connection for a second — try that again." }]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }
  function grow(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 pb-52 pt-10 md:pb-36 md:pt-14">
      {/* greeting */}
      <header className="qa-rise">
        <div className="flex items-center gap-3">
          <Orb />
          <div>
            <h1 className="text-[26px] font-[650] leading-tight md:text-[30px]">
              {greeting}, <span className="qa-grad-text-anim">{founderName}</span>.
            </h1>
            <p className="mt-0.5 text-sm text-qa-text-2">{statusLine(glance)}</p>
          </div>
        </div>
      </header>

      {/* glance */}
      <GlanceCard glance={glance} />

      {/* conversation */}
      <div ref={scroller} className="mt-6 flex-1 space-y-5 overflow-y-auto">
        {empty && <EmptyState onPick={(s) => void send(s)} />}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end qa-rise">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-qa-accent-soft px-4 py-2.5 text-[15px] text-qa-text">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3 qa-rise">
              <Orb small />
              <div className="min-w-0 flex-1">
                <div className="review-prose max-w-none pt-1">{renderText(m.content)}</div>
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {m.actions.map((a, j) => (
                      <span key={j} className="qa-chip border-qa-accent/40 text-qa-text">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M5 12.5 10 17.5 19 6.5" stroke="var(--qa-success)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-medium">{a.label}</span>
                        {a.detail && <span className="text-qa-text-2">· {a.detail}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {loading && (
          <div className="flex gap-3 qa-fade">
            <Orb small thinking />
            <div className="qa-think pt-3" aria-label="Thinking">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>

      {/* composer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-qa-line bg-[var(--qa-bg)]/70 pb-[58px] backdrop-blur-xl md:pb-0 md:pl-[232px]">
        <div className="mx-auto max-w-3xl px-5 py-3.5">
          {!empty && (
            <div className="mb-2.5 flex gap-2 overflow-x-auto pb-0.5">
              {SUGGESTIONS.slice(0, 4).map((s) => (
                <button key={s} onClick={() => void send(s)} disabled={loading} className="qa-chip shrink-0 whitespace-nowrap">
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-qa-line-strong bg-qa-glass px-3 py-2 focus-within:border-qa-accent">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={grow}
              onKeyDown={onKeyDown}
              placeholder={`Ask ${founderName === "Sid" ? "your" : "your"} operating partner anything — plan my week, add a task, what's my #1…`}
              className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed outline-none"
            />
            <button
              onClick={() => void send(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white transition disabled:opacity-40"
              style={{ background: "var(--qa-grad)", boxShadow: "0 6px 18px rgba(124,116,255,0.4)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-qa-text-3">
            Your operating partner can plan, schedule, and triage — it acts on your real data.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function statusLine(g: Glance): string {
  const open = g.blocks.filter((b) => !b.done).length;
  const date = g.dateLabel;
  if (g.numberOne) return `${date} · ${open} on today, your #1 is “${g.numberOne.title}”`;
  if (g.shipped > 0) return `${date} · a clean slate · ${g.shipped} shipped this week`;
  return `${date} · a clean slate — tell me what matters and I'll lay it out`;
}

function GlanceCard({ glance }: { glance: Glance }) {
  const open = glance.blocks.filter((b) => !b.done);
  return (
    <section className="qa-card-grad mt-6 overflow-hidden qa-rise">
      <div className="flex items-center justify-between border-b border-qa-line px-5 py-3">
        <span className="qa-eyebrow">Today</span>
        {glance.shipped > 0 && (
          <span className="text-xs text-qa-text-2">
            <span className="font-semibold text-qa-text">{glance.shipped}</span> shipped this week
          </span>
        )}
      </div>
      {glance.numberOne ? (
        <div className="px-5 py-4">
          <p className="qa-eyebrow text-qa-accent">Your one thing</p>
          <p className="mt-1 text-lg font-[600] leading-snug">{glance.numberOne.title}</p>
          <p className="mt-1 font-mono text-xs text-qa-text-2">{glance.numberOne.time}</p>
          {open.length > 1 && (
            <div className="mt-3 space-y-1.5 border-t border-qa-line pt-3">
              {open.slice(1, 4).map((b, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-qa-text-2">
                  <span className="w-16 shrink-0 font-mono text-xs">{b.time}</span>
                  <span className="truncate">{b.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="px-5 py-5">
          <p className="text-[15px] text-qa-text">Nothing scheduled yet.</p>
          <p className="mt-0.5 text-sm text-qa-text-2">Ask me to plan your day and I'll lay it into your energy windows.</p>
        </div>
      )}
    </section>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="qa-rise pt-2">
      <p className="text-[15px] text-qa-text-2">
        I&apos;m your operating partner. I can plan your day or week, capture and triage tasks, set your
        anchor, and tell you where your time is going — just ask. A few places to start:
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="qa-card-link flex items-center gap-2 px-4 py-3 text-left text-sm"
          >
            <span className="text-qa-accent">→</span>
            <span>{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Orb({ small, thinking }: { small?: boolean; thinking?: boolean }) {
  const d = small ? 30 : 44;
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center rounded-full ${thinking ? "animate-[qa-float_1.6s_ease-in-out_infinite]" : ""}`}
      style={{ width: d, height: d }}
      aria-hidden
    >
      {/* spinning halo ring */}
      <span
        className="qa-spin-slow absolute rounded-full"
        style={{
          inset: -2,
          background:
            "conic-gradient(from 0deg, rgba(124,116,255,0) 0%, rgba(70,214,255,0.75) 35%, rgba(124,116,255,0) 65%)",
          opacity: 0.75,
        }}
      />
      {/* core */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: "var(--qa-grad)",
          boxShadow: "0 0 0 1px rgba(124,116,255,0.4), 0 6px 22px rgba(124,116,255,0.45)",
        }}
      />
      {/* glossy highlight */}
      <span
        className="absolute rounded-full"
        style={{ inset: small ? 8 : 12, background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.9), rgba(255,255,255,0.05))" }}
      />
    </span>
  );
}

// tiny markdown: **bold**, "- " bullets, blank-line paragraphs
function renderText(text: string): ReactNode {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: string) => {
    if (!list.length) return;
    out.push(
      <ul key={k}>
        {list.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ul>
    );
    list = [];
  };
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return flush(`f${i}`);
    if (/^[-•*]\s+/.test(t)) return void list.push(t.replace(/^[-•*]\s+/, ""));
    flush(`f${i}`);
    out.push(<p key={i}>{inline(t)}</p>);
  });
  flush("end");
  return out;
}
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>
  );
}
