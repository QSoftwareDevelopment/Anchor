// app/review/page.tsx — evening shutdown. Three conversational
// questions, then the agent's summary right there on the page.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import ReviewCard from "@/components/review-card";
import { todayISO } from "@/lib/utils";

type TodayTask = {
  id: string;
  title: string;
  status: string;
  estimate_minutes: number | null;
};

const supabase = createBrowserSupabase();

export default function ReviewPage() {
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // actual minutes per done task — feeds the multiplier learning loop
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [blockers, setBlockers] = useState("");
  const [tomorrowNotes, setTomorrowNotes] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: blocks } = await supabase
        .from("schedule_blocks")
        .select("tasks(id, title, status, estimate_minutes)")
        .eq("founder_id", auth.user.id)
        .eq("block_date", todayISO());
      const seen = new Set<string>();
      const todays: TodayTask[] = [];
      for (const b of blocks ?? []) {
        const t = (Array.isArray(b.tasks) ? b.tasks[0] : b.tasks) as TodayTask | null;
        if (t && !seen.has(t.id)) {
          seen.add(t.id);
          todays.push(t);
        }
      }
      setTasks(todays);
      setChecked(
        Object.fromEntries(todays.map((t) => [t.id, t.status === "done"]))
      );
      setActuals(
        Object.fromEntries(todays.map((t) => [t.id, String(t.estimate_minutes ?? 30)]))
      );
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/reviews/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        done_confirmed: Object.entries(checked)
          .filter(([, v]) => v)
          .map(([id]) => ({
            id,
            actual_minutes: Number(actuals[id]) > 0 ? Number(actuals[id]) : null,
          })),
        blockers,
        notes: tomorrowNotes,
      }),
    });
    if (!res.ok) {
      setError("Couldn't save the shutdown. Try again.");
      setSubmitting(false);
      return;
    }
    const data = await res.json();
    setSummary(data.summary ?? "Saved. See you tomorrow.");
    setSubmitting(false);
  }

  if (summary) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-qa-success-soft text-qa-success qa-pop">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12.5 10 17.5 19 6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="qa-check-path" />
            </svg>
          </span>
          <h1 className="text-2xl font-semibold">Day closed.</h1>
        </div>
        <div className="mt-5 qa-rise">
          <ReviewCard summary={summary} />
        </div>
        <Link href="/today" className="mt-4 inline-block text-sm text-qa-text-2 hover:underline">
          ← Back to Today
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Evening shutdown</h1>
        <span className="flex gap-4">
          <Link href="/review/history" className="text-sm text-qa-text-2 hover:underline">
            Past weeks
          </Link>
          <Link href="/review/weekly" className="text-sm text-qa-text-2 hover:underline">
            Weekly review →
          </Link>
        </span>
      </div>
      <form onSubmit={submit} className="mt-6 space-y-7">
        <div>
          <h2 className="font-medium">What got done?</h2>
          <div className="mt-2">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border-t border-qa-line py-2.5">
                <input
                  type="checkbox"
                  aria-label={t.title}
                  className="h-[18px] w-[18px] accent-[var(--qa-accent)]"
                  checked={checked[t.id] ?? false}
                  onChange={(e) =>
                    setChecked((c) => ({ ...c, [t.id]: e.target.checked }))
                  }
                />
                <span className="min-w-0 flex-1 text-[15px]">{t.title}</span>
                {checked[t.id] && (
                  <span className="flex items-center gap-1.5 text-xs text-qa-text-2">
                    took
                    <input
                      type="number"
                      min={5}
                      step={5}
                      aria-label={`Minutes spent on ${t.title}`}
                      className="w-16 rounded-qa-sm border border-qa-line px-2 py-1 text-right font-mono text-xs"
                      value={actuals[t.id] ?? ""}
                      onChange={(e) =>
                        setActuals((a) => ({ ...a, [t.id]: e.target.value }))
                      }
                    />
                    min
                  </span>
                )}
              </div>
            ))}
            {tasks.length === 0 && (
              <p className="border-t border-qa-line py-2.5 text-sm text-qa-text-2">
                Nothing was scheduled today. Tomorrow gets a clean slate either way.
              </p>
            )}
          </div>
        </div>
        <div>
          <h2 className="font-medium">Anything blocked?</h2>
          <textarea
            rows={2}
            placeholder="Optional"
            className="mt-2 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2 text-[15px]"
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
          />
        </div>
        <div>
          <h2 className="font-medium">Anything on your mind for tomorrow?</h2>
          <textarea
            rows={2}
            placeholder="Optional"
            className="mt-2 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2 text-[15px]"
            value={tomorrowNotes}
            onChange={(e) => setTomorrowNotes(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-qa-warn">{error}</p>}
        <button
          disabled={submitting}
          className="rounded-qa-sm bg-qa-accent px-4 py-2 font-semibold text-qa-accent-text disabled:opacity-50"
        >
          {submitting ? "Wrapping up…" : "Close the day"}
        </button>
      </form>
    </div>
  );
}
