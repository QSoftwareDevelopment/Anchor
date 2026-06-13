// app/plan/projects/new/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type Founder = { user_id: string; display_name: string };
type Goal = { id: string; outcome: string };

const supabase = createBrowserSupabase();

function NewProjectForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [name, setName] = useState("");
  const [goalId, setGoalId] = useState(search.get("goal_id") ?? "");
  const [owner, setOwner] = useState("");
  const [premortem, setPremortem] = useState("");
  const [killCriteria, setKillCriteria] = useState("");
  const [killDate, setKillDate] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [g, f, auth] = await Promise.all([
        supabase.from("goals").select("id, outcome").eq("status", "active"),
        supabase.from("founders").select("user_id, display_name"),
        supabase.auth.getUser(),
      ]);
      setGoals((g.data as Goal[]) ?? []);
      setFounders((f.data as Founder[]) ?? []);
      if (auth.data.user) setOwner(auth.data.user.id);
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        goal_id: goalId || null,
        owner: owner || null,
        premortem: premortem || null,
        kill_criteria: killCriteria || null,
        kill_date: killDate || null,
      }),
    });
    if (!res.ok) {
      setError("Couldn't save. Try again.");
      setSaving(false);
      return;
    }
    const project = await res.json();
    router.push(`/plan/projects/${project.id}`);
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-8">
      <h1 className="text-2xl font-semibold">New project</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium" htmlFor="name">Name</label>
          <input
            id="name"
            required
            className="mt-1 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium" htmlFor="goal">Goal</label>
            <select
              id="goal"
              className="mt-1 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2 text-sm"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">None (ops/admin)</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.outcome}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium" htmlFor="owner">Owner</label>
            <select
              id="owner"
              className="mt-1 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2 text-sm"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              {founders.map((f) => (
                <option key={f.user_id} value={f.user_id}>{f.display_name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="premortem">
            Premortem <span className="font-normal text-qa-text-2">— it&apos;s six weeks out and this failed. Why?</span>
          </label>
          <textarea
            id="premortem"
            rows={2}
            className="mt-1 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2 text-sm"
            value={premortem}
            onChange={(e) => setPremortem(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium" htmlFor="kill">
              Kill criteria <span className="font-normal text-qa-text-2">— what result means we stop?</span>
            </label>
            <input
              id="kill"
              className="mt-1 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2 text-sm"
              value={killCriteria}
              onChange={(e) => setKillCriteria(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="killdate">By</label>
            <input
              id="killdate"
              type="date"
              className="mt-1 w-full rounded-qa-sm border border-qa-line-strong bg-white px-3 py-2 font-mono text-sm"
              value={killDate}
              onChange={(e) => setKillDate(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-qa-warn">{error}</p>}
        <button
          disabled={saving}
          className="rounded-qa-sm bg-qa-accent px-4 py-2 font-semibold text-qa-accent-text disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create project"}
        </button>
      </form>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense>
      <NewProjectForm />
    </Suspense>
  );
}
