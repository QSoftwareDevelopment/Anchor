-- ============================================================
-- Q SOFTWARE GROWTH AGENT — SUPABASE SCHEMA (Phase 1)
-- Run in: Supabase SQL Editor (single run, idempotent-ish)
-- Two-founder workspace: Sid + Aaryan. RLS restricts everything
-- to users present in the `founders` table.
-- ============================================================

-- ---------- ENUMS ----------
create type project_status as enum ('active', 'paused', 'done', 'killed');
create type task_status    as enum ('inbox', 'planned', 'scheduled', 'done', 'killed');
create type energy_level   as enum ('deep', 'shallow');           -- what the task requires
create type capture_state  as enum ('pending', 'approved', 'redirected', 'dismissed');
create type review_type    as enum ('daily', 'weekly');

-- ---------- FOUNDERS ----------
-- Maps the two of you to auth.users. Insert your two user IDs
-- after you both sign up (see seed section at the bottom).
create table founders (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,                  -- 'Sid', 'Aaryan'
  created_at   timestamptz not null default now()
);

-- ---------- FOUNDER_PROFILES (energy + capacity, one row per founder) ----------
-- Named founder_profiles (not "profiles") so it never collides with a
-- "profiles" table from another app sharing the same Supabase project.
create table founder_profiles (
  user_id        uuid primary key references founders(user_id) on delete cascade,
  -- High-energy windows, e.g. [{"days":["mon","tue","wed","thu","fri"],"start":"09:00","end":"12:00"}]
  energy_windows jsonb not null default '[]',
  daily_ceiling_minutes int not null default 300,   -- max productive minutes the scheduler may plan
  timezone       text not null default 'America/Toronto',
  -- Learned planning-fallacy multipliers, per task category.
  -- e.g. {"product": 2.1, "outreach": 1.3, "admin": 1.1, "_default": 1.5}
  -- Phase 1: stored but static. Phase 5: updated nightly from estimate vs actual.
  multipliers    jsonb not null default '{"_default": 1.5}',
  phone          text,                              -- E.164, optional: morning-brief SMS via Twilio
  updated_at     timestamptz not null default now()
);

-- ---------- GOALS (quarterly outcomes) ----------
create table goals (
  id          uuid primary key default gen_random_uuid(),
  quarter     text not null,                       -- '2026-Q3'
  outcome     text not null,                       -- '10 paying TextBot clients'
  target_date date not null,
  status      project_status not null default 'active',
  created_by  uuid not null references founders(user_id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- INDICATORS (leading, controllable inputs per goal) ----------
create table indicators (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null references goals(id) on delete cascade,
  name          text not null,                     -- 'personalized outreach emails'
  weekly_target numeric not null,                  -- 50
  unit          text not null default 'count',
  created_at    timestamptz not null default now()
);

-- Weekly actuals per indicator (entered in the Sunday review, or
-- auto-fed from TextBot/Supabase signals in Phase 5).
create table indicator_entries (
  id           uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references indicators(id) on delete cascade,
  week_start   date not null,                      -- Monday of the week
  actual       numeric not null,
  unique (indicator_id, week_start)
);

-- ---------- PROJECTS ----------
create table projects (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid references goals(id) on delete set null,  -- nullable: ops/admin projects
  name          text not null,
  owner         uuid references founders(user_id),
  status        project_status not null default 'active',
  -- Psychology fields. Nullable in Phase 1; the UI starts *asking*
  -- for them at creation in Phase 5, but capture them now if you have them.
  premortem     text,           -- "It's six weeks out and this failed — why?"
  kill_criteria text,           -- "What result by what date means we kill this?"
  kill_date     date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- TASKS ----------
create table tasks (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  title            text not null,
  owner            uuid references founders(user_id),
  status           task_status not null default 'planned',
  energy           energy_level not null default 'shallow',
  category         text not null default 'general',   -- keys into profiles.multipliers
  estimate_minutes int,
  actual_minutes   int,           -- filled at completion → powers multiplier learning. Capture from day one.
  due_date         date,
  slip_count       int not null default 0,            -- 2+ escalates to weekly review triage
  week_assigned    date,                              -- Monday of the week it's planned into
  is_anchor        boolean not null default false,    -- part of an anchor commitment
  notes            text,
  created_by       uuid references founders(user_id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create index tasks_owner_week_idx  on tasks (owner, week_assigned);
create index tasks_project_idx     on tasks (project_id);
create index tasks_status_idx      on tasks (status);

-- ---------- CAPTURES (the brain-dump inbox) ----------
create table captures (
  id          uuid primary key default gen_random_uuid(),
  raw_text    text not null,
  source      text not null default 'app',            -- 'app' | 'sms'
  captured_by uuid not null references founders(user_id),
  -- Triage agent output (Phase 3): {project_id, owner, estimate_minutes, energy, category, suggested_date, confidence}
  triage      jsonb,
  state       capture_state not null default 'pending',
  task_id     uuid references tasks(id) on delete set null,  -- set on approval
  created_at  timestamptz not null default now()
);

-- ---------- SCHEDULE BLOCKS (mirror of calendar events) ----------
create table schedule_blocks (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  founder_id        uuid not null references founders(user_id),
  block_date        date not null,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  gcal_event_id     text,                              -- Google Calendar event id (Phase 2)
  created_at        timestamptz not null default now()
);

create index blocks_founder_date_idx on schedule_blocks (founder_id, block_date);

-- ---------- REVIEWS (daily shutdowns + weekly Sunday sessions) ----------
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  type          review_type not null,
  period_start  date not null,                         -- the day, or Monday of the week
  -- Review agent output: progress summary, slip diagnoses, identity memo
  agent_summary jsonb,
  challenger_question text,                            -- weekly only
  -- Founder responses: {done_confirmed:[task_ids], blockers:"", notes:"", challenge_response:""}
  responses     jsonb not null default '{}',
  one_metric    text,                                  -- weekly only: this week's One Metric That Matters
  created_at    timestamptz not null default now(),
  unique (type, period_start)
);

-- ---------- ANCHOR COMMITMENTS (one per founder per week) ----------
create table anchor_commitments (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  founder_id  uuid not null references founders(user_id),
  commitment  text not null,
  task_id     uuid references tasks(id) on delete set null,
  kept        boolean,                                 -- set in next week's review
  unique (week_start, founder_id)
);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger goals_touch    before update on goals    for each row execute function set_updated_at();
create trigger projects_touch before update on projects for each row execute function set_updated_at();
create trigger tasks_touch    before update on tasks    for each row execute function set_updated_at();
create trigger founder_profiles_touch before update on founder_profiles for each row execute function set_updated_at();

-- Auto-increment slip_count when a task's week moves without completion
create or replace function track_slip() returns trigger as $$
begin
  if (old.week_assigned is not null
      and new.week_assigned is distinct from old.week_assigned
      and new.status not in ('done','killed')) then
    new.slip_count = old.slip_count + 1;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tasks_slip before update on tasks for each row execute function track_slip();

-- ============================================================
-- ROW LEVEL SECURITY
-- Model: shared two-person workspace. Any authenticated user who
-- exists in `founders` can read/write everything. Nobody else
-- can touch anything.
-- ============================================================
create or replace function is_founder() returns boolean as $$
  select exists (select 1 from founders where user_id = auth.uid());
$$ language sql security definer stable;

alter table founders           enable row level security;
alter table founder_profiles   enable row level security;
alter table goals              enable row level security;
alter table indicators         enable row level security;
alter table indicator_entries  enable row level security;
alter table projects           enable row level security;
alter table tasks              enable row level security;
alter table captures           enable row level security;
alter table schedule_blocks    enable row level security;
alter table reviews            enable row level security;
alter table anchor_commitments enable row level security;

-- founders: readable by founders; managed via service role only (no insert policy on purpose)
create policy founders_read on founders for select using (is_founder());

create policy founder_profiles_all on founder_profiles for all using (is_founder()) with check (is_founder());
create policy goals_all      on goals              for all using (is_founder()) with check (is_founder());
create policy indicators_all on indicators         for all using (is_founder()) with check (is_founder());
create policy ind_entries_all on indicator_entries for all using (is_founder()) with check (is_founder());
create policy projects_all   on projects           for all using (is_founder()) with check (is_founder());
create policy tasks_all      on tasks              for all using (is_founder()) with check (is_founder());
create policy captures_all   on captures           for all using (is_founder()) with check (is_founder());
create policy blocks_all     on schedule_blocks    for all using (is_founder()) with check (is_founder());
create policy reviews_all    on reviews            for all using (is_founder()) with check (is_founder());
create policy anchors_all    on anchor_commitments for all using (is_founder()) with check (is_founder());

-- ---------- GCAL TOKENS (per-founder Google Calendar refresh tokens) ----------
-- Self-only RLS — the one exception to the shared-workspace policy.
-- The nightly cron reads these with the service role.
create table gcal_tokens (
  user_id       uuid primary key references founders(user_id) on delete cascade,
  refresh_token text not null,
  calendar_id   text not null default 'primary',
  updated_at    timestamptz not null default now()
);
alter table gcal_tokens enable row level security;
create policy gcal_self on gcal_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- SEED (run AFTER you and Aaryan have both signed up via Supabase Auth)
-- Replace the UUIDs with your real auth.users ids, then run with
-- the service role (SQL editor runs as service role by default).
-- ============================================================
-- insert into founders (user_id, display_name) values
--   ('SID-AUTH-UUID-HERE',    'Sid'),
--   ('AARYAN-AUTH-UUID-HERE', 'Aaryan');
--
-- insert into profiles (user_id, energy_windows, daily_ceiling_minutes) values
--   ('SID-AUTH-UUID-HERE',
--    '[{"days":["mon","tue","wed","thu","fri"],"start":"09:00","end":"12:00"}]', 300),
--   ('AARYAN-AUTH-UUID-HERE',
--    '[{"days":["mon","tue","wed","thu","fri"],"start":"20:00","end":"23:00"}]', 300);
--
-- Example goal cascade:
-- insert into goals (quarter, outcome, target_date, created_by)
--   values ('2026-Q3', '10 paying TextBot clients', '2026-09-30', 'SID-AUTH-UUID-HERE');
-- insert into indicators (goal_id, name, weekly_target)
--   values ((select id from goals limit 1), 'personalized outreach emails', 50),
--          ((select id from goals limit 1), 'demos booked', 5);
