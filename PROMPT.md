# Claude Code — Q Software Growth Agent Build Prompt

You are building a complete internal AI operating system for Q Software, a two-person SaaS startup. This is a full-day build. Everything you need is in the context document below.

## Before you write a single line of code

1. Read `CONTEXT.md` completely — it contains the full file tree, all four AI agent system prompts, design tokens, every API route spec, and a build order. It is authoritative.
2. Check which files already exist (`schema.sql`, `lib/scheduler.ts`, `lib/gcal.ts`, `app/api/cron/nightly/route.ts`, `app/today/page.tsx`). Do NOT overwrite these.
3. Scan the existing files to understand the types and patterns — your new code must be consistent with them.

## Your mandate

Build every file in the `CONTEXT.md` file tree marked `[CREATE]`. Build them in the exact order given in the "Build order for one day" section. Do not skip steps, do not reorder them.

## Operating rules for this session

**Do not ask clarifying questions.** If something is ambiguous, make the best decision consistent with the context document and the product's core principles, and keep building. Note your assumption in a comment.

**Do not stop to summarize what you've done.** Build the next file. The goal is a working app by end of day, not a status report.

**When you finish each file**, immediately move to the next one. Do not wait for feedback between files unless the build literally cannot continue without a decision.

**If you hit a real blocker** (a missing ENV var value, an ambiguous DB column name, a type error you can not resolve), note it in a `BLOCKERS.md` file and keep building around it.

**Quality rules:**
- TypeScript strict mode — no `any` types unless absolutely necessary
- All agent calls are server-side only — `ANTHROPIC_API_KEY` never in a client component
- Never use `localStorage` — Supabase session is cookie-based via `@supabase/ssr`
- The scheduler (`lib/scheduler.ts`) and gcal helpers (`lib/gcal.ts`) are already correct — import from them, do not rewrite them
- All UI copy follows the agent voice: plain, direct, no filler, empty states are invitations to act
- Mobile-first on Today and Inbox screens

## The product's hard rules (never violate these in any code you write)

- Agents propose; founders commit. Never auto-confirm a weekly plan.
- Never schedule past `daily_ceiling_minutes`, even if asked.
- No overdue counts. No red badges. No guilt language anywhere in the UI.
- Progress is surfaced before problems in every review.
- Killing a task is a decision, not a failure — the UI must reflect this.
- The capture bar submits optimistically — clear the input immediately, run the agent in the background.

## When the build is complete

Run through the "What done looks like" checklist at the end of `CONTEXT.md`. If anything on that checklist fails, fix it before declaring done. Then create a `SETUP.md` that tells Sid and Aaryan exactly:
1. What ENV vars to fill in and where to get each value
2. How to run the Supabase schema (and in what order)
3. How to seed the `founders` and `profiles` tables with their real UUIDs
4. How to set up the Google OAuth client (which scopes, which redirect URI)
5. How to deploy to Vercel and configure the cron jobs
6. How to do the first Sunday review with the app

---

Start now. First action: read `CONTEXT.md`, then check which files exist, then begin Hour 1.
