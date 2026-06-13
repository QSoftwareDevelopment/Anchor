// app/plan/projects/[id]/page.tsx
// Project detail: editable fields, task list grouped by status
// (planned → scheduled → done → killed), inline add-task row.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import TaskCard, { type TaskRow } from "@/components/task-card";

type Founder = { user_id: string; display_name: string };
type Project = {
  id: string;
  name: string;
  status: string;
  owner: string | null;
  goal_id: string | null;
  premortem: string | null;
  kill_criteria: string | null;
  kill_date: string | null;
  goals: { id: string; outcome: string } | null;
};

const supabase = createBrowserSupabase();
const STATUS_ORDER = ["planned", "scheduled", "done", "killed"] as const;

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Project | null>(null);
  const [newTask, setNewTask] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, t, f] = await Promise.all([
      supabase
        .from("projects")
        .select("*, goals(id, outcome)")
        .eq("id", params.id)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("*")
        .eq("project_id", params.id)
        .order("created_at"),
      supabase.from("founders").select("user_id, display_name"),
    ]);
    if (p.error || !p.data) {
      setError("Couldn't load this project.");
    } else {
      setProject(p.data as Project);
      setDraft(p.data as Project);
      setTasks((t.data as TaskRow[]) ?? []);
      setFounders((f.data as Founder[]) ?? []);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProject() {
    if (!draft) return;
    await fetch(`/api/projects/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        status: draft.status,
        owner: draft.owner,
        premortem: draft.premortem,
        kill_criteria: draft.kill_criteria,
        kill_date: draft.kill_date,
      }),
    });
    setEditing(false);
    void load();
  }

  async function updateTask(id: string, patch: Partial<TaskRow>) {
    // optimistic
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    void load();
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.trim()) return;
    const title = newTask.trim();
    setNewTask("");
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: params.id, title }),
    });
    void load();
  }

  if (loading)
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="h-7 w-2/3 animate-pulse rounded bg-qa-surface-2" />
        <div className="mt-4 h-40 animate-pulse rounded-qa bg-qa-surface" />
      </div>
    );
  if (error || !project)
    return (
      <div className="mx-auto max-w-2xl px-5 py-8 text-qa-text-2">
        {error ?? "Project not found."} <Link className="underline" href="/plan">Back to Plan</Link>
      </div>
    );

  const ownerName = founders.find((f) => f.user_id === project.owner)?.display_name;
  const grouped = STATUS_ORDER.map((s) => ({
    status: s,
    items: tasks.filter((t) => t.status === s),
  }));

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      {project.goals ? (
        <Link
          href={`/plan/goals/${project.goals.id}`}
          className="text-sm text-qa-text-2 hover:underline"
        >
          ← {project.goals.outcome}
        </Link>
      ) : (
        <Link href="/plan" className="text-sm text-qa-text-2 hover:underline">← Plan</Link>
      )}

      {editing && draft ? (
        <div className="mt-3 space-y-3 rounded-qa border border-qa-line bg-white p-4">
          <input
            className="w-full rounded-qa-sm border border-qa-line-strong px-3 py-2 text-lg font-semibold"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <div className="flex flex-wrap gap-3">
            <select
              className="rounded-qa-sm border border-qa-line-strong px-3 py-1.5 text-sm"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              {["active", "paused", "done", "killed"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              className="rounded-qa-sm border border-qa-line-strong px-3 py-1.5 text-sm"
              value={draft.owner ?? ""}
              onChange={(e) => setDraft({ ...draft, owner: e.target.value || null })}
            >
              <option value="">unowned</option>
              {founders.map((f) => (
                <option key={f.user_id} value={f.user_id}>{f.display_name}</option>
              ))}
            </select>
            <input
              type="date"
              className="rounded-qa-sm border border-qa-line-strong px-3 py-1.5 font-mono text-sm"
              value={draft.kill_date ?? ""}
              onChange={(e) => setDraft({ ...draft, kill_date: e.target.value || null })}
            />
          </div>
          <textarea
            rows={2}
            placeholder="Premortem — it's six weeks out and this failed. Why?"
            className="w-full rounded-qa-sm border border-qa-line-strong px-3 py-2 text-sm"
            value={draft.premortem ?? ""}
            onChange={(e) => setDraft({ ...draft, premortem: e.target.value || null })}
          />
          <input
            placeholder="Kill criteria — what result by what date means we stop?"
            className="w-full rounded-qa-sm border border-qa-line-strong px-3 py-2 text-sm"
            value={draft.kill_criteria ?? ""}
            onChange={(e) => setDraft({ ...draft, kill_criteria: e.target.value || null })}
          />
          <div className="flex gap-2">
            <button onClick={saveProject} className="rounded-qa-sm bg-qa-accent px-3 py-1.5 text-sm font-semibold text-qa-accent-text">Save</button>
            <button onClick={() => setEditing(false)} className="px-2 text-sm text-qa-text-2">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold leading-snug">{project.name}</h1>
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 rounded-qa-sm border border-qa-line-strong px-3 py-1.5 text-sm hover:bg-qa-surface"
            >
              Edit
            </button>
          </div>
          <p className="mt-1 text-sm text-qa-text-2">
            {ownerName ? `${ownerName} · ` : ""}{project.status}
            {project.kill_date ? ` · decision point ${project.kill_date}` : ""}
          </p>
          {project.premortem && (
            <p className="mt-2 text-sm text-qa-text-2">
              <span className="font-medium text-qa-text">Premortem:</span> {project.premortem}
            </p>
          )}
          {project.kill_criteria && (
            <p className="mt-1 text-sm text-qa-text-2">
              <span className="font-medium text-qa-text">Kill criteria:</span> {project.kill_criteria}
            </p>
          )}
        </div>
      )}

      {/* Tasks grouped by status */}
      <section className="mt-8">
        {grouped.map(({ status, items }) => (
          <div key={status} className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
              {status}
              <span className="ml-2 font-mono text-xs">{items.length}</span>
            </h2>
            <div className="mt-1">
              {items.map((t) => (
                <TaskCard key={t.id} task={t} founders={founders} onUpdate={updateTask} />
              ))}
              {items.length === 0 && status === "planned" && (
                <p className="border-t border-qa-line py-2.5 text-sm text-qa-text-2">
                  Nothing planned. Add the next concrete step below.
                </p>
              )}
            </div>
            {status === "planned" && (
              <form onSubmit={addTask} className="mt-1 flex gap-2 border-t border-qa-line pt-2.5">
                <input
                  placeholder="Add a task…"
                  className="min-w-0 flex-1 rounded-qa-sm border border-qa-line-strong bg-white px-3 py-1.5 text-sm"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                />
                <button className="rounded-qa-sm border border-qa-line-strong px-3 py-1.5 text-sm hover:bg-qa-surface">
                  Add
                </button>
              </form>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
