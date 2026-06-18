// app/team/page.tsx
// ============================================================
// TEAM TASK CONTROL — clear shared work, my work, and partner work.
// The partner is derived from the signed-in founder, and task creation /
// handoff uses the existing task API so assignments are real.
// ============================================================
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { formatDuration, formatTime, mondayOf, todayISO } from "@/lib/utils";

type Founder = { user_id: string; display_name: string };
type Project = { id: string; name: string; status?: string | null };
type Blk = { id: string; start_at: string; tasks: { title: string; is_anchor: boolean; status: string } | null };
type OpenTask = {
  id: string;
  title: string;
  owner: string | null;
  status: "planned" | "scheduled" | "done" | "killed" | "inbox";
  energy: "deep" | "shallow";
  estimate_minutes: number | null;
  is_anchor: boolean;
  slip_count: number;
  due_date: string | null;
  projects?: { name: string } | null;
};
type RawOpenTask = Omit<OpenTask, "projects"> & { projects?: { name: string }[] | { name: string } | null };
type FounderState = {
  founder: Founder;
  blocks: Blk[];
  anchor: string | null;
  shipped: number;
  open: OpenTask[];
};

const supabase = createBrowserSupabase();

export default function TeamPage() {
  const [me, setMe] = useState<string | null>(null);
  const [states, setStates] = useState<FounderState[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftOwner, setDraftOwner] = useState("");
  const [draftProject, setDraftProject] = useState("");
  const [draftEnergy, setDraftEnergy] = useState<"deep" | "shallow">("shallow");
  const [draftEstimate, setDraftEstimate] = useState(30);

  const today = todayISO();
  const monday = mondayOf(new Date());

  const myState = useMemo(() => states.find((s) => s.founder.user_id === me) ?? null, [states, me]);
  const partnerState = useMemo(() => states.find((s) => s.founder.user_id !== me) ?? null, [states, me]);
  const partnerName = partnerState?.founder.display_name ?? "your partner";
  const allOpen = useMemo(
    () =>
      states
        .flatMap((s) => s.open)
        .sort((a, b) => Number(b.is_anchor) - Number(a.is_anchor) || (b.slip_count ?? 0) - (a.slip_count ?? 0)),
    [states]
  );

  const founderName = useCallback(
    (id: string | null) => states.find((s) => s.founder.user_id === id)?.founder.display_name ?? "Unowned",
    [states]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setMe(uid);

    const [{ data: founders }, { data: projectRows }] = await Promise.all([
      supabase.from("founders").select("user_id, display_name").order("display_name"),
      supabase.from("projects").select("id, name, status").order("created_at", { ascending: false }),
    ]);
    const founderList = ((founders as Founder[]) ?? []).sort((a, b) => (a.user_id === uid ? -1 : b.user_id === uid ? 1 : a.display_name.localeCompare(b.display_name)));
    const activeProjects = ((projectRows as Project[]) ?? []).filter((p) => p.status !== "killed");
    setProjects(activeProjects);
    setDraftProject((current) => current || activeProjects[0]?.id || "");

    const results = await Promise.all(
      founderList.map(async (f) => {
        const [{ data: blocks }, { data: anchor }, { count: shipped }, { data: open }] = await Promise.all([
          supabase.from("schedule_blocks").select("id, start_at, tasks(title, is_anchor, status)").eq("founder_id", f.user_id).eq("block_date", today).order("start_at"),
          supabase.from("anchor_commitments").select("commitment").eq("founder_id", f.user_id).eq("week_start", monday).maybeSingle(),
          supabase.from("tasks").select("id", { count: "exact", head: true }).eq("owner", f.user_id).eq("status", "done").gte("completed_at", `${monday}T00:00:00`),
          supabase
            .from("tasks")
            .select("id, title, owner, status, energy, estimate_minutes, is_anchor, slip_count, due_date, projects(name)")
            .eq("owner", f.user_id)
            .in("status", ["planned", "scheduled"])
            .order("is_anchor", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);
        return {
          founder: f,
          blocks: (blocks as unknown as Blk[]) ?? [],
          anchor: anchor?.commitment ?? null,
          shipped: shipped ?? 0,
          open: ((open as unknown as RawOpenTask[]) ?? []).map((task) => ({
            ...task,
            projects: Array.isArray(task.projects) ? task.projects[0] ?? null : task.projects ?? null,
          })),
        };
      })
    );
    setStates(results);
    setDraftOwner((current) => current || results.find((s) => s.founder.user_id !== uid)?.founder.user_id || uid || "");
    setLoading(false);
  }, [today, monday]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateTask(taskId: string, patch: Partial<OpenTask>, success: string) {
    setNote(success);
    setStates((prev) =>
      prev.map((st) => ({
        ...st,
        open:
          patch.status === "done" || patch.status === "killed"
            ? st.open.filter((t) => t.id !== taskId)
            : st.open.map((t) => (t.id === taskId ? { ...t, ...patch } : t)).filter((t) => patch.owner == null || t.id !== taskId || patch.owner === st.founder.user_id),
      }))
    );
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch {
      setNote("That task did not update. Refreshing the board.");
      await load();
    }
  }

  async function createTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = draftTitle.trim();
    if (!title || !draftOwner || !draftProject) return;
    setSaving(true);
    setNote(`Sending task to ${founderName(draftOwner)}.`);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: draftProject,
          title,
          owner: draftOwner,
          status: "planned",
          energy: draftEnergy,
          estimate_minutes: draftEstimate,
          week_assigned: monday,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDraftTitle("");
      setNote(`Task sent to ${founderName(draftOwner)}.`);
      await load();
    } catch {
      setNote("Could not create that task. Check the project and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="h-7 w-52 animate-pulse rounded bg-qa-surface-2" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-qa bg-qa-surface" />
          <div className="h-72 animate-pulse rounded-qa bg-qa-surface" />
          <div className="h-72 animate-pulse rounded-qa bg-qa-surface" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-5 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="qa-eyebrow text-qa-accent">Team task control</p>
          <h1 className="mt-1 text-3xl font-[700] tracking-normal">Me and {partnerName}</h1>
          <p className="mt-1 max-w-2xl text-sm text-qa-text-2">
            See the whole team queue, assign work to yourself or {partnerName}, and hand tasks across without hunting.
          </p>
        </div>
        {note && <span className="rounded-full border border-qa-accent/35 bg-qa-accent-soft px-3 py-1.5 text-sm text-qa-accent qa-fade" role="status">{note}</span>}
      </div>

      <form onSubmit={createTask} className="qa-hud-panel mt-5 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_120px_112px]">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder={`Send a task to ${partnerName}...`}
            className="qa-input min-h-11"
          />
          <select value={draftOwner} onChange={(e) => setDraftOwner(e.target.value)} className="qa-input min-h-11">
            {states.map((s) => (
              <option key={s.founder.user_id} value={s.founder.user_id}>
                {s.founder.user_id === me ? "Me" : s.founder.display_name}
              </option>
            ))}
          </select>
          <select value={draftProject} onChange={(e) => setDraftProject(e.target.value)} className="qa-input min-h-11">
            {projects.length === 0 ? (
              <option value="">No active project</option>
            ) : (
              projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)
            )}
          </select>
          <select value={draftEnergy} onChange={(e) => setDraftEnergy(e.target.value as "deep" | "shallow")} className="qa-input min-h-11">
            <option value="shallow">Shallow</option>
            <option value="deep">Deep</option>
          </select>
          <select value={draftEstimate} onChange={(e) => setDraftEstimate(Number(e.target.value))} className="qa-input min-h-11">
            {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-qa-text-3">
            {projects.length === 0 ? (
              <>Create an active <Link href="/plan/projects/new" className="text-qa-accent hover:underline">project</Link> before sending tasks.</>
            ) : (
              <>New tasks land in this week&apos;s planned queue for the selected owner.</>
            )}
          </p>
          <button disabled={saving || !draftTitle.trim() || !draftOwner || !draftProject} className="qa-btn qa-btn-primary">
            {saving ? "Sending..." : "Send task"}
          </button>
        </div>
      </form>

      <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
        <TaskPanel
          title="Overall team tasks"
          subtitle={`${allOpen.length} open across the team`}
          tasks={allOpen}
          founders={states.map((s) => s.founder)}
          me={me}
          ownerName={founderName}
          onUpdate={updateTask}
          prominent
        />
        <div className="grid gap-4">
          <FounderBrief state={myState} label="Me" />
          <FounderBrief state={partnerState} label={partnerName} />
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <TaskPanel
          title="My tasks"
          subtitle={myState ? `${myState.open.length} tasks owned by you` : "No founder found"}
          tasks={myState?.open ?? []}
          founders={states.map((s) => s.founder)}
          me={me}
          ownerName={founderName}
          onUpdate={updateTask}
        />
        <TaskPanel
          title={`${partnerName}'s tasks`}
          subtitle={partnerState ? `${partnerState.open.length} tasks owned by ${partnerName}` : "No partner found"}
          tasks={partnerState?.open ?? []}
          founders={states.map((s) => s.founder)}
          me={me}
          ownerName={founderName}
          onUpdate={updateTask}
        />
      </section>
    </div>
  );
}

function FounderBrief({ state, label }: { state: FounderState | null; label: string }) {
  if (!state) {
    return (
      <section className="qa-card p-4">
        <p className="qa-eyebrow">{label}</p>
        <p className="mt-2 text-sm text-qa-text-3">No founder profile loaded.</p>
      </section>
    );
  }
  const next = state.blocks.find((b) => b.tasks?.status !== "done");
  return (
    <section className="qa-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="qa-eyebrow">{label}</p>
          <h2 className="mt-1 text-lg font-semibold">{state.founder.display_name}</h2>
        </div>
        <span className="rounded-full border border-qa-line bg-qa-glass px-2.5 py-1 font-mono text-xs text-qa-text-2">
          {state.shipped} shipped
        </span>
      </div>
      <div className="mt-3 rounded-qa-sm border border-qa-line bg-qa-glass px-3 py-2">
        <p className="qa-eyebrow text-qa-accent">Weekly anchor</p>
        <p className="mt-1 text-sm">{state.anchor ?? <span className="text-qa-text-3">Not set yet.</span>}</p>
      </div>
      <div className="mt-3">
        <p className="qa-eyebrow">Today</p>
        {next ? (
          <p className="mt-1 truncate text-sm">
            <span className="mr-2 font-mono text-xs text-qa-text-3">{formatTime(next.start_at)}</span>
            {next.tasks?.title ?? "Scheduled block"}
          </p>
        ) : (
          <p className="mt-1 text-sm text-qa-text-3">No open block scheduled.</p>
        )}
      </div>
    </section>
  );
}

function TaskPanel({
  title,
  subtitle,
  tasks,
  founders,
  me,
  ownerName,
  onUpdate,
  prominent,
}: {
  title: string;
  subtitle: string;
  tasks: OpenTask[];
  founders: Founder[];
  me: string | null;
  ownerName: (id: string | null) => string;
  onUpdate: (taskId: string, patch: Partial<OpenTask>, success: string) => Promise<void>;
  prominent?: boolean;
}) {
  return (
    <section className={`${prominent ? "qa-hud-panel" : "qa-card"} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 border-b border-qa-line px-4 py-3">
        <div>
          <p className="qa-eyebrow text-qa-accent">{title}</p>
          <p className="mt-0.5 text-sm text-qa-text-2">{subtitle}</p>
        </div>
      </div>
      <div className="divide-y divide-qa-line">
        {tasks.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-qa-text-3">Clear.</p>
        ) : (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              founders={founders}
              me={me}
              ownerName={ownerName}
              onUpdate={onUpdate}
            />
          ))
        )}
      </div>
    </section>
  );
}

function TaskRow({
  task,
  founders,
  me,
  ownerName,
  onUpdate,
}: {
  task: OpenTask;
  founders: Founder[];
  me: string | null;
  ownerName: (id: string | null) => string;
  onUpdate: (taskId: string, patch: Partial<OpenTask>, success: string) => Promise<void>;
}) {
  const partner = founders.find((f) => f.user_id !== task.owner);
  const canSendToMe = me && task.owner !== me;
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <button
          aria-label={`Mark ${task.title} done`}
          onClick={() => onUpdate(task.id, { status: "done" }, "Task marked done.")}
          className="mt-0.5 h-5 w-5 shrink-0 rounded-qa-sm border-[1.5px] border-qa-line-strong transition-colors hover:border-qa-accent hover:bg-qa-accent-soft"
        />
        <div className="min-w-[180px] flex-1">
          <p className="font-medium leading-snug">
            {task.title}
            {task.is_anchor && <span className="ml-2 rounded-full bg-qa-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-qa-accent">anchor</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-qa-text-3">
            <span className="rounded-full bg-qa-glass px-2 py-0.5">{ownerName(task.owner)}</span>
            {task.projects?.name && <span>{task.projects.name}</span>}
            <span>{task.energy}</span>
            <span>{formatDuration(task.estimate_minutes ?? 30)}</span>
            {task.slip_count > 0 && <span>moved x{task.slip_count}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {partner && (
            <button
              onClick={() => onUpdate(task.id, { owner: partner.user_id, status: "planned" }, `Sent to ${partner.display_name}.`)}
              className="rounded-full border border-qa-line-strong px-3 py-1 text-xs font-semibold text-qa-text-2 transition-colors hover:border-qa-accent hover:text-qa-accent"
            >
              Send to {partner.display_name}
            </button>
          )}
          {canSendToMe && (
            <button
              onClick={() => onUpdate(task.id, { owner: me, status: "planned" }, "Moved to you.")}
              className="rounded-full border border-qa-line-strong px-3 py-1 text-xs font-semibold text-qa-text-2 transition-colors hover:border-qa-accent hover:text-qa-accent"
            >
              Take it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
