// app/api/events/[id]/route.ts
// PATCH  — edit an event (re-syncs to Google Calendar if linked).
// DELETE — remove an event (also deletes the Google Calendar copy).
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { updateCalendarEvent, deleteEvent } from "@/lib/gcal";

export const maxDuration = 30;

async function tokensFor(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string
) {
  const { data } = await supabase
    .from("gcal_tokens")
    .select("refresh_token, calendar_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const k of ["title", "start_at", "end_at", "all_day", "location", "notes", "category"]) {
    if (k in body) patch[k] = body[k];
  }

  const { data: updated, error } = await supabase
    .from("calendar_events")
    .update(patch)
    .eq("id", params.id)
    .select("id, title, start_at, end_at, all_day, location, notes, gcal_event_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (updated.gcal_event_id) {
    const tokenRow = await tokensFor(supabase, founder.user_id);
    if (tokenRow) {
      const { data: profile } = await supabase
        .from("founder_profiles")
        .select("timezone")
        .eq("user_id", founder.user_id)
        .maybeSingle();
      try {
        await updateCalendarEvent(
          tokenRow,
          updated.gcal_event_id,
          {
            title: updated.title,
            start: new Date(updated.start_at),
            end: new Date(updated.end_at),
            allDay: updated.all_day,
            location: updated.location ?? undefined,
            description: updated.notes ?? undefined,
          },
          profile?.timezone ?? "America/Toronto"
        );
      } catch {
        /* local copy is the source of truth */
      }
    }
  }

  return NextResponse.json({ event: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: row } = await supabase
    .from("calendar_events")
    .select("gcal_event_id")
    .eq("id", params.id)
    .maybeSingle();

  if (row?.gcal_event_id) {
    const tokenRow = await tokensFor(supabase, founder.user_id);
    if (tokenRow) {
      try {
        await deleteEvent(tokenRow, row.gcal_event_id);
      } catch {
        /* 410/network — DB delete below is the source of truth */
      }
    }
  }

  const { error } = await supabase.from("calendar_events").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
