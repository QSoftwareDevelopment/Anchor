// app/login/page.tsx — the single gateway. Email + password via Supabase
// Auth, gated to the two founders.
//
// Three jobs:
//  1. Sign a founder in and send them to /today.
//  2. If someone is already signed in, route them correctly without a
//     second login (founder → /today; non-founder → signed out + told).
//  3. Make the privacy boundary explicit and calm — this is Sid &
//     Aaryan's room, and the copy says so without sounding like an error.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";

const supabase = createBrowserSupabase();

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  // Is this user a founder? RLS makes the founders table self-checking.
  async function isFounder(userId: string): Promise<boolean> {
    const { data } = await supabase
      .from("founders")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data);
  }

  // On load: honour a ?private redirect, and route anyone already signed in.
  useEffect(() => {
    (async () => {
      const flagged = new URLSearchParams(window.location.search).get("private");
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        if (await isFounder(auth.user.id)) {
          router.replace("/today");
          return;
        }
        await supabase.auth.signOut();
        setError("This app is private — that account isn't one of the founders.");
      } else if (flagged) {
        setError("This app is private — that account isn't one of the founders.");
      }
      setChecking(false);
    })();
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authErr || !data.user) {
      setError("That didn't work. Check the email and password.");
      setBusy(false);
      return;
    }

    if (!(await isFounder(data.user.id))) {
      await supabase.auth.signOut();
      setError("This app is private — that account isn't one of the founders.");
      setBusy(false);
      return;
    }

    router.push("/today");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-qa-sm bg-qa-accent font-mono text-base font-bold text-qa-accent-text">
            A
          </span>
          <div className="leading-tight">
            <p className="font-semibold">Anchor OS</p>
            <p className="text-xs text-qa-text-2">Executive assistant · Sid &amp; Aaryan only</p>
          </div>
        </div>

        {checking ? (
          <div className="space-y-3" aria-hidden>
            <div className="h-11 animate-pulse rounded-qa-sm bg-qa-surface" />
            <div className="h-11 animate-pulse rounded-qa-sm bg-qa-surface" />
            <div className="h-11 animate-pulse rounded-qa-sm bg-qa-surface-2" />
          </div>
        ) : (
          <form onSubmit={submit} className="qa-rise space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              autoComplete="email"
              className="qa-input py-2.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              required
              placeholder="Password"
              autoComplete="current-password"
              className="qa-input py-2.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p className="text-sm text-qa-warn qa-fade" role="alert">
                {error}
              </p>
            )}
            <button disabled={busy} className="qa-btn qa-btn-primary w-full py-2.5">
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="pt-1 text-center text-xs text-qa-text-2">
              Accounts are created by invite only. No public sign-up.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
