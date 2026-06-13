// app/settings/page.tsx
// Your scheduling contract: energy windows, daily ceiling, timezone,
// phone, and the learned multipliers (editable — the nightly job
// keeps tuning them from estimate vs actual). Plus sign out.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type EnergyWindow = { days: string[]; start: string; end: string };
type Profile = {
  display_name: string;
  energy_windows: EnergyWindow[];
  daily_ceiling_minutes: number;
  timezone: string;
  phone: string | null;
  multipliers: Record<string, number>;
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const supabase = createBrowserSupabase();

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/profile");
      if (res.ok) setProfile(await res.json());
      else setError("Couldn't load your profile.");
    })();
  }, []);

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        daily_ceiling_minutes: profile.daily_ceiling_minutes,
        timezone: profile.timezone,
        phone: profile.phone,
        energy_windows: profile.energy_windows,
        multipliers: profile.multipliers,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save. Check the values and try again.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function updateWindow(i: number, patch: Partial<EnergyWindow>) {
    setProfile((p) =>
      p
        ? {
            ...p,
            energy_windows: p.energy_windows.map((w, j) =>
              j === i ? { ...w, ...patch } : w
            ),
          }
        : p
    );
  }

  if (!profile)
    return (
      <div className="mx-auto max-w-lg px-5 py-8">
        <div className="h-7 w-40 animate-pulse rounded bg-qa-surface-2" />
        <div className="mt-4 h-64 animate-pulse rounded-qa bg-qa-surface" />
        {error && <p className="mt-3 text-sm text-qa-warn">{error}</p>}
      </div>
    );

  return (
    <div className="mx-auto max-w-lg px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <button onClick={signOut} className="text-sm text-qa-text-2 hover:underline">
          Sign out {profile.display_name}
        </button>
      </div>
      <p className="mt-1 text-sm text-qa-text-2">
        The scheduler treats everything here as a hard constraint.
      </p>

      {/* Daily ceiling */}
      <section className="mt-7">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
          Daily ceiling
        </h2>
        <div className="mt-2 flex items-center gap-3 rounded-qa border border-qa-line bg-white p-4">
          <input
            type="range"
            min={60}
            max={600}
            step={15}
            className="flex-1 accent-[var(--qa-accent)]"
            value={profile.daily_ceiling_minutes}
            onChange={(e) =>
              setProfile({ ...profile, daily_ceiling_minutes: Number(e.target.value) })
            }
          />
          <span className="w-20 text-right font-mono text-sm">
            {Math.floor(profile.daily_ceiling_minutes / 60)}h{" "}
            {profile.daily_ceiling_minutes % 60 || ""}
            {profile.daily_ceiling_minutes % 60 ? "m" : ""}
          </span>
        </div>
        <p className="mt-1 text-xs text-qa-text-2">
          The agent never plans past this — even when you ask it to.
        </p>
      </section>

      {/* Energy windows */}
      <section className="mt-7">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
          Deep-work windows
        </h2>
        <div className="mt-2 space-y-3">
          {profile.energy_windows.map((w, i) => (
            <div key={i} className="rounded-qa border border-qa-line bg-white p-4">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    onClick={() =>
                      updateWindow(i, {
                        days: w.days.includes(d)
                          ? w.days.filter((x) => x !== d)
                          : [...w.days, d],
                      })
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      w.days.includes(d)
                        ? "bg-qa-accent text-qa-accent-text"
                        : "bg-qa-surface text-qa-text-2"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="time"
                  className="rounded-qa-sm border border-qa-line-strong px-2 py-1 font-mono text-sm"
                  value={w.start}
                  onChange={(e) => updateWindow(i, { start: e.target.value })}
                />
                <span className="text-qa-text-2">to</span>
                <input
                  type="time"
                  className="rounded-qa-sm border border-qa-line-strong px-2 py-1 font-mono text-sm"
                  value={w.end}
                  onChange={(e) => updateWindow(i, { end: e.target.value })}
                />
                <button
                  onClick={() =>
                    setProfile({
                      ...profile,
                      energy_windows: profile.energy_windows.filter((_, j) => j !== i),
                    })
                  }
                  className="ml-auto text-sm text-qa-text-2 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() =>
              setProfile({
                ...profile,
                energy_windows: [
                  ...profile.energy_windows,
                  { days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "12:00" },
                ],
              })
            }
            className="rounded-qa-sm border border-dashed border-qa-line-strong px-3 py-2 text-sm text-qa-text-2 hover:bg-qa-surface"
          >
            Add a window
          </button>
        </div>
        <p className="mt-1 text-xs text-qa-text-2">
          Deep tasks only get scheduled inside these. Guard them.
        </p>
      </section>

      {/* Multipliers */}
      <section className="mt-7">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
          Time multipliers
        </h2>
        <div className="mt-2 rounded-qa border border-qa-line bg-white p-4">
          {Object.entries(profile.multipliers).map(([cat, mult]) => (
            <div key={cat} className="flex items-center gap-3 border-b border-qa-line py-2 text-sm last:border-0">
              <span className="flex-1">{cat === "_default" ? "everything else" : cat}</span>
              <input
                type="number"
                step={0.1}
                min={0.5}
                max={3}
                className="w-20 rounded-qa-sm border border-qa-line-strong px-2 py-1 text-right font-mono text-sm"
                value={mult}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    multipliers: { ...profile.multipliers, [cat]: Number(e.target.value) },
                  })
                }
              />
              <span className="font-mono text-xs text-qa-text-2">×</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-qa-text-2">
          Every estimate gets multiplied by these. The nightly job tunes them from
          your real completion times — edit only if it&apos;s clearly off.
        </p>
      </section>

      {/* Contact */}
      <section className="mt-7">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-qa-text-2">
          Morning brief
        </h2>
        <div className="mt-2 flex flex-wrap gap-3 rounded-qa border border-qa-line bg-white p-4">
          <div className="flex-1">
            <label className="text-xs text-qa-text-2" htmlFor="phone">Phone (SMS, E.164)</label>
            <input
              id="phone"
              placeholder="+14165550100"
              className="mt-1 w-full rounded-qa-sm border border-qa-line-strong px-3 py-2 font-mono text-sm"
              value={profile.phone ?? ""}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-qa-text-2" htmlFor="tz">Timezone</label>
            <input
              id="tz"
              className="mt-1 w-full rounded-qa-sm border border-qa-line-strong px-3 py-2 font-mono text-sm"
              value={profile.timezone}
              onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
            />
          </div>
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-qa-warn">{error}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="mt-6 rounded-qa-sm bg-qa-accent px-4 py-2 font-semibold text-qa-accent-text disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save settings"}
      </button>
    </div>
  );
}
