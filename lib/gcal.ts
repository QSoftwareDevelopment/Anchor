// lib/gcal.ts
// ============================================================
// GOOGLE CALENDAR HELPERS — Phase 2
// Reuses the OAuth pattern from the TextBot calendar-booking
// integration. Assumes refresh tokens live in Supabase.
//
// Setup checklist (one-time):
//  1. In Google Cloud Console, reuse the TextBot OAuth client
//     (or clone it). Scopes needed here:
//       https://www.googleapis.com/auth/calendar.events
//       https://www.googleapis.com/auth/calendar.freebusy
//  2. Add a redirect URI for this app, e.g.
//       https://app.qsoftware.ca/api/gcal/callback
//  3. Store tokens per founder in a `gcal_tokens` table:
//       create table gcal_tokens (
//         user_id uuid primary key references founders(user_id),
//         refresh_token text not null,
//         calendar_id text not null default 'primary',
//         updated_at timestamptz not null default now()
//       );
//       alter table gcal_tokens enable row level security;
//       create policy gcal_self on gcal_tokens for all
//         using (auth.uid() = user_id) with check (auth.uid() = user_id);
//     (Tokens are per-person, so RLS here is self-only — the one
//      exception to the shared-workspace policy. The nightly cron
//      reads them with the service role.)
// ============================================================

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GCAL = "https://www.googleapis.com/calendar/v3";

type Tokens = { refresh_token: string; calendar_id: string };

// ---------- auth ----------
export async function accessTokenFor(tokens: Tokens): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

// ---------- read: busy intervals ----------
export async function fetchBusy(
  tokens: Tokens,
  timeMin: Date,
  timeMax: Date
): Promise<{ start: Date; end: Date }[]> {
  const token = await accessTokenFor(tokens);
  const res = await fetch(`${GCAL}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: tokens.calendar_id }],
    }),
  });
  if (!res.ok) throw new Error(`freeBusy failed: ${await res.text()}`);
  const data = await res.json();
  const busy = data.calendars?.[tokens.calendar_id]?.busy ?? [];
  return busy.map((b: { start: string; end: string }) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));
}

// ---------- write: schedule blocks as events ----------
// Events are tagged with a private extended property so we can
// find/replace ONLY our own events and never touch real meetings.
const APP_TAG = { qsoftware_agent: "1" };

export async function createBlockEvent(
  tokens: Tokens,
  block: { title: string; start: Date; end: Date; taskId: string },
  timezone: string
): Promise<string> {
  const token = await accessTokenFor(tokens);
  const res = await fetch(
    `${GCAL}/calendars/${encodeURIComponent(tokens.calendar_id)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `▸ ${block.title}`,
        start: { dateTime: block.start.toISOString(), timeZone: timezone },
        end: { dateTime: block.end.toISOString(), timeZone: timezone },
        extendedProperties: {
          private: { ...APP_TAG, task_id: block.taskId },
        },
        reminders: { useDefault: false }, // the app does the nudging, not GCal popups
      }),
    }
  );
  if (!res.ok) throw new Error(`Event create failed: ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

// ---------- write: a real calendar event (meeting / appointment) ----------
// Distinct from createBlockEvent: no "▸" prefix, carries its own tag so
// the agent's replan never deletes founder-entered events. Supports
// all-day events (date-only) and timed events.
const EVENT_TAG = { qsoftware_event: "1" };

export type GcalEventInput = {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  location?: string;
  description?: string;
};

function zonedParts(d: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    dateTime: `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

function eventBody(ev: GcalEventInput, timezone: string) {
  const dateOnly = (d: Date) => d.toISOString().slice(0, 10); // all-day events preserve the chosen date

  let when;
  if (ev.allDay) {
    const startDate = dateOnly(ev.start);
    let endDate = dateOnly(ev.end);
    // Google treats an all-day `end.date` as EXCLUSIVE — a single-day event must
    // end on the next day. Bump if the caller passed a same-day (or earlier) end.
    if (endDate <= startDate) {
      endDate = dateOnly(new Date(ev.start.getTime() + 24 * 3_600_000));
    }
    when = { start: { date: startDate }, end: { date: endDate } };
  } else {
    when = {
      start: { dateTime: zonedParts(ev.start, timezone).dateTime, timeZone: timezone },
      end: { dateTime: zonedParts(ev.end, timezone).dateTime, timeZone: timezone },
    };
  }

  return {
    summary: ev.title,
    location: ev.location || undefined,
    description: ev.description || undefined,
    ...when,
    extendedProperties: { private: { ...EVENT_TAG } },
  };
}

export async function createCalendarEvent(
  tokens: Tokens,
  ev: GcalEventInput,
  timezone: string
): Promise<string> {
  const token = await accessTokenFor(tokens);
  const res = await fetch(
    `${GCAL}/calendars/${encodeURIComponent(tokens.calendar_id)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody(ev, timezone)),
    }
  );
  if (!res.ok) throw new Error(`Calendar event create failed: ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

export async function updateCalendarEvent(
  tokens: Tokens,
  eventId: string,
  ev: GcalEventInput,
  timezone: string
): Promise<void> {
  const token = await accessTokenFor(tokens);
  const res = await fetch(
    `${GCAL}/calendars/${encodeURIComponent(tokens.calendar_id)}/events/${eventId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody(ev, timezone)),
    }
  );
  if (!res.ok && res.status !== 404)
    throw new Error(`Calendar event update failed: ${await res.text()}`);
}

export async function deleteEvent(tokens: Tokens, eventId: string): Promise<void> {
  const token = await accessTokenFor(tokens);
  const res = await fetch(
    `${GCAL}/calendars/${encodeURIComponent(tokens.calendar_id)}/events/${eventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  // 410 = already gone, fine
  if (!res.ok && res.status !== 410)
    throw new Error(`Event delete failed: ${await res.text()}`);
}

// Wipe all of OUR events in a window (used before a replan).
// Only deletes events carrying the app tag — founder meetings are untouchable.
export async function clearAgentEvents(
  tokens: Tokens,
  timeMin: Date,
  timeMax: Date
): Promise<void> {
  const token = await accessTokenFor(tokens);
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    privateExtendedProperty: "qsoftware_agent=1",
    singleEvents: "true",
    maxResults: "100",
  });
  const res = await fetch(
    `${GCAL}/calendars/${encodeURIComponent(tokens.calendar_id)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Event list failed: ${await res.text()}`);
  const data = await res.json();
  for (const ev of data.items ?? []) {
    await deleteEvent(tokens, ev.id);
  }
}
