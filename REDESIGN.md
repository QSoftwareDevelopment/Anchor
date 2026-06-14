# Anchor — the agent-first rebuild

The four tabs are gone. The app is now a single conversation with an AI operating partner that actually runs the plan — it creates and triages tasks, schedules your day and week against your real energy windows, sets anchors, and tells you where your time is going. Everything else is in service of that.

## What you land on

`/` is the assistant. It greets you by name ("Good evening, Sid"), shows a live **Today** glance (your #1, the rest of the day, what you've shipped this week), and gives you a chat composer. Ask for anything in plain language; the agent does it and shows you the actions it took as small ✓ chips ("Planned the day · 4 blocks", "Set your anchor").

The look is a deep, luminous dark theme — aurora background, glass panels, one indigo→cyan accent, subtle motion. It carries across the whole app via design tokens.

## How the agent works

- **Model:** `claude-sonnet-4-6` with real tool-use, server-side only (`lib/agent.ts`, `app/api/agent/route.ts`).
- **Tools it can call** (all run against Supabase as you, so RLS still limits everything to the two founders):
  `create_task`, `list_tasks`, `update_task` (complete / kill / move / resize), `create_project`, `list_projects`, `create_goal`, `list_goals`, `set_anchor`, `plan_day`, `plan_week` (uses the real scheduler — never past your daily ceiling), `get_schedule`, `get_insights`.
- **The loop:** your message → Claude decides which tools to call → the server executes them and feeds results back → Claude replies in plain English and the UI lists what changed. It also gets a live snapshot of your day, open tasks, goals and projects on every turn, so it's never flying blind.
- **Voice & rules:** the operating-partner personality is preserved — progress first, no guilt, realism over ambition, one earned challenge a week. It never exposes tool names or JSON; it talks like a chief of staff.

## Two things to switch on

1. **`ANTHROPIC_API_KEY`** must be set for the assistant to respond — in `.env.local` for local dev, **and in Vercel** for the live site (then redeploy). Without it the chat replies with a clear "I can't reach my reasoning engine" message instead of failing silently.
2. **Chat history (optional):** run `MIGRATION_agent.sql` in Supabase to persist conversations across reloads. The assistant works fine without it — it just won't remember past sessions.

## What's kept

`Plan`, `Insights`, and `Settings` remain in the slim rail for hands-on work and the energy-window/ceiling setup the scheduler depends on. `Today`, `Inbox`, and `Review` still exist as routes, but their jobs now live inside the assistant. Nothing in the data model changed in this pass — same tables, same `founder_profiles`, same scheduler.

## Verified

`tsc --noEmit` clean across the project; the Tailwind theme compiles clean. The agent's live behaviour depends on a valid `ANTHROPIC_API_KEY` and can't be exercised from the build sandbox, so test it once locally after setting the key.
