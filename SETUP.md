# Q Software Growth Agent — Setup

Everything you need to get from this repo to a running app at app.qsoftware.ca. Work top to bottom; each step depends on the one before it.

## 1. Environment variables

Copy `.env.local.example` to `.env.local` and fill in each value. Add the same set to Vercel → Project → Settings → Environment Variables.

**NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY** come from your Supabase project under Project Settings → API. The service role key is secret — server-only, never shipped to the browser (the code already respects this).

**ANTHROPIC_API_KEY** comes from console.anthropic.com → API Keys. All four agents run through `claude-sonnet-4-6` at 1000 max tokens per call, so costs stay small.

**GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI** come from the Google OAuth client (step 4). The redirect URI must be exactly `https://app.qsoftware.ca/api/gcal/callback` in both the env var and the Google console.

**CRON_SECRET** is any long random string (`openssl rand -hex 32`). Vercel sends it as a Bearer token to the cron routes; anything without it gets a 401.

**NEXT_PUBLIC_APP_URL** is `https://app.qsoftware.ca` in production, `http://localhost:3000` locally.

**Twilio vars** are optional. Without them the morning brief logs to Vercel function logs instead of texting you.

## 2. Database

In the Supabase SQL Editor, run `schema.sql` in a single execution. It creates all tables (including `gcal_tokens`), enums, triggers (`updated_at` touch + slip tracking), and row-level security. RLS is a shared two-person workspace: anyone in `founders` can touch everything; nobody else can touch anything. The exception is `gcal_tokens`, which is self-only.

If you ever need to re-run it, drop the tables first — it is not idempotent.

## 3. Seed the founders

1. Both of you sign up once through the app's login page (or Supabase Auth → Users → Invite). Email + password.
2. In Supabase → Authentication → Users, copy each of your user UUIDs.
3. In the SQL Editor, run the seed block at the bottom of `schema.sql` with the real UUIDs:

```sql
insert into founders (user_id, display_name) values
  ('SID-UUID',    'Sid'),
  ('AARYAN-UUID', 'Aaryan');

insert into profiles (user_id, energy_windows, daily_ceiling_minutes) values
  ('SID-UUID',    '[{"days":["mon","tue","wed","thu","fri"],"start":"09:00","end":"12:00"}]', 300),
  ('AARYAN-UUID', '[{"days":["mon","tue","wed","thu","fri"],"start":"20:00","end":"23:00"}]', 300);
```

Adjust the energy windows and ceilings to your real patterns — the scheduler treats both as hard constraints. Display names must be exactly `Sid` and `Aaryan` (the weekly-confirm flow matches anchors by name). Optionally set `profiles.phone` (E.164, e.g. `+1416...`) to receive the morning brief by SMS.

Then create your first goal and an indicator or two — either in the app (Plan → New goal) or via the example SQL at the bottom of schema.sql.

## 4. Google OAuth client

In Google Cloud Console (reuse the TextBot project or clone its OAuth client):

1. APIs & Services → enable the **Google Calendar API**.
2. Credentials → OAuth client (type: Web application).
3. Authorized redirect URI: `https://app.qsoftware.ca/api/gcal/callback` (add `http://localhost:3000/api/gcal/callback` for local dev).
4. OAuth consent screen: the only scopes used are `calendar.events` and `calendar.freebusy`. Add both your Google accounts as test users if the app stays in testing mode.
5. Copy client ID + secret into the env vars.

Then in the app: Plan → "Connect Google Calendar", once per founder. A green check replaces the button when the refresh token is stored. The agent only ever creates/deletes events tagged `qsoftware_agent=1` — your real meetings are untouchable.

## 5. Deploy to Vercel

1. Push the repo to GitHub and import it into Vercel (framework auto-detects Next.js).
2. Add every env var from step 1 to the project.
3. `vercel.json` already defines the three crons — Vercel picks them up on deploy:
   - nightly replan: 07:00 UTC daily (~2–3am Toronto)
   - weekly prep: 20:00 UTC Friday (~3–4pm Toronto)
   - morning brief: 12:30 UTC daily (~7:30am Toronto)
4. Point `app.qsoftware.ca` at the project under Domains.
5. Smoke-test a cron manually:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://app.qsoftware.ca/api/cron/nightly`

## 6. The first Sunday review

The Friday cron prepares the review, so the very first Sunday (before any cron has run) looks like this:

1. During the week before: capture thoughts in the bar, approve them in Inbox, make sure tasks live on the right projects with estimates.
2. Friday afternoon (or any time before Sunday), trigger the prep once by hand:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://app.qsoftware.ca/api/cron/weekly-prep`
3. Sunday, both of you open **Review → Weekly** together (one screen, 20 minutes).
   - Left side: the agent's review of the week, this week's indicator actuals (type them in), and slip triage — pick reschedule / shrink / hand off / kill per slipped task.
   - Right side: the proposed plan. Edit the one metric, toggle and re-own task assignments, edit both anchor commitments until they're real promises.
4. Hit **Confirm this week's plan**. That's the commit: assignments are written, anchors recorded, and the scheduler immediately builds Mon–Fri and pushes blocks to both calendars.
5. Monday morning each of you opens **Today** — #1 task on top, the day's timeline below, partner's anchor at the bottom.

If the prepared review is missing (cron didn't run), the weekly page still works — you just plan without the agent's memo.

## Local development

```
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
```
