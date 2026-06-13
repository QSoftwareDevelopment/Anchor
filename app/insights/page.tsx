// app/insights/page.tsx
// ============================================================
// INSIGHTS — where the work is actually going.
//
// This is the reflection surface the weekly challenger question is
// built from: is effort landing on the critical path to the goal, or
// on the more comfortable work? It answers that with data instead of
// a hunch.
//
// Design stance (Self-Determination Theory — competence + autonomy):
// information, never a scorecard. No streaks, no grades, no red. The
// founders draw their own conclusions; the page just makes the pattern
// visible. Company-wide lens, matching the weekly review.
// ============================================================
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { mondayOf, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DoneTask = {
  category: string;
  energy: "deep" | "shallow";
  estimate_minutes: number | null;
  actual_minutes: number | null;
  completed_at: string;
  projects: { goal_id: string | null } | { goal_id: string | null }[] | null;
};
type IndicatorRow = {
  id: string;
  name: string;
  weekly_target: number;
  indicator_entries: { week_start: string; actual: number }[];
};

const minutesOf = (t: DoneTask) => t.actual_minutes ?? t.estimate_minutes ?? 0;
const goalIdOf = (t: DoneTask) => {
  const p = Array.isArray(t.projects) ? t.projects[0] : t.projects;
  return p?.goal_id ?? null;
};

export default async function InsightsPage() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder)
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <p className="text-qa-text-2">Sign in to see insights.</p>
      </div>
    );

  const now = new Date();
  const weekStart = mondayOf(now); // YYYY-MM-DD, this week's Monday
  const windowStart = (() => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() - 28); // this week + prior 4 weeks
    return d.toISOString().slice(0, 10);
  })();

  const [{ data: done }, { data: founders }, { data: profiles }, { data: indicators }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("category, energy, estimate_minutes, actual_minutes, completed_at, projects(goal_id)")
        .eq("status", "done")
        .gte("completed_at", `${windowStart}T00:00:00`),
      supabase.from("founders").select("user_id, display_name"),
      supabase.from("profiles").select("user_id, multipliers"),
      supabase
        .from("indicators")
        .select("id, name, weekly_target, indicator_entries(week_start, actual)"),
    ]);

  const tasks = (done as DoneTask[]) ?? [];
  const thisWeek = tasks.filter((t) => t.completed_at >= `${weekStart}T00:00:00`);
  const prior = tasks.filter((t) => t.completed_at < `${weekStart}T00:00:00`);

  // ---- category breakdown (this week vs prior-4-week weekly average) ----
  const byCat = new Map<string, number>();
  for (const t of thisWeek) byCat.set(t.category, (byCat.get(t.category) ?? 0) + minutesOf(t));
  const priorByCat = new Map<string, number>();
  for (const t of prior) priorByCat.set(t.category, (priorByCat.get(t.category) ?? 0) + minutesOf(t));
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map(([, m]) => m));

  // ---- critical path vs the rest ----
  const goalMin = thisWeek.filter((t) => goalIdOf(t)).reduce((s, t) => s + minutesOf(t), 0);
  const otherMin = thisWeek.filter((t) => !goalIdOf(t)).reduce((s, t) => s + minutesOf(t), 0);
  const totalMin = goalMin + otherMin;
  const goalPct = totalMin > 0 ? Math.round((goalMin / totalMin) * 100) : 0;

  // ---- deep vs shallow ----
  const deepMin = thisWeek.filter((t) => t.energy === "deep").reduce((s, t) => s + minutesOf(t), 0);
  const shallowMin = thisWeek.filter((t) => t.energy === "shallow").reduce((s, t) => s + minutesOf(t), 0);
  const deepPct = deepMin + shallowMin > 0 ? Math.round((deepMin / (deepMin + shallowMin)) * 100) : 0;

  const founderName = (id: string) =>
    (founders as { user_id: string; display_name: string }[] | null)?.find((f) => f.user_id === id)
      ?.display_name ?? "—";

  const hasData = tasks.length > 0;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-semibold">Insights</h1>
      <p className="mt-1 text-sm text-qa-text-2">
        Where the work is actually going. Information, not a scorecard.
      </p>

      {!hasData && (
        <div className="mt-6 rounded-qa border border-dashed border-qa-line-strong p-10 text-center text-qa-text-2">
          <p className="font-medium text-qa-text">Nothing to show yet.</p>
          <p className="mt-1 text-sm">
            Close a few days in Review and patterns will appear here.
          </p>
        </div>
      )}

      {hasData && (
        <div className="mt-6 space-y-4">
          {/* This week at a glance */}
          <section className="qa-card p-5">
            <p className="qa-eyebrow">This week</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat value={String(thisWeek.length)} label="shipped" />
              <Stat value={formatDuration(totalMin)} label="focused time" />
              <Stat value={`${goalPct}%`} label="on the goal" tone="accent" />
            </div>
          </section>

          {/* Critical path vs the rest */}
          <section className="qa-card p-5">
            <p className="qa-eyebrow">Critical path vs the rest</p>
            <p className="mt-1 text-sm text-qa-text-2">
              Effort tied to a goal versus everything else. Both are real work — the
              question is whether the split is on purpose.
            </p>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-qa-surface-2">
              <div className="h-full bg-qa-accent" style={{ width: `${goalPct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span>
                <span className="font-semibold text-qa-accent">{formatDuration(goalMin)}</span> on goals
              </span>
              <span className="text-qa-text-2">{formatDuration(otherMin)} elsewhere</span>
            </div>
          </section>

          {/* Where time went, by category */}
          <section className="qa-card p-5">
            <p className="qa-eyebrow">Where time went</p>
            <div className="mt-3 space-y-2.5">
              {cats.map(([cat, min]) => {
                const avgPrior = (priorByCat.get(cat) ?? 0) / 4;
                const arrow =
                  avgPrior === 0
                    ? ""
                    : min > avgPrior * 1.2
                    ? "↑"
                    : min < avgPrior * 0.8
                    ? "↓"
                    : "→";
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 truncate text-sm capitalize">{cat}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-qa-surface-2">
                      <div
                        className="h-full rounded-full bg-qa-accent"
                        style={{ width: `${(min / maxCat) * 100}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right font-mono text-xs text-qa-text-2">
                      {formatDuration(min)} {arrow}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-qa-text-2">
              Arrow compares this week to the prior 4-week average.
            </p>
          </section>

          {/* Deep vs shallow */}
          <section className="qa-card p-5">
            <p className="qa-eyebrow">Deep vs shallow</p>
            <p className="mt-1 text-sm text-qa-text-2">
              Deep work is the scarce resource. This is how much of it the week got.
            </p>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-qa-surface-2">
              <div className="h-full bg-qa-accent" style={{ width: `${deepPct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span>
                <span className="font-semibold text-qa-accent">{formatDuration(deepMin)}</span> deep
              </span>
              <span className="text-qa-text-2">{formatDuration(shallowMin)} shallow</span>
            </div>
          </section>

          {/* Estimate reality — the learned planning-fallacy multipliers */}
          <section className="qa-card p-5">
            <p className="qa-eyebrow">Estimate reality</p>
            <p className="mt-1 text-sm text-qa-text-2">
              What the scheduler has learned about how long work really takes. 1.0× means
              estimates are honest; higher means the work runs long.
            </p>
            <div className="mt-3 space-y-3">
              {(profiles as { user_id: string; multipliers: Record<string, number> }[] | null)?.map(
                (p) => {
                  const entries = Object.entries(p.multipliers ?? {})
                    .filter(([k]) => k !== "_default")
                    .sort((a, b) => b[1] - a[1]);
                  return (
                    <div key={p.user_id}>
                      <p className="text-sm font-medium">{founderName(p.user_id)}</p>
                      {entries.length === 0 ? (
                        <p className="text-sm text-qa-text-2">
                          Still learning — defaults to {p.multipliers?._default ?? 1.5}×.
                        </p>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {entries.map(([cat, mult]) => (
                            <span
                              key={cat}
                              className="qa-chip"
                              title={`${cat} work tends to take ${mult.toFixed(1)}× the estimate`}
                            >
                              <span className="capitalize">{cat}</span>
                              <span className="font-mono text-qa-text-2">{mult.toFixed(1)}×</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </section>

          {/* Leading indicators — trends that feed the challenger question */}
          {(indicators as IndicatorRow[] | null)?.length ? (
            <section className="qa-card p-5">
              <p className="qa-eyebrow">Leading indicators</p>
              <div className="mt-3 space-y-2.5">
                {(indicators as IndicatorRow[]).map((ind) => {
                  const sorted = [...ind.indicator_entries].sort((a, b) =>
                    a.week_start < b.week_start ? -1 : 1
                  );
                  const latest = sorted[sorted.length - 1]?.actual;
                  const prev = sorted[sorted.length - 2]?.actual;
                  const trend =
                    latest == null || prev == null ? "→" : latest > prev ? "↑" : latest < prev ? "↓" : "→";
                  return (
                    <div key={ind.id} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{ind.name}</span>
                      <span className="font-mono text-xs text-qa-text-2">
                        {latest ?? "–"}/{ind.weekly_target} {trend}
                      </span>
                      <Sparkline entries={sorted} target={ind.weekly_target} />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: "accent" }) {
  return (
    <div className="rounded-qa-sm bg-qa-surface px-3 py-2.5">
      <p className={`text-xl font-[650] ${tone === "accent" ? "text-qa-accent" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-qa-text-2">{label}</p>
    </div>
  );
}

function Sparkline({
  entries,
  target,
}: {
  entries: { week_start: string; actual: number }[];
  target: number;
}) {
  const points = entries.slice(-8).map((e) => e.actual);
  if (points.length === 0) return <span className="font-mono text-xs text-qa-text-2">—</span>;
  const latest = points[points.length - 1];
  const onTrack = target === 0 || latest >= target * 0.8;
  const max = Math.max(...points, target, 1);
  const w = 60;
  const h = 20;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * (h - 3) - 1.5).toFixed(1)}`
    )
    .join(" ");
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <path
        d={path}
        fill="none"
        stroke={onTrack ? "var(--qa-accent)" : "var(--qa-warn)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
