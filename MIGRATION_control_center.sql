-- ============================================================
-- MIGRATION: partnership control center
-- Run once in the Supabase SQL editor.
--
-- Three lightweight admin primitives for the two-founder workspace:
--   finance_entries  — money in/out + balance snapshots (manual ledger)
--   resources        — shared links/docs hub (links only, never secrets)
--   contacts         — clients & leads CRM
-- All use the shared-workspace policy: any founder can read/write.
-- ============================================================

-- ---------- MONEY ----------
create table if not exists finance_entries (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('income', 'expense', 'balance')),
  amount      numeric not null,                 -- always positive; kind gives meaning
  currency    text not null default 'CAD',
  category    text not null default 'general',
  description text,
  recurring   boolean not null default false,   -- true = repeats monthly (powers MRR / burn)
  occurred_on date not null default current_date,
  created_by  uuid references founders(user_id),
  created_at  timestamptz not null default now()
);
create index if not exists finance_entries_date_idx on finance_entries (occurred_on);
alter table finance_entries enable row level security;
drop policy if exists finance_entries_all on finance_entries;
create policy finance_entries_all on finance_entries for all
  using (is_founder()) with check (is_founder());

-- ---------- RESOURCES (shared links / docs hub) ----------
create table if not exists resources (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  url        text,
  category   text not null default 'link',      -- link | contract | dashboard | brand | doc
  notes      text,
  created_by uuid references founders(user_id),
  created_at timestamptz not null default now()
);
alter table resources enable row level security;
drop policy if exists resources_all on resources;
create policy resources_all on resources for all
  using (is_founder()) with check (is_founder());

-- ---------- CONTACTS (clients & leads) ----------
create table if not exists contacts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  company        text,
  email          text,
  phone          text,
  stage          text not null default 'lead'
                 check (stage in ('lead', 'active', 'client', 'dormant', 'lost')),
  owner          uuid references founders(user_id),
  last_touch     date,
  next_step      text,
  next_step_date date,
  notes          text,
  created_by     uuid references founders(user_id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists contacts_stage_idx on contacts (stage);
alter table contacts enable row level security;
drop policy if exists contacts_all on contacts;
create policy contacts_all on contacts for all
  using (is_founder()) with check (is_founder());

drop trigger if exists contacts_touch on contacts;
create trigger contacts_touch before update on contacts
  for each row execute function set_updated_at();
