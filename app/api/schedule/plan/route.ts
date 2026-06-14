// app/api/schedule/plan/route.ts
// POST — plan a single day or a Mon–Fri week for the current founder.
// Body: { scope: "day" | "week", date?: "YYYY-MM-DD", week_start?: "YYYY-MM-DD" }
// Lays open tasks into energy windows under the daily ceiling and mirrors
// the result to Google Calendar when connected. Powers the "Plan" buttons
// on the Today / Week views (the agent uses the same runner).
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { scheduleDaysFor } from "@/lib/schedule-run";
import { mondayOf, todayISO } from "@/lib/utils";

export const maxDuration = 60;

type Body = { scope?: "day" | "week"; date?: string; week_start?: string };

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const now = new Date();
  const scope = body.scope ?? "day";

  let days: Date[];
  if (scope === "week") {
    const monday = body.week_start ?? mondayOf(now);
    days = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday + "T00:00:00");
      d.setDate(d.getDate() + i);
      return d;
    });
  } else {
    days = [new Date((body.date ?? todayISO()) + "T00:00:00")];
  }

  try {
    const result = await scheduleDaysFor(supabase, founder.user_id, days, now);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "couldn't plan" },
      { status: 400 }
    );
  }
}
