# Improvements — round 3: intuitiveness, momentum, and reflection

This pass had two goals: make the daily loop the easiest thing in the founders' day, and add features that make the tool genuinely worth opening. Every interaction decision is tied to a specific behavioral-science finding — listed inline so the *why* is auditable, not decorative.

Verified with `tsc --noEmit` (clean, whole project) and a Tailwind compile of the new design-system classes (clean, all `@apply` rules resolve). The project has no ESLint config, so `next build` skips linting; the full production compile is too CPU-heavy to finish in the build sandbox, but the type/import/CSS surface is fully checked and every client/server boundary was reviewed by hand.

---

## Three new features

### 1. Momentum — progress you can see, without a scoreboard

The single strongest driver of motivation in meaningful work is *seeing progress* (Amabile & Kramer, *The Progress Principle*). The app tracked completions but never reflected them back.

- **Daily progress ring** on the Today hero. Fills as the day's blocks complete. This is the **goal-gradient effect** (Hull 1932; Kivetz et al. 2006): motivation to finish rises as the visible gap shrinks. An empty day is a quiet outline — never a red zero.
- **"This week" line**: `9 shipped · 3 moved a goal forward`. Calm, factual, and it ties effort back to goals (the thing that actually matters). Hidden entirely when there's nothing yet — no guilt-by-default.
- **Fresh-start greeting**: after 3+ dark days, Today opens with "Welcome back. Clean slate — nothing piled up." The **fresh-start effect** (Dai, Milkman & Riis 2014) says people re-engage at temporal landmarks; the personality doc demanded it, and now the UI delivers it instead of a backlog.

### 2. Per-task reschedule — granular scheduling control

Previously the only scheduling lever on Today was *replan the entire day*. Now each task has a **"Not today" → Tomorrow / Later** action (`app/api/schedule/move/route.ts`).

It moves exactly one task: deletes only that task's future blocks today, removes only its tagged Google Calendar event (real meetings untouched), and puts it back in the pool with a `due_date` bias — **without** touching `week_assigned`, so an in-week move is never miscounted as a slip. This is autonomy in Self-Determination Theory terms: a cheap, reversible-feeling override the founder controls, instead of all-or-nothing. "Later" drops the due date entirely — an honest "not now," no backlog pressure.

### 3. Insights — where the work is actually going (`/insights`)

The weekly challenger question asks "critical-path work or comfortable work?" This page answers it with data instead of a hunch, company-wide to match the weekly review:

- **This week at a glance** — shipped count, focused time, % of effort on goals.
- **Critical path vs the rest** — goal-linked effort vs everything else, with the honest framing that both are real work; the question is whether the split is on purpose.
- **Where time went** — minutes by category, each with a ↑/↓/→ vs the prior 4-week average (the trend that *earns* a challenger question).
- **Deep vs shallow** — how much of the scarce deep-work resource the week actually got.
- **Estimate reality** — surfaces the learned planning-fallacy multipliers the scheduler already computes ("product work tends to take 2.1×"), which were invisible until now.
- **Leading indicators** — trend sparklines.

Framed as information, never a grade. No streaks, no scores, no red — consistent with the product's hard rules.

---

## The polish pass (intuitiveness)

**Design system (`app/globals.css`, `tailwind.config.ts`).** Added elevation, motion, and focus-ring tokens plus reusable component classes (`qa-card`, `qa-btn`, `qa-chip`, `qa-input`, `qa-eyebrow`) so a button on Today matches a button on the weekly review. Motion respects `prefers-reduced-motion`. A visible, on-brand focus ring makes keyboard use first-class.

**Today, rebuilt (`app/today/page.tsx`).** Replaced the inline-styled one-off with the design system and applied:

- **Von Restorff (isolation) effect** — the #1 task is one visually distinct hero; everything else is quieter, so the eye lands on the one thing that matters.
- **Peak–end rule** (Kahneman) — finishing a task fires a satisfying check-draw + pop; a fully-done day ends on a warm close instead of just emptying.
- **Fitts's Law** — completion targets are 36px and reachable, not 26px pinpoints, especially for thumbs.
- **Implementation intentions** (Gollwitzer) — every task stays bound to a concrete time block ("9:00 – 11:00"), the format with the largest follow-through effect in the literature.

**Navigation (`components/nav.tsx`).** Primary nav is now the four loop verbs — Today / Plan / Inbox / Review — with Insights and Settings as support. **Hick's Law**: fewer top-level choices, faster orientation, and the structure mirrors the mental model (capture → plan → execute → review).

**Capture bar (`components/capture-bar.tsx`).** Press `/` from anywhere to jump to capture without the mouse. The **Zeigarnik effect** says an unrecorded thought keeps nagging, so the cost of recording it must be near zero; the input still clears instantly so a second thought can follow.

**Review (`app/review/page.tsx`, `components/review-card.tsx`).** The shutdown now closes with a warm checkmark (the "end" in peak–end), and the agent's memo renders real markdown — headings, bullets, and bold — so it reads like writing from a partner, not a UI dump.

---

## Deliberately not added

Consistent with the product's no-guilt rules and the two prior audit rounds: no streaks, no completion percentages framed as scores, no red badges, no urgency theater, and no fifth "snooze" that would undermine the four honest slip options. Momentum is shown as progress, never as a debt.
