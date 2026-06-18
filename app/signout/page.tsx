// app/signout/page.tsx
// A real sign-out flow, not a stray button. Confirms intent, ends the
// Supabase session cleanly, and lands on a calm "you're signed out"
// state with a way back in. Public in middleware so the confirmation
// still renders after the session is gone.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";

const supabase = createBrowserSupabase();

export default function SignOutPage() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [phase, setPhase] = useState<"confirm" | "working" | "done">("confirm");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setPhase("done");
        return;
      }
      const { data } = await supabase
        .from("founders")
        .select("display_name")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      setName(data?.display_name ?? null);
    })();
  }, []);

  async function signOut() {
    setPhase("working");
    await supabase.auth.signOut();
    // give the cookie clear a beat, then settle on the done state
    setTimeout(() => setPhase("done"), 350);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm text-center qa-rise">
        <div className="mx-auto mb-6 flex items-center justify-center">
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl font-mono text-xl font-bold text-white"
            style={{ background: "var(--qa-grad)", boxShadow: "var(--qa-glow)" }}
          >
            A
          </span>
        </div>

        {phase === "done" ? (
          <>
            <h1 className="text-2xl font-[650]">You&apos;re signed out</h1>
            <p className="mt-2 text-sm text-qa-text-2">
              Your session ended on this device. Anchor OS is locked until you sign back in.
            </p>
            <Link href="/login" className="qa-btn qa-btn-primary mt-6 inline-flex w-full justify-center py-2.5">
              Sign back in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-[650]">
              Sign out{name ? <>, <span className="qa-grad-text">{name}</span></> : ""}?
            </h1>
            <p className="mt-2 text-sm text-qa-text-2">
              You&apos;ll need your email and password to get back in. Your plan, tasks, and calendar stay exactly as you left them.
            </p>
            <div className="mt-6 space-y-2.5">
              <button
                onClick={signOut}
                disabled={phase === "working"}
                className="qa-btn qa-btn-primary w-full justify-center py-2.5"
              >
                {phase === "working" ? "Signing out…" : "Sign out"}
              </button>
              <button
                onClick={() => router.back()}
                disabled={phase === "working"}
                className="qa-btn qa-btn-ghost w-full justify-center py-2.5"
              >
                Stay signed in
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
