// scripts/seed-founders.mjs
// ============================================================
// ONE-TIME ACCESS SETUP — creates exactly the two founder accounts
// (Sid + Aaryan) and nothing else, then seeds the founders + profiles
// rows the app's gate checks against.
//
// Run once:   npm run seed
//
// It is idempotent: run it again any time to make sure both accounts
// exist and have app access. Existing accounts are left as-is (their
// passwords are NOT changed on a re-run).
//
// Reads config from .env.local (or real environment variables, which
// win). Required:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY        (service role — never ship to the browser)
//   FOUNDER_SID_PASSWORD
//   FOUNDER_AARYAN_EMAIL
//   FOUNDER_AARYAN_PASSWORD
// Optional (sensible defaults shown):
//   FOUNDER_SID_EMAIL      (default: siddharth.phatak42@gmail.com)
//   FOUNDER_SID_NAME       (default: Sid)
//   FOUNDER_AARYAN_NAME    (default: Aaryan)
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---- load .env.local (without adding a dependency) ----
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const m = raw.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}
loadEnv(".env.local");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

if (!URL || !SERVICE_KEY) {
  fail(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "    Add them to .env.local (see SETUP.md), then run `npm run seed` again."
  );
}

// The two — and only two — people with access.
const FOUNDERS = [
  {
    name: process.env.FOUNDER_SID_NAME || "Sid",
    email: process.env.FOUNDER_SID_EMAIL || "siddharth.phatak42@gmail.com",
    password: process.env.FOUNDER_SID_PASSWORD,
    // a weekday morning deep-work window to start; tune in Settings
    energy_windows: [{ days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "12:00" }],
  },
  {
    name: process.env.FOUNDER_AARYAN_NAME || "Aaryan",
    email: process.env.FOUNDER_AARYAN_EMAIL,
    password: process.env.FOUNDER_AARYAN_PASSWORD,
    energy_windows: [{ days: ["mon", "tue", "wed", "thu", "fri"], start: "20:00", end: "23:00" }],
  },
];

for (const f of FOUNDERS) {
  if (!f.email) fail(`Missing email for ${f.name}. Set FOUNDER_${f.name.toUpperCase()}_EMAIL.`);
  if (!f.password || f.password.length < 8)
    fail(`${f.name} needs a password of at least 8 characters (FOUNDER_${f.name.toUpperCase()}_PASSWORD).`);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function ensureUser(f) {
  const { data, error } = await admin.auth.admin.createUser({
    email: f.email,
    password: f.password,
    email_confirm: true, // private app — no confirmation email needed
  });
  if (data?.user) return { user: data.user, created: true };
  const existing = await findUserByEmail(f.email);
  if (existing) return { user: existing, created: false };
  throw new Error(`couldn't create or find ${f.email}: ${error?.message ?? "unknown error"}`);
}

async function run() {
  console.log("\n  Setting up founder access…\n");
  const results = [];
  for (const f of FOUNDERS) {
    const { user, created } = await ensureUser(f);

    const { error: fErr } = await admin
      .from("founders")
      .upsert({ user_id: user.id, display_name: f.name }, { onConflict: "user_id" });
    if (fErr) throw new Error(`founders upsert for ${f.email}: ${fErr.message}`);

    const { error: pErr } = await admin.from("profiles").upsert(
      {
        user_id: user.id,
        energy_windows: f.energy_windows,
        daily_ceiling_minutes: 300,
        timezone: "America/Toronto",
        multipliers: { _default: 1.5 },
      },
      { onConflict: "user_id" }
    );
    if (pErr) throw new Error(`profiles upsert for ${f.email}: ${pErr.message}`);

    results.push({ name: f.name, email: f.email, id: user.id, created });
    console.log(`  ${created ? "✓ created" : "• already existed"}  ${f.name.padEnd(7)} ${f.email}`);
  }

  console.log("\n  Done. These two accounts have access — and only these two.\n");
  console.table(results.map(({ name, email, id }) => ({ name, email, user_id: id })));
  console.log(
    "\n  Next: in the Supabase dashboard, turn OFF public sign-ups\n" +
      "  (Authentication → Sign In / Providers → Email → disable “Allow new users to sign up”).\n" +
      "  Then sign in at /login.\n"
  );
}

run().catch((e) => fail(e.message));
