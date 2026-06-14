# Anchor — full functionality pass

A big build-out: real Google Calendar event creation, many more
destinations in the sidebar, a proper sign-out flow, and a premium polish
pass. Everything below is live; `tsc --noEmit` and `next build` are clean.

## 1. Google Calendar — now you can actually add things to it

Before this pass, only the auto-scheduler pushed task *blocks* to Google
Calendar. Now you can add **events** (meetings, calls, appointments) directly,
and they sync to your real calendar.

- **`calendar_events` table** (`MIGRATION_events.sql`, also in `schema.sql`) —
  founder-entered events with optional Google Calendar sync. Run the migration
  once in Supabase.
- **`lib/gcal.ts`** gained `createCalendarEvent` / `updateCalendarEvent`
  (timed *and* all-day), tagged so the agent's replan never deletes them.
- **API:** `POST/GET /api/events`, `PATCH/DELETE /api/events/[id]` — create,
  list, edit, delete; each change mirrors to Google Calendar when connected.
- **Connection UI:** Settings now has a Google Calendar card (status +
  Connect/Disconnect), backed by `/api/gcal/status` and `/api/gcal/disconnect`.
- **The assistant can do it too:** new `add_calendar_event` and `list_events`
  tools. Say "add an investor call tomorrow at 10" and it lands on your calendar.

## 2. A real navigation shell — many more views

The 60px icon rail became a **232px labelled sidebar** (grouped Workspace /
Build / Reflect / Account, animated active indicator, sign-out pinned at the
bottom). Mobile keeps a bottom bar of the four primaries plus a **More** sheet.

New destinations:

- **Week** (`/week`) — a 7-day board of your scheduled blocks and events.
  Navigate weeks, **Plan week** in one tap, drop in events per day.
- **Calendar** (`/calendar`) — a full month grid with per-day task/event
  counts, a selected-day detail panel, and quick-add.
- **Goals** (`/goals`) — the big-picture view: each quarterly outcome as a
  large card with a momentum bar (averaged from its indicators), a countdown,
  indicator progress, and active projects.

Plan, Inbox, Review, Insights, Settings, Today are all in the rail now too.

## 3. Proper sign-out (`/signout`)

A dedicated, branded flow: confirm → clean session end → a calm "you're signed
out" state with a way back in. Public in middleware so the confirmation renders
after the session is gone. Linked from the sidebar and Settings.

## 4. Shared scheduler runner

`lib/schedule-run.ts` is now the single implementation the agent **and** the new
`POST /api/schedule/plan` (day/week) endpoint both call — day and week planning
can't drift apart.

## 5. Premium polish

New motion primitives in `globals.css`: `qa-pop-in` (modals), `qa-sheet`
(mobile sheet), `qa-grow-x` (progress bars), `qa-glow-pulse`, staggered
`qa-rise` on lists. All respect `prefers-reduced-motion`.

## Round 2 — command palette, full event lifecycle, futuristic shell

- **Command palette (⌘K / Ctrl-K)** — [components/command-palette.tsx](components/command-palette.tsx),
  mounted globally. Fuzzy-jump to any view; quick actions: capture a thought,
  add a calendar event, plan day, plan week, sign out. Arrow keys + Enter, Esc
  to close. Also opens from the **Search…** button in the sidebar (or any
  `qa:open-command-palette` event).
- **Full event lifecycle** — the event modal now **edits and deletes**, not just
  creates (PATCH/DELETE re-sync to Google Calendar). Events are clickable to edit
  on **Today**, **Week**, and **Calendar**.
- **Today is now the real command center** — task blocks and calendar events are
  merged into one chronological timeline, with inline **+ Event** add/edit.
- **Futuristic visual layer** — a fixed animated backdrop ([globals.css](app/globals.css)
  `.qa-bg-fx`): drifting aurora blobs + a faded perspective grid. New
  gradient-bordered glass (`.qa-card-grad`), glow utilities, animated gradient
  headings, and a spinning halo on the assistant orb. All transform/opacity-based
  and reduced-motion safe.

## To switch on

1. Run **`MIGRATION_events.sql`** in Supabase (adds `calendar_events`).
2. Connect Google Calendar from **Settings → Google Calendar** (needs the
   `GOOGLE_*` env vars already in `.env.local`, and the redirect URI registered
   in Google Cloud Console).
