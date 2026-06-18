// app/api/events/[id]/route.ts
// PATCH  — edit an event (re-syncs to Google Calendar if linked).
// DELETE — remove an event (also deletes the Google Calendar copy).
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";
import { createCalendarEvent, updateCalendarEvent, deleteEvent } from "@/lib/gcal";

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
  if (typeof patch.start_at === "string" || typeof patch.end_at === "string") {
    const start = new Date(String(patch.start_at ?? body.start_at));
    const end = new Date(String(patch.end_at ?? body.end_at));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "invalid event time" }, { status: 400 });
    }
    if (!body.all_day && end <= start) {
      return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
    }
  }

  const { data: updated, error } = await supabase
    .from("calendar_events")
    .update(patch)
    .eq("id", params.id)
    .eq("founder_id", founder.user_id)
    .select("id, title, start_at, end_at, all_day, location, notes, category, gcal_event_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let synced = false;
  const tokenRow = await tokensFor(supabase, founder.user_id);
  if (tokenRow) {
    const { data: profile } = await supabase
      .from("founder_profiles")
      .select("timezone")
      .eq("user_id", founder.user_id)
      .maybeSingle();
    const input = {
      title: updated.title,
      start: new Date(updated.start_at),
      end: new Date(updated.end_at),
      allDay: updated.all_day,
      location: updated.location ?? undefined,
      description: updated.notes ?? undefined,
    };
    if (updated.gcal_event_id) {
      try {
        await updateCalendarEvent(
          tokenRow,
          updated.gcal_event_id,
          input,
          profile?.timezone ?? "America/Toronto"
        );
        synced = true;
      } catch {
        /* local copy is the source of truth */
      }
    } else {
      try {
        const gcalId = await createCalendarEvent(tokenRow, input, profile?.timezone ?? "America/Toronto");
        await supabase.from("calendar_events").update({ gcal_event_id: gcalId }).eq("id", updated.id).eq("founder_id", founder.user_id);
        updated.gcal_event_id = gcalId;
        synced = true;
      } catch {
        /* local copy is the source of truth */
      }
    }
  }

  return NextResponse.json({ event: updated, synced });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: row } = await supabase
    .from("calendar_events")
    .select("gcal_event_id")
    .eq("id", params.id)
    .eq("founder_id", founder.user_id)
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

  const { error } = await supabase.from("calendar_events").delete().eq("id", params.id).eq("founder_id", founder.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
