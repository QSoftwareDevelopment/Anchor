// components/assistant-home.tsx
// ============================================================
// THE JARVIS HOME — a personal "Hey {name}" briefing you can hear,
// a command-center glance (your day, your partner, the week, what's
// next), a push-to-talk mic, and a conversation with the operating
// partner that actually acts on real data.
// ============================================================
"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { speakSmart, stopSpeaking, listen, speechRecognitionAvailable } from "@/lib/voice";

export type Glance = {
  dateLabel: string;
  blocks: { time: string; title: string; is_anchor: boolean; done: boolean }[];
  numberOne: { time: string; title: string; is_anchor: boolean; done: boolean } | null;
  shipped: number;
  atRisk: number;
  partner: { name: string; numberOne: string | null; anchor: string | null; shipped: number } | null;
  upcoming: { title: string; when: string; date: string }[];
};
type Action = { kind: string; label: string; detail?: string };
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[] };

const SUGGESTIONS = [
  "Brief me on today",
  "Plan my day",
  "What's my partner working on?",
  "Add a meeting to my calendar",
  "Log a $120 hosting expense",
  "What slipped — and what should I do?",
  "Set my anchor for the week",
];

function plain(t: string): string {
  return t
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^[-•*]\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

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

  // voice
  const [brief, setBrief] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const stopListenRef = useRef<(() => void) | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHour(new Date().getHours());
    setMicAvailable(speechRecognitionAvailable());
    return () => stopSpeaking();
  }, []);

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

  const send = useCallback(
    async (text: string, speakReply = false) => {
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
        const reply = data.text ?? "Done.";
        setMessages((m) => [...m, { role: "assistant", content: reply, actions: data.actions ?? [] }]);
        if (data.glance) setGlance(data.glance);
        if (speakReply) {
          setSpeaking(true);
          void speakSmart(plain(reply), () => setSpeaking(false));
        }
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "I lost the connection for a second — try that again." }]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  async function briefMe() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    try {
      const res = await fetch("/api/brief").then((r) => r.json());
      if (res?.text) {
        setBrief(res.text);
        setSpeaking(true);
        void speakSmart(res.text, () => setSpeaking(false));
      }
    } catch {
      /* ignore */
    }
  }

  function toggleMic() {
    if (listening) {
      stopListenRef.current?.();
      setListening(false);
      return;
    }
    stopSpeaking();
    setSpeaking(false);
    stopListenRef.current = listen(
      (transcript) => {
        setListening(false);
        void send(transcript, true); // voice in → speak the reply
      },
      (on) => setListening(on)
    );
  }

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

  const greeting = hour == null ? "Hey" : hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 pb-52 pt-10 md:pb-36 md:pt-14">
      {/* greeting + voice controls */}
      <header className="qa-rise">
        <div className="flex items-start gap-3">
          <Orb thinking={speaking} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-[650] leading-tight md:text-[30px]">
              {greeting}, <span className="qa-grad-text-anim">{founderName}</span>.
            </h1>
            <p className="mt-0.5 text-sm text-qa-text-2">{statusLine(glance)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={briefMe}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                speaking ? "border-qa-accent bg-qa-accent-soft text-qa-accent qa-glow-pulse" : "border-qa-line-strong text-qa-text-2 hover:text-qa-text"
              }`}
              title="Hear your briefing"
            >
              <SpeakerIcon muted={false} />
              <span className="hidden sm:inline">{speaking ? "Stop" : "Brief me"}</span>
            </button>
            {micAvailable && (
              <button
                onClick={toggleMic}
                aria-label="Talk to your assistant"
                className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
                  listening ? "border-qa-accent bg-qa-accent text-white qa-glow-pulse" : "border-qa-line-strong text-qa-text-2 hover:text-qa-text"
                }`}
                title="Push to talk"
              >
                <MicIcon />
              </button>
            )}
          </div>
        </div>

        {brief && (
          <div className="qa-pop-in mt-4 flex items-start gap-2.5 rounded-qa border border-qa-accent/30 bg-qa-accent-soft px-4 py-3 text-sm">
            <span className="mt-0.5 text-qa-accent"><SpeakerIcon muted={false} /></span>
            <p className="flex-1 leading-relaxed">{brief}</p>
            <button onClick={() => setBrief(null)} aria-label="Dismiss" className="text-qa-text-3 hover:text-qa-text">✕</button>
          </div>
        )}
      </header>

      {/* command center */}
      <CommandCenter glance={glance} />

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
            {micAvailable && (
              <button
                onClick={toggleMic}
                aria-label="Talk"
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${
                  listening ? "bg-qa-accent text-white qa-glow-pulse" : "text-qa-text-2 hover:text-qa-text"
                }`}
              >
                <MicIcon />
              </button>
            )}
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={grow}
              onKeyDown={onKeyDown}
              placeholder={listening ? "Listening…" : "Ask anything — plan my week, what's my partner doing, log an expense…"}
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
            Your operating partner runs the plan, the calendar, the money, and the team — it acts on your real data.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- command center ---------- */

function statusLine(g: Glance): string {
  const open = g.blocks.filter((b) => !b.done).length;
  if (g.numberOne) return `${g.dateLabel} · ${open} on today · your #1 is “${g.numberOne.title}”`;
  if (g.shipped > 0) return `${g.dateLabel} · a clean slate · ${g.shipped} shipped this week`;
  return `${g.dateLabel} · a clean slate — tell me what matters and I'll lay it out`;
}

function CommandCenter({ glance }: { glance: Glance }) {
  const open = glance.blocks.filter((b) => !b.done);
  return (
    <div className="mt-6 space-y-3 qa-rise">
      {/* your #1 — hero */}
      <section className="qa-card-grad overflow-hidden">
        <div className="flex items-center justify-between border-b border-qa-line px-5 py-3">
          <span className="qa-eyebrow">Your focus today</span>
          {glance.shipped > 0 && (
            <span className="text-xs text-qa-text-2"><span className="font-semibold text-qa-text">{glance.shipped}</span> shipped this week</span>
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
            <p className="mt-0.5 text-sm text-qa-text-2">Ask me to plan your day and I&apos;ll lay it into your energy windows.</p>
          </div>
        )}
      </section>

      {/* partner · this week · upcoming */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* partner */}
        <Link href="/team" className="qa-card-link p-4">
          <div className="flex items-center justify-between">
            <span className="qa-eyebrow">{glance.partner ? glance.partner.name : "Team"}</span>
            <Arrow />
          </div>
          {glance.partner ? (
            <>
              <p className="mt-2 text-sm font-medium leading-snug">
                {glance.partner.numberOne ?? glance.partner.anchor ?? "No focus set yet"}
              </p>
              <p className="mt-1 text-xs text-qa-text-3">
                {glance.partner.numberOne ? "focused on this" : glance.partner.anchor ? "their anchor" : "nothing planned"} · {glance.partner.shipped} shipped
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-qa-text-2">See the partnership.</p>
          )}
        </Link>

        {/* this week */}
        <div className="qa-card p-4">
          <span className="qa-eyebrow">This week</span>
          <p className="mt-2 font-mono text-2xl font-semibold text-qa-text">{glance.shipped}</p>
          <p className="text-xs text-qa-text-3">shipped</p>
          {glance.atRisk > 0 && (
            <p className="mt-2 text-xs font-medium text-qa-warn">
              {glance.atRisk} at risk — needs a decision
            </p>
          )}
        </div>

        {/* upcoming */}
        <Link href="/calendar" className="qa-card-link p-4">
          <div className="flex items-center justify-between">
            <span className="qa-eyebrow">Upcoming</span>
            <Arrow />
          </div>
          {glance.upcoming.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {glance.upcoming.slice(0, 2).map((e, i) => (
                <div key={i} className="text-sm">
                  <p className="truncate font-medium leading-tight">{e.title}</p>
                  <p className="font-mono text-[11px] text-qa-text-3">{e.date} · {e.when}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-qa-text-2">Nothing on the calendar.</p>
          )}
        </Link>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="qa-rise pt-2">
      <p className="text-[15px] text-qa-text-2">
        I&apos;m Anchor — your executive assistant. I run the plan and calendar, track what you and your partner
        are doing, manage the money and clients, and brief you out loud. Try the mic, or start here:
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onPick(s)} className="qa-card-link flex items-center gap-2 px-4 py-3 text-left text-sm">
            <span className="text-qa-accent">→</span>
            <span>{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */

function Arrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-qa-text-3" aria-hidden>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      {!muted && <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />}
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
    </svg>
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
      <span
        className="qa-spin-slow absolute rounded-full"
        style={{ inset: -2, background: "conic-gradient(from 0deg, rgba(124,116,255,0) 0%, rgba(70,214,255,0.75) 35%, rgba(124,116,255,0) 65%)", opacity: 0.75 }}
      />
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: "var(--qa-grad)", boxShadow: "0 0 0 1px rgba(124,116,255,0.4), 0 6px 22px rgba(124,116,255,0.45)" }}
      />
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
