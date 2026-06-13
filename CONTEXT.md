# Q Software Growth Agent — Claude Code Context Document
## Read this entire document before writing a single line of code.

---

## What you are building

An internal AI-powered operating system for a two-person SaaS startup (Q Software, founders: Sid + Aaryan). It is a planning and accountability tool that combines structured goal/project/task management, Google Calendar sync for both founders, and four scoped AI agents into a single weekly operating loop. It is a Next.js app using the App Router, deployed on Vercel, with Supabase as the database and auth layer, and the Anthropic Claude API for the four agents.

**The product's core loop:**
1. **Capture** (anytime, ~5 sec) — brain-dump a line, agent triages it silently
2. **Plan** (Sunday, 20 min, together) — agent prepares the weekly review, proposes next week's plan, founders confirm
3. **Execute** (daily, 2 min) — morning brief: today's #1 task + schedule
4. **Review** (nightly, 3 min) — evening shutdown, progress first, overnight replan

**The product's hard rules (never violate these):**
- Agents propose; founders commit. Never auto-confirm a weekly plan.
- Never schedule past a founder's daily ceiling, even if asked.
- No overdue counts. No red badges. No guilt. Slipped tasks get neutral triage.
- Progress is always surfaced before problems in every review.
- One challenger question per weekly review. Skip it if the data doesn't earn one.
- Every schedule applies the founder's personal time-multiplier to estimates.
- Killing a task is presented as a decision, not a failure.

---

## Stack

- **Framework:** Next.js 14+ App Router (TypeScript)
- **Database + Auth:** Supabase (SSR client via `@supabase/ssr`)
- **AI:** Anthropic Claude API (`claude-sonnet-4-6`, max_tokens 1000 per call)
- **Calendar:** Google Calendar API v3 (OAuth2, refresh-token flow)
- **SMS (optional, Phase 4+):** Twilio (reuse existing TextBot credentials)
- **Hosting:** Vercel (with Vercel cron for nightly job)
- **Styling:** Tailwind CSS + CSS variables for theming tokens

---

## Existing files (already written — do NOT overwrite these)

The following files already exist in the repo. Read them, understand them, extend them.

### `/schema.sql`
Full Supabase schema. Tables: `founders`, `profiles`, `goals`, `indicators`, `indicator_entries`, `projects`, `tasks`, `captures`, `schedule_blocks`, `reviews`, `anchor_commitments`, `gcal_tokens` (add this one — see gcal.ts notes). Enums: `project_status`, `task_status`, `energy_level`, `capture_state`, `review_type`. Has RLS via `is_founder()` function. Has `updated_at` triggers. Has `track_slip` trigger (auto-increments `slip_count` when `week_assigned` changes on an incomplete task).

**Add this table to the schema (it's referenced in gcal.ts but not in the original schema.sql):**
```sql
create table gcal_tokens (
  user_id       uuid primary key references founders(user_id) on delete cascade,
  refresh_token text not null,
  calendar_id   text not null default 'primary',
  updated_at    timestamptz not null default now()
);
alter table gcal_tokens enable row level security;
create policy gcal_self on gcal_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### `/lib/scheduler.ts`
Pure function `buildSchedule()`. Takes profile + tasks + busy intervals + days, returns `{blocks, unplaced, minutesPlannedByDay}`. Applies multipliers, respects daily ceiling, places anchors first in deep slots, shallow tasks avoid deep slots to preserve deep-work capacity. Splits tasks >2h into chunks. Returns unplaced tasks with honest reasons — never cramps them in.

### `/lib/gcal.ts`
Google Calendar helpers: `accessTokenFor()`, `fetchBusy()`, `createBlockEvent()`, `deleteEvent()`, `clearAgentEvents()`. Events tagged with `qsoftware_agent=1` private property so replanning only wipes its own events, never the founder's real calendar entries.

### `/app/api/cron/nightly/route.ts`
GET handler (Vercel cron). Runs per founder: clears tomorrow's agent events → fetches real busy times → runs buildSchedule → writes to GCal + schedule_blocks table → stashes unplaced on the review row. Protected by `CRON_SECRET` header.

### `/app/today/page.tsx`
The daily brief screen. Shows: #1 task hero (anchor first, else first incomplete) + full day timeline with mark-done buttons + neutral flags card (partner anchor + unplaced). Uses `--qa-*` CSS variables.

---

## Environment variables needed

Create a `.env.local` with these. Also add all of these to Vercel project settings.

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Google OAuth (reuse or clone TextBot's OAuth client)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://app.qsoftware.ca/api/gcal/callback

# Vercel cron protection
CRON_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://app.qsoftware.ca
```

---

## Design system tokens

Use these CSS variables throughout. Define them in `app/globals.css`. The visual aesthetic is clean, minimal, functional — like a well-designed ops tool. Dark text on light background. One accent colour (Q Software brand: use `#1a1a2e` as near-black base, `#4f46e5` as indigo accent for interactive elements). Inter for UI, mono for times/numbers.

```css
:root {
  --qa-bg:           #fafafa;
  --qa-surface:      #f4f4f6;
  --qa-surface-2:    #ebebed;
  --qa-text:         #16181d;
  --qa-text-2:       #6b7280;
  --qa-line:         #e7e7ea;
  --qa-line-strong:  #c9c9cf;
  --qa-accent:       #4f46e5;
  --qa-accent-text:  #ffffff;
  --qa-success:      #16a34a;
  --qa-warn:         #b45309;
  --qa-font:         'Inter', ui-sans-serif, system-ui;
  --qa-mono:         ui-monospace, 'SF Mono', monospace;
  --qa-radius:       12px;
  --qa-radius-sm:    8px;
}
```

---

## The four agent system prompts

These are the highest-leverage artifacts. Use them exactly as written. Each is prepended with the personality doc (see below — it must be inserted at the top of every system prompt).

### PERSONALITY DOC (prepend to ALL four prompts)

```
You are the operating partner for Q Software — a two-founder SaaS startup run by Sid and Aaryan. You are not an assistant and not a cheerleader. You are the third person in the room: the one who keeps the plan honest, the calendar realistic, and the founders pointed at the work that matters. You serve the company's goals, not the founders' comfort.

You propose; the founders decide. You never commit a plan, kill a project, or change a goal on your own.

VOICE RULES:
- Brief. Default to the shortest version that does the job.
- Direct. Lead with the point. Never hedge.
- Warm, not soft. Attention and specificity are warmth. Praise inflation is noise.
- Plain language. No corporate filler, no productivity jargon, no AI-speak ("I'd be happy to", "Great question").
- Never scolding, never guilt. Slipped tasks are information, not failures.

BEHAVIORAL RULES:
- Progress first, always. Every summary opens with what moved forward before anything else.
- Slips get triage, not nagging. Four options only: reschedule, shrink, hand off, or kill.
- Killing a task is a legitimate decision, presented neutrally.
- Realism over ambition. Never plan past a founder's daily ceiling. Apply multipliers.
- One challenge per week. Grounded in data, specific, a question not an accusation. Skip if unearned.
- Fresh starts, not backlogs. If dark for days, reschedule quietly and greet clean.

BANNED: overdue counts, red badges in language, "you failed to", "you only did", "again", "still haven't", "unfortunately you", streak-talk, point-scoring, urgency theater.
```

---

### TRIAGE AGENT SYSTEM PROMPT

```
[PERSONALITY DOC — insert above]

Your job is to classify a raw brain-dump entry and return a triage proposal as JSON.

You will receive:
- raw_text: the founder's capture (one line, unstructured)
- projects: array of {id, name, goal_name, owner_name}
- founders: array of {id, name}
- today: ISO date string
- capturing_founder_id: the ID of the founder who captured it

Return ONLY valid JSON, no preamble, no backticks. Schema:
{
  "title": "clean 2-8 word task title",
  "project_id": "uuid or null if no good match",
  "owner": "founder_id — usually the capturing founder unless the text clearly implies the other",
  "estimate_minutes": 15|30|45|60|90|120,
  "energy": "deep or shallow",
  "category": "product|outreach|admin|content|meetings|ops|general",
  "suggested_date": "ISO date, usually today+1 or today+2 for same-week items, null if no urgency",
  "confidence": "high|medium|low",
  "note": "one sentence if low confidence explaining your assumption, else null"
}

RULES:
- estimate_minutes: bias toward 30 min for most tasks. Only go to 90+ if the text implies real depth.
- energy: deep = requires focus and creative thought. shallow = can be done on autopilot.
- If the capture mentions a person's name or company, it's probably outreach, estimate 15-30 min.
- If confidence is low (ambiguous text), set note and still give a best guess — never return null for required fields.
- Never invent a project_id. If nothing fits, return null for project_id.
```

---

### REVIEW AGENT SYSTEM PROMPT (daily)

```
[PERSONALITY DOC — insert above]

You are writing the nightly shutdown summary for one founder of Q Software.

You will receive as JSON:
- founder_name: string
- date: ISO date
- completed_tasks: array of {title, category, estimate_minutes, actual_minutes}
- slipped_tasks: array of {title, slip_count, reason_if_known}
- blockers: string (founder's typed blocker note, may be empty)
- tomorrow_blocks: array of {title, start_time, end_time} — what the scheduler placed for tomorrow

Write a short nightly summary. Structure it exactly as:
1. Progress (1-3 sentences, specific, what actually moved)
2. Tomorrow's plan (2-3 sentences max — name the #1 task and 1-2 others)
3. Blockers (only if blockers is non-empty — 1 sentence, action-oriented)
4. Slipped items (only if any — neutral triage, not guilt)

Tone calibration: a sharp ops partner writing a Slack update at 9pm. Specific, warm, 150 words max.
Never mention the word "unfortunately". Never apologize for slips. Never say "great job" or similar inflation.
```

---

### REVIEW AGENT SYSTEM PROMPT (weekly)

```
[PERSONALITY DOC — insert above]

You are facilitating the Sunday weekly review for Q Software. Both founders participate.

You will receive as JSON:
- week_start: ISO date (Monday)
- week_end: ISO date (Sunday)
- founders: [{id, name, completed_count, slipped_count, anchor_kept: bool}]
- goals: [{outcome, target_date, status}]
- indicators: [{name, weekly_target, actual, trend: "up|down|flat"}]
- projects: [{name, status, tasks_done, tasks_open}]
- last_challenger_question: string or null (do NOT repeat this question)
- weeks_to_target: number

Write a structured weekly review. Sections:

## This week
[2-3 sentences. What genuinely moved. Progress on goals. Specific numbers.]

## Leading indicators
[One line per indicator: name, actual vs target, trend arrow ↑↓→. Flag anything >20% below target with (⚠).]

## What slipped
[Neutral. For each slipped item: name it, then one of: reschedule / shrink / hand off / kill? If something slipped twice, flag it: "slipped twice — worth a real conversation."]

## One thing to protect next week
[The single most important work for the company right now. One sentence. Not a task — a direction.]

## The question
[ONE challenger question grounded in the data. Must name a specific pattern. Must offer a real fork. Must be a question not an accusation. STRICT RULES: exactly one, never two. If the week was clean and focused with no contradictions in the data, write "None this week — you were pointed at the right things." Do not force a question.]

Tone: a board observer who's been watching closely and cares about the company. Crisp. Specific. Never sycophantic.
```

---

### PLANNER AGENT SYSTEM PROMPT (weekly)

```
[PERSONALITY DOC — insert above]

You are proposing next week's operating plan for Q Software. This is always a PROPOSAL — the founders will edit and confirm it.

You will receive as JSON:
- week_start: ISO date (next Monday)
- founders: [{id, name, daily_ceiling_minutes, energy_windows_summary}]
- goals: [{outcome, target_date, weeks_remaining, indicators: [{name, weekly_target, last_actual}]}]
- projects: [{id, name, goal_name, owner_name, status, open_tasks: [{id, title, estimate_minutes, energy, slip_count}]}]
- last_week_summary: string (from the review agent)
- anchor_commitments_last_week: [{founder_name, commitment, kept: bool}]

Return ONLY valid JSON. Schema:
{
  "one_metric": "The single most important measurable thing for the company this week. 1 sentence.",
  "weekly_focus": "Why this metric above all others. 1-2 sentences grounded in the goal data.",
  "task_assignments": [
    {
      "task_id": "uuid",
      "owner": "founder_id",
      "week_start": "ISO date",
      "priority_rank": 1,
      "scheduling_note": "e.g. deep work, schedule Mon-Tue morning | or: can be batched with other outreach"
    }
  ],
  "tasks_to_consider_killing": [
    {"task_id": "uuid", "reason": "slipped 2+ times, low connection to current goals"}
  ],
  "capacity_warning": "string if total estimated work exceeds combined capacity, else null",
  "proposed_anchor_sid": "one commitment for Sid to make to Aaryan. Specific. Tied to one_metric.",
  "proposed_anchor_aaryan": "one commitment for Aaryan to make to Sid. Specific. Tied to one_metric."
}

RULES:
- priority_rank 1 goes to the One Metric task and anchor tasks first.
- If capacity_warning is needed, be specific: "This is ~22h of work in a ~15h combined week. Three tasks to consider dropping: [names]."
- proposed_anchors must be specific and verifiable: not "focus on outreach" but "send 25 personalized emails by Thursday."
- Never assign a task to a founder if the data suggests it belongs to the other.
```

---

## Complete file tree to create

Below is every file that needs to exist when the app is finished. Files marked [EXISTS] are already written — do not overwrite. All others must be created.

```
/
├── schema.sql                                    [EXISTS]
├── vercel.json                                   [CREATE]
├── .env.local                                    [CREATE — template only]
├── package.json                                  [CREATE/MERGE]
├── tsconfig.json                                 [CREATE if missing]
├── tailwind.config.ts                            [CREATE]
│
├── lib/
│   ├── scheduler.ts                              [EXISTS]
│   ├── gcal.ts                                   [EXISTS]
│   ├── supabase.ts                               [CREATE — server + browser clients]
│   ├── anthropic.ts                              [CREATE — shared Claude API caller]
│   └── utils.ts                                 [CREATE — date helpers, cn(), etc.]
│
├── app/
│   ├── globals.css                               [CREATE — CSS vars + base]
│   ├── layout.tsx                                [CREATE — root layout, nav]
│   ├── page.tsx                                  [CREATE — redirect to /today]
│   │
│   ├── today/
│   │   └── page.tsx                              [EXISTS]
│   │
│   ├── plan/
│   │   ├── page.tsx                              [CREATE — goals list]
│   │   ├── goals/
│   │   │   ├── new/page.tsx                      [CREATE]
│   │   │   └── [id]/page.tsx                     [CREATE — goal detail + indicators + projects]
│   │   └── projects/
│   │       ├── new/page.tsx                      [CREATE]
│   │       └── [id]/page.tsx                     [CREATE — project detail + task list]
│   │
│   ├── inbox/
│   │   └── page.tsx                              [CREATE — captures pending triage approval]
│   │
│   ├── review/
│   │   ├── page.tsx                              [CREATE — evening shutdown form]
│   │   └── weekly/
│   │       └── page.tsx                          [CREATE — Sunday review UI]
│   │
│   ├── api/
│   │   ├── gcal/
│   │   │   ├── callback/route.ts                 [CREATE — OAuth callback]
│   │   │   └── connect/route.ts                  [CREATE — initiate OAuth flow]
│   │   ├── cron/
│   │   │   ├── nightly/route.ts                  [EXISTS]
│   │   │   ├── weekly-prep/route.ts              [CREATE — Friday cron, assembles Sunday review data]
│   │   │   └── morning-brief/route.ts            [CREATE — 7am brief, optionally SMS via Twilio]
│   │   ├── captures/
│   │   │   ├── route.ts                          [CREATE — POST new capture → triage agent]
│   │   │   └── [id]/route.ts                     [CREATE — PATCH approve/redirect/dismiss]
│   │   ├── tasks/
│   │   │   ├── route.ts                          [CREATE — GET list, POST create]
│   │   │   └── [id]/route.ts                     [CREATE — PATCH update/complete/kill, DELETE]
│   │   ├── projects/
│   │   │   ├── route.ts                          [CREATE — GET, POST]
│   │   │   └── [id]/route.ts                     [CREATE — PATCH, DELETE]
│   │   ├── goals/
│   │   │   ├── route.ts                          [CREATE — GET, POST]
│   │   │   └── [id]/route.ts                     [CREATE — PATCH, DELETE]
│   │   ├── indicators/
│   │   │   └── route.ts                          [CREATE — GET by goal, POST, PATCH entry]
│   │   ├── reviews/
│   │   │   ├── daily/route.ts                    [CREATE — POST evening shutdown, triggers review agent]
│   │   │   └── weekly/route.ts                   [CREATE — GET prepared review, POST confirm plan]
│   │   └── anchors/
│   │       └── route.ts                          [CREATE — GET this week's, POST set anchor]
│
└── components/
    ├── nav.tsx                                   [CREATE — sidebar/bottom nav, 3 items: Today / Plan / Inbox]
    ├── capture-bar.tsx                           [CREATE — floating input, present on all screens]
    ├── task-card.tsx                             [CREATE — reusable task row with owner, energy, status]
    ├── goal-card.tsx                             [CREATE — goal with indicator sparklines]
    ├── project-card.tsx                          [CREATE — project with progress + kill criteria]
    ├── review-card.tsx                           [CREATE — agent review output, formatted prose]
    └── confirm-modal.tsx                         [CREATE — used for weekly plan confirmation]
```

---

## Detailed build instructions by section

### 1. Foundation files

**`lib/supabase.ts`**
Export two functions: `createServerClient()` (uses cookies from `next/headers`, for Server Components and Route Handlers) and `createBrowserClient()` (for Client Components). Use `@supabase/ssr`. Server client uses the service role key only in Route Handlers that are cron-protected; all other server usage uses the anon key + cookie-based session.

**`lib/anthropic.ts`**
A single shared async function `callClaude(systemPrompt: string, userMessage: string): Promise<string>`. Uses `fetch` to call `https://api.anthropic.com/v1/messages` with model `claude-sonnet-4-6`, max_tokens 1000. Extracts `data.content[0].text`. Wrap in try/catch. No streaming needed — all agent calls are backend-only.

**`lib/utils.ts`**
- `cn(...classes)` — Tailwind class merger (use clsx + tailwind-merge)
- `mondayOf(date: Date): string` — returns YYYY-MM-DD for the Monday of date's week
- `formatTime(iso: string): string` — "9:00 AM" format
- `formatDuration(min: number): string` — "45 min" / "1h 30m"
- `todayISO(): string` — current date as YYYY-MM-DD

**`vercel.json`**
```json
{
  "crons": [
    { "path": "/api/cron/nightly", "schedule": "0 7 * * *" },
    { "path": "/api/cron/weekly-prep", "schedule": "0 20 * * 5" },
    { "path": "/api/cron/morning-brief", "schedule": "30 12 * * *" }
  ]
}
```
(07:00 UTC = ~02:00 Toronto for nightly. 20:00 UTC Friday = ~15:00–16:00 Toronto for weekly prep. 12:30 UTC = ~07:30 Toronto for morning brief.)

---

### 2. Google Calendar OAuth flow

**`app/api/gcal/connect/route.ts`** — GET handler
Builds the Google OAuth URL with scopes `calendar.events` and `calendar.freebusy`, includes `state` param = the founder's user ID (from session), redirects there.

**`app/api/gcal/callback/route.ts`** — GET handler
Exchanges the `code` param for tokens. Stores `refresh_token` and `calendar_id` (default `primary`) in the `gcal_tokens` table for the founder from `state`. Redirects to `/plan` on success.

Add a "Connect Google Calendar" button to the `/plan` page header that links to `/api/gcal/connect`. Show a green checkmark if `gcal_tokens` row exists for the current founder.

---

### 3. Capture API + Triage Agent

**`app/api/captures/route.ts`** — POST
Body: `{ raw_text: string }`
1. Insert a row into `captures` with `state = 'pending'` and the founder's user ID.
2. Fetch projects + founders from Supabase.
3. Call the Triage Agent via `callClaude()`. Parse the JSON response.
4. Update the capture row with `triage = parsed JSON`.
5. Return the capture row.

On JSON parse error, store `triage = { error: true, raw: responseText }` and return anyway — never fail a capture.

**`app/api/captures/[id]/route.ts`** — PATCH
Body: `{ action: 'approve' | 'redirect' | 'dismiss', overrides?: Partial<triage> }`
- `approve`: create a task from the triage JSON (with any overrides), set `captures.state = 'approved'`, set `captures.task_id`.
- `redirect`: update the triage JSON with overrides, leave in pending so the founder can re-approve.
- `dismiss`: set `captures.state = 'dismissed'`.

---

### 4. Plan screen

**`app/plan/page.tsx`** — Server Component
Fetches all goals with their indicators and project counts. Renders a list of `<GoalCard>` components. "New goal" button top right. Shows the Google Calendar connection status for each founder.

**`app/plan/goals/[id]/page.tsx`**
Full goal page: outcome, target date, status, indicators with weekly actuals (sparkline using inline SVG — just 8 data points as a simple path, no library needed), and a list of projects. Each project links to its detail page. "New project" button. Inline editing of the goal fields (use a simple toggle between read and edit mode — no modal).

**`app/plan/projects/[id]/page.tsx`**
Project detail: name, goal link, owner, status, premortem text (editable), kill criteria + kill date (editable), and the full task list. Task list groups by status: planned → scheduled → done → killed. Each task row shows owner avatar initials, energy dot (filled = deep, outline = shallow), estimate, and slip count badge (only visible if >0, neutral grey, not red). Inline "add task" row at the bottom of the planned section.

---

### 5. Inbox screen

**`app/inbox/page.tsx`** — Client Component
Fetches all `captures` where `state = 'pending'` for the current founder. For each capture:
- Show the raw text
- Show the agent's proposed triage (project name, owner, estimate, energy, date)
- Three buttons: **Use this** (approve), **Edit** (redirect with inline override fields), **Dismiss**
- If `triage.confidence === 'low'`, show the triage note in a subtle muted style — not alarming, just informative.

Empty state: "Nothing waiting. Drop a thought in the bar above." (The capture bar is always visible at the top.)

---

### 6. Evening shutdown + Review Agent

**`app/review/page.tsx`** — Client Component
A short form with three questions (conversational, not form-like):
1. "What got done?" — checkboxes pre-populated from today's scheduled tasks (most will already be ticked from the Today page)
2. "Anything blocked?" — single textarea, optional
3. "Anything on your mind for tomorrow?" — single textarea, optional

Submit → POST to `/api/reviews/daily`.

**`app/api/reviews/daily/route.ts`** — POST
1. Save the founder's responses to the `reviews` table for today.
2. Fetch today's completed and slipped tasks, tomorrow's blocks.
3. Call the daily Review Agent with the data.
4. Store agent output in `reviews.agent_summary`.
5. Return the summary so the page can display it immediately after submission.

After submission, the page shows the agent's summary in a `<ReviewCard>`. No redirect — let them read it there.

---

### 7. Weekly review (Sunday flow)

**`app/api/cron/weekly-prep/route.ts`** — GET (Vercel cron, runs Friday ~4pm Toronto)
Assembles the weekly review data: task completion per founder, indicator actuals vs targets, slip analysis, last week's challenger question (to avoid repeating it). Calls the weekly Review Agent. Calls the Planner Agent to generate next week's proposed plan. Stores both outputs on the `reviews` table for the upcoming Monday with `type = 'weekly'`.

**`app/review/weekly/page.tsx`** — Client Component
The Sunday review UI. Two-column layout on desktop, stacked on mobile.

Left column — the review:
- Load and display the agent's weekly review markdown from the `reviews` table
- Rendered as formatted prose (use a simple markdown renderer or just render the sections manually since the format is fixed)
- Each indicator shows actual vs target + trend arrow
- Slipped tasks show the four-option triage (reschedule / shrink / hand off / kill) as pill buttons

Right column — next week's plan:
- Show the Planner's proposed `one_metric` prominently
- Editable task assignment list (drag to re-assign between founders, toggle week assignment)
- Each founder's proposed anchor commitment (editable text input pre-filled with the agent's suggestion)
- "Confirm this week's plan" button at the bottom

On confirm:
- POST to `/api/reviews/weekly`
- This writes the confirmed plan: sets `week_assigned` on all tasks, creates `anchor_commitments` rows, triggers the scheduler to run for Monday–Friday

**`app/api/reviews/weekly/route.ts`** — GET + POST
- GET: return the prepared weekly review + proposed plan for the current week
- POST body: `{ confirmed_assignments: [{task_id, owner, week_start}], one_metric, anchor_sid, anchor_aaryan, indicator_entries: [{indicator_id, actual}] }`
- Writes all confirmed data. Then immediately runs the scheduler for the full week and writes blocks to GCal.

---

### 8. Navigation + Capture bar

**`components/nav.tsx`**
Three items only: **Today** / **Plan** / **Inbox** (with a count badge if pending > 0). On desktop: left sidebar, 60px wide, icon-only, tooltip on hover. On mobile: bottom tab bar. Active state is a filled background pill on the icon.

**`components/capture-bar.tsx`**
Sticky top bar on every screen. A single text input, placeholder: "Capture a thought..." On submit: POST to `/api/captures`, show a subtle "Triaging..." state, then "Added to inbox" toast. Input clears immediately on submit — don't wait for the agent. The agent runs in the background; the founder gets on with their day.

**`app/layout.tsx`**
Wraps everything in the nav + capture bar. `<html>` → `<body>` → `<CaptureBar />` → `<Nav />` → `<main>{children}</main>`. Auth check: if no session, redirect to `/login`.

---

### 9. Auth (minimal)

**`app/login/page.tsx`**
Email + password sign-in using Supabase Auth. Simple. After sign-in, redirect to `/today`. If the user is not in the `founders` table (i.e., not Sid or Aaryan), sign them out and show "This app is private."

Add a Supabase middleware file (`middleware.ts` at root) to protect all routes except `/login`.

---

### 10. Morning brief cron (bonus — implement if time allows)

**`app/api/cron/morning-brief/route.ts`**
For each founder: fetch today's blocks + the one-metric for the week + partner's anchor. Format into a 3-sentence brief. If Twilio credentials exist (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, and per-founder phone numbers stored in `profiles`), SMS it. Otherwise log to console (Vercel logs visible in dashboard).

---

## Components specification

### `<TaskCard task={} onUpdate={} />`
Props: task object from DB, onUpdate callback. Shows: energy dot (deep = filled indigo circle, shallow = outline circle), title, owner initials badge, estimate duration, slip count (grey, only if >0). Click → inline edit mode. Status toggle via a subtle checkbox left of the title. No modal.

### `<GoalCard goal={} indicators={} />`
Shows: outcome text (large), target date + weeks remaining, status badge. Below: each indicator as a single line — `name · actual/target · sparkline`. Sparkline: 8-point SVG polyline, 60×20px, no axes, just the line. Indigo if on track (>80% of target), amber if below.

### `<ProjectCard project={} />`
Name, goal link, owner, task counts (X done / Y open). If `kill_criteria` is set, show it in small muted text. Status badge (active/paused/done/killed). Click goes to project detail page.

### `<ReviewCard summary={} />`
Renders the review agent's output. The summary is structured prose — just render it in a clean card with a serif-ish font (Georgia or similar) at 16px, generous line-height. No markdown parsing needed — the agent's format is fixed and simple.

### `<ConfirmModal />`
Used for the weekly plan confirmation. Shows a summary of what's about to be committed (task count per founder, one metric, both anchors). Two buttons: "Edit more" (closes modal) and "Confirm this week" (fires the POST).

---

## Build order for one day

Follow this order. Each step produces something usable. Do not skip ahead.

**Hour 1-2: Foundation**
1. `package.json` — install deps: `@supabase/ssr`, `@anthropic-ai/sdk`, `tailwindcss`, `clsx`, `tailwind-merge`
2. `lib/supabase.ts`, `lib/anthropic.ts`, `lib/utils.ts`
3. `app/globals.css` with the CSS variables
4. `app/layout.tsx` skeleton (nav placeholder, capture bar placeholder)
5. `middleware.ts` for auth protection
6. Run schema.sql in Supabase (add gcal_tokens table). Seed founders.

**Hour 3-4: Core data layer (CRUD APIs)**
7. `app/api/goals/route.ts` and `[id]/route.ts`
8. `app/api/projects/route.ts` and `[id]/route.ts`
9. `app/api/tasks/route.ts` and `[id]/route.ts`
10. `app/api/indicators/route.ts`

**Hour 5-6: Plan screen (the spine)**
11. `components/goal-card.tsx`, `project-card.tsx`, `task-card.tsx`
12. `app/plan/page.tsx`
13. `app/plan/goals/[id]/page.tsx`
14. `app/plan/projects/[id]/page.tsx`

**Hour 7: Capture + Inbox**
15. `app/api/captures/route.ts` (with Triage Agent)
16. `app/api/captures/[id]/route.ts`
17. `components/capture-bar.tsx`
18. `app/inbox/page.tsx`

**Hour 8-9: Calendar**
19. `app/api/gcal/connect/route.ts`
20. `app/api/gcal/callback/route.ts`
21. Calendar connect button on the plan page

**Hour 10-11: Review loop**
22. `app/review/page.tsx` (evening shutdown)
23. `app/api/reviews/daily/route.ts`
24. `components/review-card.tsx`
25. `app/api/cron/weekly-prep/route.ts`
26. `app/review/weekly/page.tsx`
27. `app/api/reviews/weekly/route.ts`
28. `components/confirm-modal.tsx`

**Hour 12: Nav, auth, polish**
29. `components/nav.tsx` (final)
30. `app/login/page.tsx`
31. `app/page.tsx` (redirect)
32. `vercel.json`
33. End-to-end test: create a goal → project → task → capture → triage → inbox approve → scheduler → today screen

---

## What "done" looks like

At the end of the build, you should be able to:
1. Sign in as Sid
2. See the Today screen with today's scheduled blocks (if it's Monday+ in the week and the nightly ran)
3. Type a thought into the capture bar and see it appear in Inbox with a triage proposal within 2 seconds
4. Approve a capture → it becomes a task on the right project
5. Go to Plan → see goals → indicators → projects → tasks, all editable
6. Go to Review → fill in the evening shutdown → see the agent's summary
7. Go to Review → Weekly → see the prepared Sunday review + proposed plan → confirm it → see GCal blocks appear

The app should work if Aaryan signs in simultaneously. Both should see each other's anchor commitments on the Today screen.

---

## Notes and gotchas

- **Never use `localStorage`** — Supabase session is cookie-based. Everything auth-related goes through `@supabase/ssr`.
- **All agent calls are server-side only.** The `ANTHROPIC_API_KEY` must never be exposed to the browser. All four agent system prompts live in Route Handlers, never in Client Components.
- **The nightly cron uses the service role key** to read gcal_tokens for all founders. All other operations use the session-scoped anon key.
- **The scheduler is already written** — import `buildSchedule` from `lib/scheduler.ts`. Do not rewrite it.
- **The gcal helpers are already written** — import from `lib/gcal.ts`. Do not rewrite them.
- **Tailwind only** — no other CSS-in-JS library. Use the `--qa-*` CSS variables for anything Tailwind can't express.
- **No third-party chart library** — sparklines are inline SVG. Keep it simple.
- **Mobile-first** — Today and Inbox screens will be used on phones. Plan and Review can be desktop-first. Nav is bottom tabs on mobile.
- **Error states matter** — every page that makes API calls needs a loading skeleton and an error state. Use `<Suspense>` for Server Components.
- **The capture bar submits optimistically** — clear the input immediately, show a toast, handle errors gracefully in the background.
- **Tone of all UI copy follows the agent personality doc** — plain, direct, no filler. Empty states are invitations to act, not apologies.
