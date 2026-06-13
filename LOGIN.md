# Access — Sid & Aaryan only

The app is locked to the two founders at three layers, so nobody else gets in even if they find the URL:

1. **Middleware** redirects anyone without a session to `/login`, and anyone signed in who isn't in the `founders` table to `/login?private=1`.
2. **The login page** signs out a non-founder and shows "This app is private."
3. **Row-Level Security** (already in `schema.sql`) means even a stray authenticated account sees zero data.

There is no public sign-up in the UI. Accounts are created once, by you, with the script below.

## One-time setup

1. **Fill `.env.local`** (copy from `.env.local.example`). You need the Supabase URL + service role key, plus the four founder vars:

   ```
   FOUNDER_SID_EMAIL=siddharth.phatak42@gmail.com
   FOUNDER_SID_PASSWORD=<pick a strong one>
   FOUNDER_AARYAN_EMAIL=<aaryan's email>
   FOUNDER_AARYAN_PASSWORD=<pick a strong one>
   ```

2. **Run the schema** in the Supabase SQL editor if you haven't (`schema.sql`).

3. **Create both accounts** — from the project root:

   ```
   npm run seed
   ```

   This creates exactly two confirmed accounts, seeds `founders` + `profiles`, and prints their user IDs. It's idempotent — safe to re-run; it won't change an existing password.

4. **Turn off public sign-up** in Supabase so the two accounts are the only ones that can ever exist:
   Dashboard → **Authentication → Sign In / Providers → Email** → disable **"Allow new users to sign up"**.

5. **Sign in** at `/login`. You land on Today; Aaryan does the same with his credentials.

## Changing a password later

Re-running `npm run seed` won't reset an existing password (on purpose). To change one, either update it in the Supabase dashboard (Authentication → Users), or delete that user there and re-run `npm run seed` with the new password in `.env.local`.

## Adding a third person (if you ever want to)

Add a third block to `FOUNDERS` in `scripts/seed-founders.mjs` and re-run `npm run seed`. Everything else — the gate, RLS, the UI — already keys off the `founders` table, so they'll have access the moment that row exists.
