// app/plan/goals/[id]/page.tsx
// Goal detail: outcome, target date, status, indicators with weekly
// actuals (inline SVG sparkline), projects list. Inline edit toggle.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import ProjectCard, { type ProjectRow } from "@/components/project-card";
import { weeksUntil } from "@/lib/utils";

type Entry = { week_start: string; actual: number };
type Indicator = {
  id: string;
  name: string;
  weekly_target: number;
  unit: string;
  indicator_entries: Entry[];
};
type Goal = {
  id: string;
  quarter: string;
  outcome: string;
  target_date: string;
  status: string;
};

const supabase = createBrowserSupabase();

function Sparkline({ entries, target }: { entries: Entry[]; target: number }) {
  const points = [...entries]
    .sort((a, b) => (a.week_start < b.week_start ? -1 : 1))
    .slice(-8)
    .map((e) => e.actual);
  if (points.length === 0) return <span className="text-xs text-qa-text-2">—</span>;
  const latest = points[points.length - 1];
  const onTrack = target === 0 || latest >= target * 0.8;
  const max = Math.max(...points, target, 1);
  const step = points.length > 1 ? 60 / (points.length - 1) : 60;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(20 - (p / max) * 17 - 1.5).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={60} height={20} aria-hidden>
      <path d={path} fill="none" strokeWidth="1.5" strokeLinecap="round"
        stroke={onTrack ? "var(--qa-accent)" : "var(--qa-warn)"} />
    </svg>
  );
}

export default function GoalDetailPage({ params }: { params: { id: string } }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Goal | null>(null);
  const [newIndName, setNewIndName] = useState("");
  const [newIndTarget, setNewIndTarget] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [g, i, p] = await Promise.all([
      supabase.from("goals").select("*").eq("id", params.id).maybeSingle(),
      supabase
        .from("indicators")
        .select("*, indicator_entries(week_start, actual)")
        .eq("goal_id", params.id)
        .order("created_at"),
      supabase
        .from("projects")
        .select("*, goals(outcome), tasks(id, status)")
        .eq("goal_id", params.id)
        .order("created_at"),
    ]);
    if (g.error || !g.data) {
      setError("Couldn't load this goal.");
    } else {
      setGoal(g.data as Goal);
      setDraft(g.data as Goal);
      setIndicators((i.data as Indicator[]) ?? []);
      setProjects((p.data as unknown as ProjectRow[]) ?? []);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveGoal() {
    if (!draft) return;
    await fetch(`/api/goals/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome: draft.outcome,
        quarter: draft.quarter,
        target_date: draft.target_date,
        status: draft.status,
      }),
    });
    setEditing(false);
    void load();
  }

  async function addIndicator(e: React.FormEvent) {
    e.preventDefault();
    if (!newIndName || !newIndTarget) return;
    await fetch("/api/indicators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: params.id,
        name: newIndName,
        weekly_target: Number(newIndTarget),
      }),
    });
    setNewIndName("");
    setNewIndTarget("");
    void load();
  }

  if (loading)
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="h-7 w-2/3 animate-pulse rounded bg-qa-surface-2" />
        <div className="mt-4 h-32 animate-pulse rounded-qa bg-qa-surface" />
      </div>
    );
  if (error || !goal)
    return (
      <div className="mx-auto max-w-2xl px-5 py-8 text-qa-text-2">
        {error ?? "Goal not found."} <Link className="underline" href="/plan">Back to Plan</Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/plan" className="text-sm text-qa-text-2 hover:underline">← Plan</Link>

      {editing && draft ? (
        <div className="mt-3 space-y-3 rounded-qa border border-qa-line bg-white p-4">
          <input
            className="w-full rounded-qa-sm border border-qa-line-strong px-3 py-2 text-lg font-semibold"
            value={draft.outcome}
            onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
          />
          <div className="flex flex-wrap gap-3">
            <input
              className="rounded-qa-sm border border-qa-line-strong px-3 py-1.5 font-mono text-sm"
              value={draft.quarter}
              onChange={(e) => setDraft({ ...draft, quarter: e.target.value })}
            />
            <input
              type="date"
              className="rounded-qa-sm border border-qa-line-strong px-3 py-1.5 font-mono text-sm"
              value={draft.target_date}
              onChange={(e) => setDraft({ ...draft, target_date: e.target.value })}
            />
            <select
              className="rounded-qa-sm border border-qa-line-strong px-3 py-1.5 text-sm"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              {["active", "paused", "done", "killed"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={saveGoal} className="rounded-qa-sm bg-qa-accent px-3 py-1.5 text-sm font-semibold text-qa-accent-text">Save</button>
            <button onClick={() => setEditing(false)} className="px-2 text-sm text-qa-text-2">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold leading-snug">{goal.outcome}</h1>
            <p className="mt-1 text-sm text-qa-text-2">
              {goal.quarter} · {goal.target_date} ·{" "}
              <span className="font-mono">{weeksUntil(goal.target_date)}w</span> left · {goal.status}
            </p>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-qa-sm border border-qa-line-strong px-3 py-1.5 text-sm hover:bg-qa-surface"
          >
            Edit
          </button>
        </div>
      )}

      {/* Indicators */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
          Leading indicators
        </h2>
        <div className="mt-2 rounded-qa border border-qa-line bg-white p-4">
          {indicators.map((ind) => {
            const sorted = [...ind.indicator_entries].sort((a, b) =>
              a.week_start < b.week_start ? -1 : 1
            );
            const latest = sorted[sorted.length - 1]?.actual;
            return (
              <div key={ind.id} className="flex items-center gap-3 border-b border-qa-line py-2 text-sm last:border-0">
                <span className="min-w-0 flex-1 truncate">{ind.name}</span>
                <span className="font-mono text-xs text-qa-text-2">
                  {latest ?? "–"}/{ind.weekly_target} {ind.unit !== "count" ? ind.unit : ""}
                </span>
                <Sparkline entries={ind.indicator_entries} target={ind.weekly_target} />
              </div>
            );
          })}
          <form onSubmit={addIndicator} className="mt-2 flex gap-2">
            <input
              placeholder="New indicator (e.g. demos booked)"
              className="min-w-0 flex-1 rounded-qa-sm border border-qa-line-strong px-3 py-1.5 text-sm"
              value={newIndName}
              onChange={(e) => setNewIndName(e.target.value)}
            />
            <input
              placeholder="target/wk"
              type="number"
              className="w-24 rounded-qa-sm border border-qa-line-strong px-3 py-1.5 font-mono text-sm"
              value={newIndTarget}
              onChange={(e) => setNewIndTarget(e.target.value)}
            />
            <button className="rounded-qa-sm border border-qa-line-strong px-3 py-1.5 text-sm hover:bg-qa-surface">
              Add
            </button>
          </form>
        </div>
      </section>

      {/* Projects */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
            Projects
          </h2>
          <Link
            href={`/plan/projects/new?goal_id=${goal.id}`}
            className="rounded-qa-sm bg-qa-accent px-3 py-1.5 text-sm font-semibold text-qa-accent-text"
          >
            New project
          </Link>
        </div>
        <div className="mt-2 space-y-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
          {projects.length === 0 && (
            <p className="rounded-qa border border-dashed border-qa-line-strong p-6 text-center text-sm text-qa-text-2">
              No projects yet. Start one that moves this goal.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
