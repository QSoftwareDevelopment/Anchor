// app/plan/goals/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewGoalPage() {
  const router = useRouter();
  const [outcome, setOutcome] = useState("");
  const [quarter, setQuarter] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  });
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, quarter, target_date: targetDate }),
    });
    if (!res.ok) {
      setError("Couldn't save. Try again.");
      setSaving(false);
      return;
    }
    const goal = await res.json();
    router.push(`/plan/goals/${goal.id}`);
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-8">
      <h1 className="text-2xl font-semibold">New goal</h1>
      <p className="mt-1 text-sm text-qa-text-2">
        One measurable outcome for the quarter.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium" htmlFor="outcome">Outcome</label>
          <input
            id="outcome"
            required
            placeholder="10 paying TextBot clients"
            className="mt-1 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium" htmlFor="quarter">Quarter</label>
            <input
              id="quarter"
              required
              className="mt-1 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2 font-mono text-sm"
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium" htmlFor="target">Target date</label>
            <input
              id="target"
              type="date"
              required
              className="mt-1 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2 font-mono text-sm"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-qa-warn">{error}</p>}
        <button
          disabled={saving}
          className="rounded-qa-sm bg-qa-accent px-4 py-2 font-semibold text-qa-accent-text disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create goal"}
        </button>
      </form>
    </div>
  );
}
