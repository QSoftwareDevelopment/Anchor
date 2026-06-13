// components/goal-card.tsx
// Goal with indicator sparklines. Sparkline = 8-point SVG polyline,
// 60×20, no axes. Indigo on track (>80% of target), amber below.
import Link from "next/link";
import { weeksUntil } from "@/lib/utils";

type Entry = { week_start: string; actual: number };
export type IndicatorWithEntries = {
  id: string;
  name: string;
  weekly_target: number;
  indicator_entries: Entry[];
};
export type GoalRow = {
  id: string;
  quarter: string;
  outcome: string;
  target_date: string;
  status: string;
  indicators: IndicatorWithEntries[];
  projects: { id: string; status: string }[];
};

function Sparkline({ entries, target }: { entries: Entry[]; target: number }) {
  const points = [...entries]
    .sort((a, b) => (a.week_start < b.week_start ? -1 : 1))
    .slice(-8)
    .map((e) => e.actual);
  if (points.length === 0)
    return <span className="font-mono text-xs text-qa-text-2">—</span>;

  const latest = points[points.length - 1];
  const onTrack = target === 0 || latest >= target * 0.8;
  const max = Math.max(...points, target, 1);
  const w = 60;
  const h = 20;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * (h - 3) - 1.5).toFixed(1)}`)
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

export default function GoalCard({ goal }: { goal: GoalRow }) {
  const weeks = weeksUntil(goal.target_date);
  const activeProjects = goal.projects.filter((p) => p.status === "active").length;

  return (
    <Link
      href={`/plan/goals/${goal.id}`}
      className="block rounded-qa border border-qa-line bg-white p-5 transition-colors hover:border-qa-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold leading-snug">{goal.outcome}</h2>
        <span className="shrink-0 rounded-full bg-qa-surface px-2.5 py-0.5 text-xs font-medium text-qa-text-2">
          {goal.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-qa-text-2">
        {goal.quarter} · {goal.target_date} ·{" "}
        <span className="font-mono">{weeks}w</span> left · {activeProjects}{" "}
        active project{activeProjects === 1 ? "" : "s"}
      </p>
      {goal.indicators.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-qa-line pt-3">
          {goal.indicators.map((ind) => {
            const sorted = [...ind.indicator_entries].sort((a, b) =>
              a.week_start < b.week_start ? -1 : 1
            );
            const latest = sorted[sorted.length - 1]?.actual;
            return (
              <div key={ind.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{ind.name}</span>
                <span className="font-mono text-xs text-qa-text-2">
                  {latest ?? "–"}/{ind.weekly_target}
                </span>
                <Sparkline entries={ind.indicator_entries} target={ind.weekly_target} />
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}
