// app/goals/page.tsx
// ============================================================
// GOALS — the big picture. Each quarterly outcome as a large card
// with a momentum bar (averaged from its leading indicators), a
// countdown to the target date, and its active projects. This is
// the "why" the rest of the app hangs off.
// ============================================================
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase";
import { weeksUntil } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Entry = { week_start: string; actual: number };
type Indicator = { id: string; name: string; weekly_target: number; unit: string; indicator_entries: Entry[] };
type Goal = {
  id: string;
  quarter: string;
  outcome: string;
  target_date: string;
  status: string;
  indicators: Indicator[];
  projects: { id: string; name: string; status: string }[];
};

function latestActual(ind: Indicator): number | null {
  const sorted = [...ind.indicator_entries].sort((a, b) => (a.week_start < b.week_start ? -1 : 1));
  return sorted.length ? sorted[sorted.length - 1].actual : null;
}

function momentum(goal: Goal): number | null {
  const measured = goal.indicators.filter((i) => i.weekly_target > 0 && latestActual(i) !== null);
  if (!measured.length) return null;
  const avg =
    measured.reduce((sum, i) => sum + Math.min(1, (latestActual(i) as number) / i.weekly_target), 0) /
    measured.length;
  return Math.round(avg * 100);
}

export default async function GoalsPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("goals")
    .select("*, indicators(*, indicator_entries(week_start, actual)), projects(id, name, status)")
    .order("target_date", { ascending: true });

  const goals = (data as Goal[]) ?? [];
  const active = goals.filter((g) => g.status === "active");
  const nearest = active.map((g) => weeksUntil(g.target_date)).sort((a, b) => a - b)[0];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="qa-eyebrow">The big picture</p>
          <h1 className="mt-0.5 text-2xl font-[650]">Goals</h1>
        </div>
        <Link href="/plan/goals/new" className="qa-btn qa-btn-primary text-sm">
          + New goal
        </Link>
      </div>

      {active.length > 0 && (
        <p className="mt-3 text-sm text-qa-text-2">
          <span className="font-semibold text-qa-text">{active.length}</span> active outcome{active.length === 1 ? "" : "s"}
          {nearest != null && (
            <> · nearest deadline <span className="font-mono text-qa-accent">{nearest}w</span> out</>
          )}
        </p>
      )}

      <div className="mt-6 space-y-4">
        {goals.map((g, i) => {
          const m = momentum(g);
          const weeks = weeksUntil(g.target_date);
          const activeProjects = g.projects.filter((p) => p.status === "active");
          const onTrack = m == null ? null : m >= 70;
          return (
            <Link
              key={g.id}
              href={`/plan/goals/${g.id}`}
              className="qa-card-link qa-rise block p-5"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="qa-eyebrow text-qa-text-3">{g.quarter}</p>
                  <h2 className="mt-1 text-xl font-[650] leading-snug">{g.outcome}</h2>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    g.status === "active" ? "bg-qa-accent-soft text-qa-accent" : "bg-qa-glass text-qa-text-2"
                  }`}
                >
                  {g.status}
                </span>
              </div>

              {/* momentum bar */}
              {m != null && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-qa-text-2">Momentum from indicators</span>
                    <span className={`font-mono font-semibold ${onTrack ? "text-qa-success" : "text-qa-warn"}`}>{m}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-qa-glass-2">
                    <div
                      className="qa-grow-x h-full rounded-full"
                      style={{
                        width: `${m}%`,
                        background: onTrack ? "var(--qa-grad)" : "linear-gradient(90deg, #fbbf24, #f59e0b)",
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-qa-text-2">
                <span>
                  <span className="font-mono text-qa-text">{weeks}w</span> left
                </span>
                <span className="text-qa-text-3">·</span>
                <span>Due {g.target_date}</span>
                <span className="text-qa-text-3">·</span>
                <span>
                  {activeProjects.length} active project{activeProjects.length === 1 ? "" : "s"}
                </span>
              </div>

              {g.indicators.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-qa-line pt-3">
                  {g.indicators.map((ind) => {
                    const latest = latestActual(ind);
                    const pct = ind.weekly_target > 0 && latest != null ? Math.min(100, Math.round((latest / ind.weekly_target) * 100)) : 0;
                    return (
                      <div key={ind.id} className="flex items-center gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate text-qa-text-2">{ind.name}</span>
                        <span className="font-mono text-xs text-qa-text-2">
                          {latest ?? "–"}/{ind.weekly_target}
                          <span className="text-qa-text-3"> {ind.unit}</span>
                        </span>
                        <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-qa-glass-2">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: pct >= 80 ? "var(--qa-accent)" : "var(--qa-warn)" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeProjects.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeProjects.slice(0, 5).map((p) => (
                    <span key={p.id} className="qa-chip">
                      {p.name}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          );
        })}

        {goals.length === 0 && (
          <div className="rounded-qa border border-dashed border-qa-line-strong p-10 text-center text-qa-text-2">
            <p className="font-medium text-qa-text">No goals yet.</p>
            <p className="mt-1 text-sm">Set the quarter&apos;s outcome — everything else hangs off it.</p>
            <Link href="/plan/goals/new" className="qa-btn qa-btn-primary mt-4 inline-flex text-sm">
              Set your first goal
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
