-- ============================================================
-- MIGRATION: calendar_events
-- Run once in the Supabase SQL editor.
--
-- Tasks already become schedule_blocks (auto-planned by the
-- scheduler and mirrored to Google Calendar). This table is for
-- EVENTS the founder enters directly — meetings, calls, dentist,
-- a flight — things that aren't auto-schedulable work but still
-- belong on the calendar. Each one can be pushed to Google
-- Calendar (gcal_event_id holds the synced id).
-- ============================================================

create table if not exists calendar_events (
  id            uuid primary key default gen_random_uuid(),
  founder_id    uuid not null references founders(user_id) on delete cascade,
  title         text not null,
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  all_day       boolean not null default false,
  location      text,
  notes         text,
  category      text not null default 'event',
  gcal_event_id text,                       -- set when synced to Google Calendar
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists calendar_events_founder_idx
  on calendar_events (founder_id, start_at);

alter table calendar_events enable row level security;

-- Shared two-founder workspace: any founder can see/manage events.
drop policy if exists calendar_events_all on calendar_events;
create policy calendar_events_all on calendar_events for all
  using (exists (select 1 from founders where user_id = auth.uid()))
  with check (exists (select 1 from founders where user_id = auth.uid()));

-- keep updated_at fresh
drop trigger if exists calendar_events_touch on calendar_events;
create trigger calendar_events_touch
  before update on calendar_events
  for each row execute function set_updated_at();
