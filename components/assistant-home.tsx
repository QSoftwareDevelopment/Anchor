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
  calendarConnected: boolean;
};
type Action = { kind: string; label: string; detail?: string };
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[] };
type VoiceMode = "idle" | "listening" | "speaking" | "thinking";

const SUGGESTIONS = [
  "Brief me on today",
  "Plan my day",
  "What's my partner working on?",
  "Add a meeting to my calendar",
  "Log a $120 hosting expense",
  "What slipped, and what should I do?",
  "Set my anchor for the week",
];

const EXECUTIVE_ACTIONS = [
  { label: "Plan today", detail: "Build my schedule around focus windows", prompt: "Plan my day" },
  { label: "Add event", detail: "Put a meeting or call on my calendar", prompt: "Add a meeting to my calendar" },
  { label: "Partner scan", detail: "Show me what my partner is carrying", prompt: "What's my partner working on?" },
  { label: "Risk sweep", detail: "Find slipped work and decide what moves", prompt: "What slipped, and what should I do?" },
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
        if (data.glance) setGlance((g) => ({ ...g, ...data.glance }));
        if (speakReply) {
          setSpeaking(true);
          void speakSmart(plain(reply), () => setSpeaking(false));
        }
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "I lost the connection for a second. Try that again." }]);
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
  const voiceMode: VoiceMode = listening ? "listening" : speaking ? "speaking" : loading ? "thinking" : "idle";

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-4 pb-52 pt-5 sm:px-6 md:pb-36 md:pt-8 lg:px-8">
      <header className="qa-rise flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="qa-eyebrow text-qa-accent">Anchor OS</p>
            <SystemPill tone="online" label="Voice command" />
            <SystemPill tone={glance.calendarConnected ? "online" : "warn"} label={glance.calendarConnected ? "Calendar synced" : "Calendar local"} />
          </div>
          <h1 className="mt-2 text-[30px] font-[750] leading-tight tracking-normal md:text-[42px]">
            {greeting}, <span className="qa-grad-text-anim">{founderName}</span>.
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-qa-text-2">{statusLine(glance)}</p>
        </div>
        <button
          onClick={briefMe}
          className={`qa-brief-button ${speaking ? "is-active" : ""}`}
          title="Hear your briefing"
        >
          <SpeakerIcon muted={false} />
          <span>{speaking ? "Stop audio" : "Daily brief"}</span>
        </button>

        {brief && (
          <div className="qa-pop-in mt-4 flex w-full items-start gap-2.5 rounded-qa border border-qa-accent/30 bg-qa-accent-soft px-4 py-3 text-sm">
            <span className="mt-0.5 text-qa-accent"><SpeakerIcon muted={false} /></span>
            <p className="flex-1 leading-relaxed">{brief}</p>
            <button onClick={() => setBrief(null)} aria-label="Dismiss" className="text-qa-text-3 hover:text-qa-text">✕</button>
          </div>
        )}
      </header>

      <section className="qa-rise mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(340px,0.82fr)]">
        <div className="qa-hud-panel qa-hud-hero qa-command-theater">
          <div className="qa-hud-corners" aria-hidden />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="qa-eyebrow text-qa-accent">Primary interface</p>
              <p className="mt-1 text-xl font-semibold text-qa-text">Talk to it like an executive assistant.</p>
            </div>
            <div className="qa-signal-strip" aria-hidden>
              <span /><span /><span /><span /><span />
            </div>
          </div>

          <div className="mt-6 grid items-center gap-6 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1fr)]">
            <VoiceCore
              mode={voiceMode}
              available={micAvailable}
              onToggle={toggleMic}
            />
            <div className="min-w-0 space-y-3">
              <div className="qa-status-readout">
                <span className="qa-eyebrow">Voice state</span>
                <strong>{voiceLabel(voiceMode, micAvailable)}</strong>
                <p>{voiceSubline(voiceMode, micAvailable)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Focus" value={glance.numberOne ? "Locked" : "Open"} tone="accent" />
                <Metric label="Shipped" value={String(glance.shipped)} />
                <Metric label="Risk" value={String(glance.atRisk)} tone={glance.atRisk > 0 ? "warn" : "calm"} />
                <Metric label="Calendar" value={glance.calendarConnected ? "Synced" : "Local"} tone={glance.calendarConnected ? "calm" : "warn"} />
              </div>
              <div className="qa-command-rail">
                {SUGGESTIONS.slice(0, 4).map((s) => (
                  <button key={s} onClick={() => void send(s, true)} disabled={loading}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <CapabilityDeck onPick={(s) => void send(s, true)} loading={loading} />
        </div>

        <CommandCenter glance={glance} />
      </section>

      {/* conversation */}
      <div ref={scroller} className="qa-transcript-panel mt-5 flex-1 space-y-5 overflow-y-auto">
        <div className="flex items-center justify-between gap-3 border-b border-qa-line px-4 py-3">
          <div>
            <p className="qa-eyebrow text-qa-accent">Secure transcript</p>
            <p className="text-xs text-qa-text-3">Commands, decisions, and actions.</p>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-qa-text-3">{loading ? "processing" : "standby"}</span>
        </div>
        <div className="space-y-5 px-1 py-1">
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
      </div>

      {/* composer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-qa-line bg-[var(--qa-bg)]/78 pb-[58px] backdrop-blur-xl md:pb-0 md:pl-[232px]">
        <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8">
          {!empty && (
            <div className="mb-2.5 flex gap-2 overflow-x-auto pb-0.5">
              {SUGGESTIONS.slice(0, 4).map((s) => (
                <button key={s} onClick={() => void send(s)} disabled={loading} className="qa-chip shrink-0 whitespace-nowrap">
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="qa-composer-shell flex items-end gap-2 rounded-2xl border border-qa-line-strong bg-qa-glass px-3 py-2 focus-within:border-qa-accent">
            <button
              onClick={toggleMic}
              disabled={!micAvailable}
              aria-label="Talk"
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
                listening ? "bg-qa-accent text-qa-bg qa-glow-pulse" : "text-qa-accent hover:bg-qa-accent-soft disabled:text-qa-text-3"
              }`}
              title={micAvailable ? "Push to talk" : "Speech recognition is unavailable in this browser"}
            >
              <MicIcon />
            </button>
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={grow}
              onKeyDown={onKeyDown}
              placeholder={listening ? "Listening..." : "Command Anchor - plan my week, add a meeting, brief me, hand work to my partner..."}
              className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed outline-none"
            />
            <button
              onClick={() => void send(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white transition disabled:opacity-40"
              style={{ background: "var(--qa-grad)", boxShadow: "0 6px 18px rgba(32,245,138,0.28)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
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
  return `${g.dateLabel} · a clean slate. Tell me what matters and I'll lay it out`;
}

function CommandCenter({ glance }: { glance: Glance }) {
  const open = glance.blocks.filter((b) => !b.done);
  return (
    <aside className="qa-hud-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-qa-line px-5 py-3">
        <div>
          <p className="qa-eyebrow text-qa-accent">Mission stack</p>
          <p className="text-xs text-qa-text-3">What needs your attention now.</p>
        </div>
        {glance.shipped > 0 && (
          <span className="rounded-full border border-qa-line bg-qa-glass px-2.5 py-1 text-xs text-qa-text-2"><span className="font-semibold text-qa-text">{glance.shipped}</span> shipped</span>
        )}
      </div>

      <div className="divide-y divide-qa-line">
        {glance.numberOne ? (
          <MissionRow eyebrow="Your one thing" title={glance.numberOne.title} detail={glance.numberOne.time} href="/today" tone="accent" />
        ) : (
          <MissionRow eyebrow="Your one thing" title="Nothing scheduled yet" detail="Ask Anchor to plan your day." href="/today" tone="muted" />
        )}

        {open.slice(1, 3).map((b, i) => (
          <MissionRow key={`${b.time}-${i}`} eyebrow="Next block" title={b.title} detail={b.time} href="/today" />
        ))}

        <MissionRow
          eyebrow={glance.partner ? glance.partner.name : "Team"}
          title={glance.partner?.numberOne ?? glance.partner?.anchor ?? "Open team control"}
          detail={glance.partner ? `${glance.partner.shipped} shipped this week` : "See the partnership"}
          href="/team"
          tone="cyan"
        />

        <MissionRow
          eyebrow="Upcoming"
          title={glance.upcoming[0]?.title ?? "Calendar is clear"}
          detail={glance.upcoming[0] ? `${glance.upcoming[0].date} · ${glance.upcoming[0].when}` : glance.calendarConnected ? "Synced and standing by" : "Connect Google Calendar"}
          href="/calendar"
          tone={glance.calendarConnected ? "calm" : "warn"}
        />

        <MissionRow
          eyebrow="Risk"
          title={glance.atRisk > 0 ? `${glance.atRisk} decisions needed` : "No escalated slips"}
          detail={glance.atRisk > 0 ? "Ask for a risk sweep." : "The plan is clean."}
          href="/review"
          tone={glance.atRisk > 0 ? "warn" : "calm"}
        />
      </div>
    </aside>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="qa-rise qa-hud-panel p-4">
      <p className="qa-eyebrow text-qa-accent">Suggested commands</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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

function CapabilityDeck({ onPick, loading }: { onPick: (s: string) => void; loading: boolean }) {
  return (
    <div className="qa-capability-grid mt-6">
      {EXECUTIVE_ACTIONS.map((action, i) => (
        <button
          key={action.label}
          onClick={() => onPick(action.prompt)}
          disabled={loading}
          className="qa-capability"
          style={{ animationDelay: `${i * 45}ms` }}
        >
          <span className="qa-capability-index">{String(i + 1).padStart(2, "0")}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-qa-text">{action.label}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-qa-text-3">{action.detail}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function MissionRow({
  eyebrow,
  title,
  detail,
  href,
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  detail: string;
  href: string;
  tone?: "default" | "accent" | "cyan" | "warn" | "calm" | "muted";
}) {
  return (
    <Link href={href} className={`qa-mission-row tone-${tone}`}>
      <span className="qa-mission-dot" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="qa-eyebrow">{eyebrow}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-qa-text">{title}</span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-qa-text-3">{detail}</span>
      </span>
      <Arrow />
    </Link>
  );
}

function SystemPill({ label, tone }: { label: string; tone: "online" | "warn" }) {
  return (
    <span className={`qa-system-pill tone-${tone}`}>
      <span aria-hidden />
      {label}
    </span>
  );
}

function VoiceCore({
  mode,
  available,
  onToggle,
}: {
  mode: VoiceMode;
  available: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`qa-voice-core is-${mode}`}>
      <div className="qa-orbit orbit-one" aria-hidden />
      <div className="qa-orbit orbit-two" aria-hidden />
      <button
        onClick={onToggle}
        disabled={!available}
        className="qa-main-mic"
        aria-label={mode === "listening" ? "Stop listening" : "Talk to Anchor"}
        title={available ? "Push to talk" : "Speech recognition is unavailable in this browser"}
      >
        <MicIcon />
      </button>
      <div className="qa-waveform" aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} style={{ animationDelay: `${i * 55}ms` }} />
        ))}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "warn" | "calm";
}) {
  return (
    <div className={`qa-metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function voiceLabel(mode: VoiceMode, available: boolean): string {
  if (!available) return "Mic unavailable";
  if (mode === "listening") return "Listening";
  if (mode === "speaking") return "Speaking";
  if (mode === "thinking") return "Processing";
  return "Ready";
}

function voiceSubline(mode: VoiceMode, available: boolean): string {
  if (!available) return "Text channel is online.";
  if (mode === "listening") return "Say the command. Anchor will answer out loud.";
  if (mode === "speaking") return "Audio briefing is live.";
  if (mode === "thinking") return "Running the operation against your real workspace.";
  return "Press the central mic to command the system.";
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
        style={{ inset: -2, background: "conic-gradient(from 0deg, rgba(32,245,138,0) 0%, rgba(67,216,255,0.75) 35%, rgba(32,245,138,0) 65%)", opacity: 0.75 }}
      />
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: "var(--qa-grad)", boxShadow: "0 0 0 1px rgba(32,245,138,0.36), 0 6px 22px rgba(32,245,138,0.30)" }}
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
