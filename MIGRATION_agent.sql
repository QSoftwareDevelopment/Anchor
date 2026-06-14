-- ============================================================
-- ANCHOR — assistant chat persistence
-- Run once in the Supabase SQL editor. Safe to re-run.
-- The assistant works WITHOUT this (conversations just won't be
-- saved across reloads); run it to keep your chat history.
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists agent_messages (
  id          uuid primary key default gen_random_uuid(),
  founder_id  uuid not null references founders(user_id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists agent_messages_founder_idx on agent_messages (founder_id, created_at);

alter table agent_messages enable row level security;
-- Each founder's conversation is private to them.
drop policy if exists agent_messages_self on agent_messages;
create policy agent_messages_self on agent_messages for all
  using (founder_id = auth.uid()) with check (founder_id = auth.uid());

notify pgrst, 'reload schema';
