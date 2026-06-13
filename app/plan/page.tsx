// app/plan/page.tsx — goals list + calendar connection status
import Link from "next/link";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import GoalCard, { type GoalRow } from "@/components/goal-card";

export const dynamic = "force-dynamic";

const GCAL_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Google Calendar connected.", ok: true },
  error: { text: "Calendar connection didn't complete. Try again.", ok: false },
  mismatch: { text: "That Google flow was started from a different session. Try connecting again.", ok: false },
  norefresh: {
    text: "Google didn't return a refresh token. Remove this app at myaccount.google.com/permissions, then connect again.",
    ok: false,
  },
};

export default async function PlanPage({
  searchParams,
}: {
  searchParams?: { gcal?: string };
}) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  const gcalMsg = searchParams?.gcal ? GCAL_MESSAGES[searchParams.gcal] : null;

  const [{ data: goals }, { data: gcal }] = await Promise.all([
    supabase
      .from("goals")
      .select("*, indicators(*, indicator_entries(week_start, actual)), projects(id, status)")
      .order("created_at", { ascending: false }),
    founder
      ? supabase
          .from("gcal_tokens")
          .select("user_id")
          .eq("user_id", founder.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const connected = Boolean(gcal);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      {gcalMsg && (
        <p
          className={`mb-4 rounded-qa-sm px-3 py-2 text-sm ${
            gcalMsg.ok ? "bg-qa-surface text-qa-success" : "bg-qa-surface text-qa-warn"
          }`}
          role="status"
        >
          {gcalMsg.text}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Plan</h1>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="flex items-center gap-1.5 text-sm text-qa-success">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M2 7.5 5.5 11 12 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Calendar connected
            </span>
          ) : (
            <a
              href="/api/gcal/connect"
              className="rounded-qa-sm border border-qa-line-strong px-3 py-1.5 text-sm font-medium hover:bg-qa-surface"
            >
              Connect Google Calendar
            </a>
          )}
          <Link
            href="/plan/goals/new"
            className="rounded-qa-sm bg-qa-accent px-3 py-1.5 text-sm font-semibold text-qa-accent-text"
          >
            New goal
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {(goals ?? []).map((g) => (
          <GoalCard key={g.id} goal={g as GoalRow} />
        ))}
        {(!goals || goals.length === 0) && (
          <div className="rounded-qa border border-dashed border-qa-line-strong p-10 text-center text-qa-text-2">
            <p className="font-medium text-qa-text">No goals yet.</p>
            <p className="mt-1 text-sm">
              Set the quarter&apos;s outcome — everything else hangs off it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
