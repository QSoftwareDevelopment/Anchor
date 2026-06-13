# Functionality Audit + Upgrade — round 2

A walk through the full capture → plan → execute → review loop surfaced seven functional gaps. All are now fixed. Verified with `tsc --noEmit` (clean) and a full production build (28 routes, exit 0).

## New capabilities

**1. Settings screen (`/settings`) + profile API.** The scheduler's hard constraints — deep-work windows, daily ceiling, timezone, phone, time multipliers — were SQL-only. Now editable in the app: day-of-week pills and time pickers for energy windows, a slider for the ceiling (1h–10h), and per-category multiplier inputs (clamped 0.5×–3×). Sign out lives here too; previously there was no way to log out at all.

**2. Mid-day replan (`POST /api/schedule/replan` + button on Today).** When the day blows up, "Day changed? Replan the rest of it" rebuilds the schedule from this minute forward. Hard rules preserved: minutes already worked today count against the ceiling (no smuggling extra hours), only agent-tagged calendar events are touched, and what doesn't fit comes back as unplaced — surfaced tonight, never crammed.

**3. The agent now learns (multiplier learning, the schema's promised Phase 5).** Two halves:
   - *Capture:* the evening shutdown asks "took __ min" for each completed task (pre-filled with the estimate, one keystroke to adjust), writing `actual_minutes`.
   - *Learn:* the nightly cron takes the last 21 days of estimate-vs-actual per category, computes the **median** ratio (outlier-resistant), and EMA-blends it into `profiles.multipliers` (70% old / 30% new, needs 3+ samples per category, clamped 0.5–3). Tonight's plan already uses the updated model. Estimates quietly get realistic without anyone tuning anything.

**4. Anchor accountability closed.** `anchor_commitments.kept` was read by the weekly review agent but never written — the agent could never challenge a missed anchor. The Sunday review now opens with "This week's anchors" and two neutral pills per founder: *kept* / *didn't happen*. That feeds the next weekly review's data.

**5. Review history (`/review/history`).** Every past weekly review, one-metric, and challenger question, newest first, expandable. The paper trail for spotting drift that week-to-week views miss.

**6. Calendar connect feedback.** `/plan` now reads the OAuth callback's result and shows a one-line status — including the actionable fix for the "Google didn't return a refresh token" case (revoke at myaccount.google.com/permissions, reconnect).

**7. Live inbox badge.** Capturing a thought or approving/dismissing one now updates the nav count and the open inbox immediately (a `qa:captures-changed` window event), instead of waiting for a full page reload.

## Deliberately not added

- Streaks, completion percentages, productivity scores — all banned by the product's no-guilt rules.
- Notifications beyond the morning brief — the product is a calm tool, not an attention trap.
- A "snooze" on tasks — slips already have exactly four honest options (reschedule / shrink / hand off / kill); a fifth softer one would undermine them.

## Where the learning shows up

After ~2 weeks of evening shutdowns with real actuals, check Settings → Time multipliers. If your product work consistently takes 2× the estimate, the multiplier will have drifted there on its own, and the scheduler will have been quietly planning fewer, more honest blocks per day.
