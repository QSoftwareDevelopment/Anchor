// app/review/weekly/page.tsx
// The Sunday review. Left: the agent's weekly review. Right: next
// week's proposed plan — editable, then confirmed. The agent
// proposed; the confirm button is the founders committing.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import ReviewCard from "@/components/review-card";
import ConfirmModal from "@/components/confirm-modal";
import { formatDuration, mondayOf, nextMondayOf } from "@/lib/utils";
import type { PlannerResult } from "@/lib/agents";

type Founder = { user_id: string; display_name: string };
type OpenTask = {
  id: string;
  title: string;
  owner: string | null;
  estimate_minutes: number | null;
  energy: string;
  slip_count: number;
  status: string;
  projects: { name: string } | null;
};
type Indicator = { id: string; name: string; weekly_target: number };
type Anchor = {
  week_start: string;
  founder_id: string;
  commitment: string;
  kept: boolean | null;
  founders: { display_name: string } | { display_name: string }[] | null;
};
type WeeklyReviewRow = {
  id: string;
  period_start: string;
  agent_summary: {
    review_markdown: string | null;
    proposed_plan: PlannerResult | null;
  } | null;
};

const supabase = createBrowserSupabase();
const SLIP_ACTIONS = ["reschedule", "shrink", "hand off", "kill"] as const;

export default function WeeklyReviewPage() {
  const [review, setReview] = useState<WeeklyReviewRow | null>(null);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [tasks, setTasks] = useState<OpenTask[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [indicatorActuals, setIndicatorActuals] = useState<Record<string, string>>({});
  const [thisWeekAnchors, setThisWeekAnchors] = useState<Anchor[]>([]);
  const [assignments, setAssignments] = useState<Record<string, { owner: string; inWeek: boolean }>>({});
  const [oneMetric, setOneMetric] = useState("");
  const [anchorSid, setAnchorSid] = useState("");
  const [anchorAaryan, setAnchorAaryan] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekStart = useMemo(() => {
    // Sunday: plan next week. Mon–Sat: whichever upcoming Monday the prep targeted.
    const now = new Date();
    return now.getDay() === 1 ? mondayOf(now) : nextMondayOf(now);
  }, []);

  const load = useCallback(async () => {
    try {
      const [r, f, t, g, an] = await Promise.all([
        fetch("/api/reviews/weekly").then((res) => res.json()),
        supabase.from("founders").select("user_id, display_name"),
        supabase
          .from("tasks")
          .select("id, title, owner, estimate_minutes, energy, slip_count, status, projects(name)")
          .in("status", ["planned", "scheduled"]),
        supabase.from("indicators").select("id, name, weekly_target"),
        supabase
          .from("anchor_commitments")
          .select("week_start, founder_id, commitment, kept, founders(display_name)")
          .eq("week_start", mondayOf(new Date())),
      ]);
      setThisWeekAnchors((an.data as unknown as Anchor[]) ?? []);
      setReview(r as WeeklyReviewRow | null);
      setFounders((f.data as Founder[]) ?? []);
      setTasks((t.data as unknown as OpenTask[]) ?? []);
      setIndicators((g.data as Indicator[]) ?? []);

      const plan = (r as WeeklyReviewRow | null)?.agent_summary?.proposed_plan;
      if (plan) {
        setOneMetric(plan.one_metric ?? "");
        setAnchorSid(plan.proposed_anchor_sid ?? "");
        setAnchorAaryan(plan.proposed_anchor_aaryan ?? "");
        const next: Record<string, { owner: string; inWeek: boolean }> = {};
        for (const a of plan.task_assignments ?? []) {
          next[a.task_id] = { owner: a.owner, inWeek: true };
        }
        setAssignments(next);
      }
    } catch {
      setError("Couldn't load the review.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleTask(taskId: string, defaultOwner: string) {
    setAssignments((a) => {
      const cur = a[taskId];
      if (cur?.inWeek) return { ...a, [taskId]: { ...cur, inWeek: false } };
      return { ...a, [taskId]: { owner: cur?.owner ?? defaultOwner, inWeek: true } };
    });
  }

  async function slipAction(taskId: string, action: (typeof SLIP_ACTIONS)[number]) {
    if (action === "kill") {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "killed" }),
      });
      setTasks((ts) => ts.filter((t) => t.id !== taskId));
      setAssignments((a) => ({ ...a, [taskId]: { owner: "", inWeek: false } }));
    } else if (action === "reschedule") {
      const t = tasks.find((x) => x.id === taskId);
      setAssignments((a) => ({
        ...a,
        [taskId]: { owner: a[taskId]?.owner ?? t?.owner ?? "", inWeek: true },
      }));
    } else if (action === "shrink") {
      const t = tasks.find((x) => x.id === taskId);
      const next = Math.max(15, Math.floor((t?.estimate_minutes ?? 30) / 2 / 15) * 15);
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate_minutes: next }),
      });
      setTasks((ts) =>
        ts.map((x) => (x.id === taskId ? { ...x, estimate_minutes: next } : x))
      );
    } else if (action === "hand off") {
      const t = tasks.find((x) => x.id === taskId);
      const other = founders.find((f) => f.user_id !== t?.owner);
      if (other) {
        setAssignments((a) => ({
          ...a,
          [taskId]: { owner: other.user_id, inWeek: true },
        }));
      }
    }
  }

  async function confirm() {
    setConfirming(true);
    const confirmed_assignments = Object.entries(assignments)
      .filter(([, v]) => v.inWeek && v.owner)
      .map(([task_id, v]) => ({ task_id, owner: v.owner, week_start: weekStart }));
    const indicator_entries = Object.entries(indicatorActuals)
      .filter(([, v]) => v !== "")
      .map(([indicator_id, v]) => ({ indicator_id, actual: Number(v) }));

    const res = await fetch("/api/reviews/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        week_start: weekStart,
        one_metric: oneMetric,
        anchor_sid: anchorSid,
        anchor_aaryan: anchorAaryan,
        confirmed_assignments,
        indicator_entries,
      }),
    });
    setConfirming(false);
    setModalOpen(false);
    if (res.ok) setConfirmed(true);
    else setError("Couldn't commit the plan. Try again.");
  }

  const founderName = (id: string | null) =>
    founders.find((f) => f.user_id === id)?.display_name ?? "—";

  async function markAnchor(anchor: Anchor, kept: boolean) {
    setThisWeekAnchors((as) =>
      as.map((a) => (a.founder_id === anchor.founder_id ? { ...a, kept } : a))
    );
    await fetch("/api/anchors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        week_start: anchor.week_start,
        founder_id: anchor.founder_id,
        commitment: anchor.commitment,
        kept,
      }),
    });
  }

  const taskCountByFounder = founders.map((f) => ({
    name: f.display_name,
    count: Object.values(assignments).filter((a) => a.inWeek && a.owner === f.user_id).length,
  }));

  const slipped = tasks.filter((t) => t.slip_count > 0);
  const plan = review?.agent_summary?.proposed_plan ?? null;
  const markdown = review?.agent_summary?.review_markdown ?? null;

  if (loading)
    return (
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="h-7 w-48 animate-pulse rounded bg-qa-surface-2" />
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="h-80 animate-pulse rounded-qa bg-qa-surface" />
          <div className="h-80 animate-pulse rounded-qa bg-qa-surface" />
        </div>
      </div>
    );

  if (confirmed)
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="text-2xl font-semibold">Week committed.</h1>
        <p className="mt-2 text-qa-text-2">
          The schedule is being written to both calendars. Monday&apos;s brief will have the rest.
        </p>
        <Link
          href="/today"
          className="mt-6 inline-block rounded-qa-sm bg-qa-accent px-4 py-2 font-semibold text-qa-accent-text"
        >
          Back to Today
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sunday review</h1>
        <span className="font-mono text-sm text-qa-text-2">week of {weekStart}</span>
      </div>
      {error && <p className="mt-3 text-sm text-qa-warn">{error}</p>}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* LEFT — the review */}
        <div className="space-y-5">
          {markdown ? (
            <ReviewCard summary={markdown} />
          ) : (
            <div className="rounded-qa border border-dashed border-qa-line-strong p-8 text-center text-sm text-qa-text-2">
              The prepared review isn&apos;t here yet — it&apos;s generated Friday afternoon.
              Run the week anyway: assign tasks on the right and commit.
            </div>
          )}

          {/* this week's anchors — settle them before planning the next */}
          {thisWeekAnchors.length > 0 && (
            <div className="rounded-qa border border-qa-line bg-white p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
                This week&apos;s anchors
              </h2>
              <div className="mt-2 space-y-3">
                {thisWeekAnchors.map((a) => {
                  const fr = Array.isArray(a.founders) ? a.founders[0] : a.founders;
                  return (
                    <div key={a.founder_id}>
                      <p className="text-sm">
                        <span className="font-medium">{fr?.display_name ?? "—"}:</span>{" "}
                        {a.commitment}
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        <button
                          onClick={() => markAnchor(a, true)}
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            a.kept === true
                              ? "bg-qa-accent text-qa-accent-text"
                              : "border border-qa-line-strong hover:bg-qa-surface"
                          }`}
                        >
                          kept
                        </button>
                        <button
                          onClick={() => markAnchor(a, false)}
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            a.kept === false
                              ? "bg-qa-surface-2 text-qa-text"
                              : "border border-qa-line-strong hover:bg-qa-surface"
                          }`}
                        >
                          didn&apos;t happen
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* indicator actuals entry */}
          {indicators.length > 0 && (
            <div className="rounded-qa border border-qa-line bg-white p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
                This week&apos;s actuals
              </h2>
              <div className="mt-2 space-y-2">
                {indicators.map((ind) => (
                  <div key={ind.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{ind.name}</span>
                    <span className="font-mono text-xs text-qa-text-2">target {ind.weekly_target}</span>
                    <input
                      type="number"
                      placeholder="actual"
                      className="w-24 rounded-qa-sm border border-qa-line-strong px-2 py-1 font-mono text-sm"
                      value={indicatorActuals[ind.id] ?? ""}
                      onChange={(e) =>
                        setIndicatorActuals((v) => ({ ...v, [ind.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* slipped task triage */}
          {slipped.length > 0 && (
            <div className="rounded-qa border border-qa-line bg-white p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
                Slipped — pick one per task
              </h2>
              <div className="mt-2 space-y-3">
                {slipped.map((t) => (
                  <div key={t.id}>
                    <p className="text-sm">
                      {t.title}{" "}
                      <span className="font-mono text-xs text-qa-text-2">moved ×{t.slip_count}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {SLIP_ACTIONS.map((a) => (
                        <button
                          key={a}
                          onClick={() => slipAction(t.id, a)}
                          className="rounded-full border border-qa-line-strong px-3 py-1 text-xs font-medium hover:bg-qa-surface"
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — next week's plan */}
        <div className="space-y-5">
          <div className="rounded-qa border border-qa-accent/30 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-accent">
              The one metric
            </h2>
            <textarea
              rows={2}
              className="mt-2 w-full rounded-qa-sm border border-qa-line-strong px-3 py-2 text-[15px] font-medium"
              placeholder="The single most important measurable thing this week"
              value={oneMetric}
              onChange={(e) => setOneMetric(e.target.value)}
            />
            {plan?.weekly_focus && (
              <p className="mt-1 text-sm text-qa-text-2">{plan.weekly_focus}</p>
            )}
            {plan?.capacity_warning && (
              <p className="mt-2 rounded-qa-sm bg-qa-surface px-3 py-2 text-sm text-qa-warn">
                {plan.capacity_warning}
              </p>
            )}
          </div>

          <div className="rounded-qa border border-qa-line bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
              Task assignments
            </h2>
            <div className="mt-1">
              {tasks.map((t) => {
                const a = assignments[t.id];
                const inWeek = a?.inWeek ?? false;
                const owner = a?.owner ?? t.owner ?? "";
                const killSuggestion = plan?.tasks_to_consider_killing?.find(
                  (k) => k.task_id === t.id
                );
                return (
                  <div key={t.id} className={`border-t border-qa-line py-2.5 ${inWeek ? "" : "opacity-50"}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Include ${t.title} next week`}
                        className="h-[18px] w-[18px] accent-[var(--qa-accent)]"
                        checked={inWeek}
                        onChange={() => toggleTask(t.id, owner || founders[0]?.user_id || "")}
                      />
                      <span className="min-w-0 flex-1 truncate text-[15px]">{t.title}</span>
                      <span className="font-mono text-xs text-qa-text-2">
                        {formatDuration(t.estimate_minutes ?? 30)}
                      </span>
                      <select
                        aria-label={`Owner for ${t.title}`}
                        className="rounded-qa-sm border border-qa-line px-2 py-1 text-xs"
                        value={owner}
                        onChange={(e) =>
                          setAssignments((s) => ({
                            ...s,
                            [t.id]: { owner: e.target.value, inWeek: s[t.id]?.inWeek ?? true },
                          }))
                        }
                      >
                        <option value="">—</option>
                        {founders.map((f) => (
                          <option key={f.user_id} value={f.user_id}>{f.display_name}</option>
                        ))}
                      </select>
                    </div>
                    <p className="ml-[30px] text-xs text-qa-text-2">
                      {t.projects?.name ?? ""}
                      {t.slip_count > 0 ? ` · moved ×${t.slip_count}` : ""}
                    </p>
                    {killSuggestion && (
                      <p className="ml-[30px] mt-1 text-xs text-qa-text-2">
                        Worth killing? {killSuggestion.reason}{" "}
                        <button
                          onClick={() => slipAction(t.id, "kill")}
                          className="font-medium underline"
                        >
                          Kill it
                        </button>
                      </p>
                    )}
                  </div>
                );
              })}
              {tasks.length === 0 && (
                <p className="border-t border-qa-line py-2.5 text-sm text-qa-text-2">
                  No open tasks. Capture some thoughts or add tasks from a project page.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-qa border border-qa-line bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
              Anchors — one each, specific, verifiable
            </h2>
            <label className="mt-2 block text-sm font-medium">Sid</label>
            <input
              className="mt-1 w-full rounded-qa-sm border border-qa-line-strong px-3 py-2 text-sm"
              value={anchorSid}
              onChange={(e) => setAnchorSid(e.target.value)}
            />
            <label className="mt-3 block text-sm font-medium">Aaryan</label>
            <input
              className="mt-1 w-full rounded-qa-sm border border-qa-line-strong px-3 py-2 text-sm"
              value={anchorAaryan}
              onChange={(e) => setAnchorAaryan(e.target.value)}
            />
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="w-full rounded-qa bg-qa-accent px-4 py-3 font-semibold text-qa-accent-text"
          >
            Confirm this week&apos;s plan
          </button>
        </div>
      </div>

      <ConfirmModal
        open={modalOpen}
        oneMetric={oneMetric}
        taskCountByFounder={taskCountByFounder}
        anchorSid={anchorSid}
        anchorAaryan={anchorAaryan}
        confirming={confirming}
        onClose={() => setModalOpen(false)}
        onConfirm={confirm}
      />
    </div>
  );
}
