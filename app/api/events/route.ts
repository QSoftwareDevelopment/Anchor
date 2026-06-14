// app/api/events/route.ts
// GET  — list calendar events in a date range (defaults to this week).
// POST — create an event; if Google Calendar is connected, push it there
//        too and store the synced id. Events are founder-entered things
//        (meetings, calls, appointments) — not auto-scheduled task work.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { createCalendarEvent } from "@/lib/gcal";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Body = {
  title?: string;
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  location?: string;
  notes?: string;
  category?: string;
};

export async function GET(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let q = supabase
    .from("calendar_events")
    .select("id, title, start_at, end_at, all_day, location, notes, category, gcal_event_id")
    .order("start_at");
  if (from) q = q.gte("start_at", from);
  if (to) q = q.lte("start_at", to);

  const { data, error } = await q.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  if (!body.title || !body.start_at) {
    return NextResponse.json({ error: "title and start_at are required" }, { status: 400 });
  }

  const start = new Date(body.start_at);
  // default duration: 1 hour for timed events, same day for all-day
  const end = body.end_at
    ? new Date(body.end_at)
    : new Date(start.getTime() + (body.all_day ? 24 : 1) * 3_600_000);

  const { data: inserted, error } = await supabase
    .from("calendar_events")
    .insert({
      founder_id: founder.user_id,
      title: body.title,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      all_day: body.all_day ?? false,
      location: body.location ?? null,
      notes: body.notes ?? null,
      category: body.category ?? "event",
    })
    .select("id, title, start_at, end_at, all_day, location, notes, category")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort Google Calendar sync.
  let synced = false;
  const { data: tokenRow } = await supabase
    .from("gcal_tokens")
    .select("refresh_token, calendar_id")
    .eq("user_id", founder.user_id)
    .maybeSingle();

  if (tokenRow) {
    const { data: profile } = await supabase
      .from("founder_profiles")
      .select("timezone")
      .eq("user_id", founder.user_id)
      .maybeSingle();
    try {
      const gcalId = await createCalendarEvent(
        tokenRow,
        {
          title: inserted.title,
          start,
          end,
          allDay: inserted.all_day,
          location: inserted.location ?? undefined,
          description: inserted.notes ?? undefined,
        },
        profile?.timezone ?? "America/Toronto"
      );
      await supabase.from("calendar_events").update({ gcal_event_id: gcalId }).eq("id", inserted.id);
      synced = true;
    } catch {
      // event is saved locally even if the push fails
    }
  }

  return NextResponse.json({ event: inserted, synced });
}
