// app/review/history/page.tsx
// The paper trail: every weekly review and one-metric, newest first.
// Useful for spotting drift the week-to-week view can't show.
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase";
import ReviewCard from "@/components/review-card";

export const dynamic = "force-dynamic";

type WeeklyRow = {
  id: string;
  period_start: string;
  one_metric: string | null;
  challenger_question: string | null;
  agent_summary: { review_markdown?: string | null } | null;
};

export default async function ReviewHistoryPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("reviews")
    .select("id, period_start, one_metric, challenger_question, agent_summary")
    .eq("type", "weekly")
    .order("period_start", { ascending: false })
    .limit(26); // half a year of Sundays

  const rows = (data as WeeklyRow[] | null) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/review" className="text-sm text-qa-text-2 hover:underline">
        ← Review
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Past weeks</h1>

      {rows.length === 0 && (
        <p className="mt-6 rounded-qa border border-dashed border-qa-line-strong p-10 text-center text-qa-text-2">
          No weekly reviews yet. The first one lands after your first Sunday.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {rows.map((r) => (
          <details key={r.id} className="group rounded-qa border border-qa-line bg-white">
            <summary className="cursor-pointer list-none p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm text-qa-text-2">
                  week of {r.period_start}
                </span>
                <svg
                  width="14" height="14" viewBox="0 0 14 14" aria-hidden
                  className="shrink-0 text-qa-text-2 transition-transform group-open:rotate-180"
                >
                  <path d="M2 5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {r.one_metric && (
                <p className="mt-1 text-[15px] font-medium">{r.one_metric}</p>
              )}
              {r.challenger_question && (
                <p className="mt-1 text-sm text-qa-text-2">{r.challenger_question}</p>
              )}
            </summary>
            {r.agent_summary?.review_markdown && (
              <div className="border-t border-qa-line p-4">
                <ReviewCard summary={r.agent_summary.review_markdown} />
              </div>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
