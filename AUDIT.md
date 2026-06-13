# Build Audit — what was found and fixed

A post-build sweep of every file, including the four pre-written ones. Verified by `tsc --noEmit` (clean) and a full `next build` (all 24 routes compile and generate).

## Bugs found and fixed

**1. `lib/gcal.ts` — syntax error in the pre-written file.** The setup-checklist comment block switched from `//` to SQL-style `--` markers mid-comment (lines 16–23), which is invalid TypeScript. The file would not compile at all. Fixed the comment markers only; no logic touched.

**2. `app/api/cron/nightly/route.ts` — build crash.** The pre-written cron created its service-role Supabase client at module scope, so any build without `SUPABASE_SERVICE_ROLE_KEY` present (CI, preview deploys) crashed at page-data collection. Moved client creation inside the handler and marked the route `force-dynamic`.

**3. `app/api/cron/nightly/route.ts` — data clobbering.** The per-founder loop upserted `agent_summary: { [founder_id]: {...} }` wholesale, so founder #2's iteration erased founder #1's planned-minutes/unplaced data, and the nightly run also erased any evening shutdown summaries stored on the same review row. Now read-merge-write, preserving other founders' keys and existing per-founder fields.

**4. `app/today/page.tsx` — UTC date bug.** `new Date().toISOString().slice(0,10)` rolls to tomorrow's date at ~8pm Toronto, so an evening glance at Today showed the wrong day's schedule. Now computed from local time.

**5. `app/today/page.tsx` — hardcoded partner label.** The partner-anchor card always said "Aaryan's anchor", including when Aaryan was the one looking at it. Now uses the actual partner's display name from the DB.

**6. `app/today/page.tsx` — stale anchor.** The partner-anchor query took the most recent anchor of any week, so an old commitment could resurface weeks later. Now scoped to the current week's Monday.

**7. Inbox + nav badge — shared firehose.** Pending captures were shown to both founders (spec: each founder's own inbox). Both the inbox list and the nav count badge now filter by `captured_by`.

**8. `profiles.phone` missing from schema.** The morning-brief cron reads it for SMS delivery; CONTEXT.md says phone numbers live in profiles, but the column wasn't in schema.sql. Added (nullable, optional).

**9. No `.gitignore`.** Added — without it, `node_modules`, `.next`, and `.env.local` (secrets!) would land in the repo on first push.

## Design decisions worth knowing about

- **Daily review row is shared per day** (`unique(type, period_start)`), with both founders' data keyed by user id inside `agent_summary`/`responses`. Every writer now merges instead of replacing.
- **`lib/supabase.ts` vs `lib/supabase-browser.ts`** — split because the server module imports `next/headers`, which can't be bundled into client components.
- **Agent failures degrade, never block.** A capture is saved before triage runs; a failed triage stores the error on the row and the founder can edit it into a task by hand. A failed daily-review call returns a plain confirmation. A missing weekly prep still lets you run the Sunday review manually.
- **Weekly confirm uses the service client** for scheduling both founders — `gcal_tokens` is self-only under RLS, and the confirmed plan covers both calendars.

## Known limitations (not bugs, flagged on purpose)

- **Cron timezone fuzziness.** Vercel crons run in UTC; "tomorrow" in the nightly cron is UTC-tomorrow (8pm Toronto boundary). For a 2am Toronto run this is the correct calendar day in practice, but block dates near midnight UTC can land a day off in edge cases. A Phase-5 fix would compute day boundaries in `profiles.timezone`.
- **schema.sql is not idempotent** — re-running requires dropping tables first (noted in SETUP.md).
- **No automated tests.** The scheduler is a pure function and is the natural first test target.
- **Weekly review page assumes founders named Sid and Aaryan** for anchor matching (per spec). Renaming either breaks the anchor upsert mapping.
