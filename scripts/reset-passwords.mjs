// scripts/reset-passwords.mjs
// ============================================================
// Force the founder login passwords to known values — safely, without
// deleting anyone (deleting an auth user cascade-deletes their data).
//
// Uses the Supabase Admin API (service role) to set a new password on an
// existing account. No email/SMTP needed.
//
// HOW TO USE
//   1. Put the password(s) you want in .env.local:
//        FOUNDER_SID_PASSWORD=the-one-you-want
//        FOUNDER_AARYAN_PASSWORD=the-one-you-want
//      (Emails come from .env.local too; Sid defaults to the known address.)
//   2. Run:   node scripts/reset-passwords.mjs
//   3. Sign in with that exact password.
//
// Requires (already in .env.local): NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
const fail = (m) => {
  console.error(`\n  ✗ ${m}\n`);
  process.exit(1);
};
if (!URL || !SERVICE_KEY)
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");

const TARGETS = [
  {
    name: "Sid",
    email: process.env.FOUNDER_SID_EMAIL || "siddharth.phatak42@gmail.com",
    password: process.env.FOUNDER_SID_PASSWORD,
  },
  {
    name: "Aaryan",
    email: process.env.FOUNDER_AARYAN_EMAIL,
    password: process.env.FOUNDER_AARYAN_PASSWORD,
  },
].filter((t) => t.email && t.password);

if (TARGETS.length === 0)
  fail(
    "No passwords to set. Put FOUNDER_SID_PASSWORD and/or FOUNDER_AARYAN_PASSWORD\n" +
      "    (plus FOUNDER_AARYAN_EMAIL) in .env.local, then run this again."
  );

for (const t of TARGETS)
  if (t.password.length < 8) fail(`${t.name}'s password must be at least 8 characters.`);

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || "").toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function run() {
  console.log(`\n  Project: ${URL}`);
  console.log("  Updating founder passwords…\n");
  for (const t of TARGETS) {
    const user = await findUserByEmail(t.email);
    if (!user) {
      console.log(`  • not found  ${t.name.padEnd(7)} ${t.email} — run "npm run seed" first`);
      continue;
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, { password: t.password });
    if (error) fail(`couldn't update ${t.email}: ${error.message}`);
    console.log(`  ✓ updated    ${t.name.padEnd(7)} ${t.email}`);
  }
  console.log("\n  Done. Sign in with the new password(s).\n");
}

run().catch((e) => fail(e.message));
