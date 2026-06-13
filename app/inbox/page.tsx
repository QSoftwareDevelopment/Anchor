// app/inbox/page.tsx
// Pending captures with the agent's triage proposal.
// Three actions per capture: Use this / Edit / Dismiss.
"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { formatDuration } from "@/lib/utils";
import type { TriageResult } from "@/lib/agents";

type Capture = {
  id: string;
  raw_text: string;
  created_at: string;
  triage: (TriageResult & { error?: boolean }) | null;
};
type Project = { id: string; name: string };
type Founder = { user_id: string; display_name: string };

const supabase = createBrowserSupabase();

export default function InboxPage() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<TriageResult>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? "";
    const [c, p, f] = await Promise.all([
      supabase
        .from("captures")
        .select("id, raw_text, created_at, triage")
        .eq("state", "pending")
        .eq("captured_by", uid) // your inbox, not the shared firehose
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").eq("status", "active"),
      supabase.from("founders").select("user_id, display_name"),
    ]);
    setCaptures((c.data as Capture[]) ?? []);
    setProjects((p.data as Project[]) ?? []);
    setFounders((f.data as Founder[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // refresh when the capture bar adds something while we're open
    const onChange = () => void load();
    window.addEventListener("qa:captures-changed", onChange);
    return () => window.removeEventListener("qa:captures-changed", onChange);
  }, [load]);

  async function act(
    id: string,
    action: "approve" | "redirect" | "dismiss",
    ov?: Partial<TriageResult>
  ) {
    const res = await fetch(`/api/captures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, overrides: ov }),
    });
    if (!res.ok && action === "approve") {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Couldn't approve — pick a project first.");
      setEditingId(id);
      return;
    }
    setEditingId(null);
    setOverrides({});
    void load();
    window.dispatchEvent(new CustomEvent("qa:captures-changed"));
  }

  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;
  const founderName = (id: string | null) =>
    founders.find((f) => f.user_id === id)?.display_name ?? null;

  if (loading)
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="h-7 w-32 animate-pulse rounded bg-qa-surface-2" />
        <div className="mt-4 h-28 animate-pulse rounded-qa bg-qa-surface" />
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-semibold">Inbox</h1>

      {captures.length === 0 && (
        <p className="mt-6 rounded-qa border border-dashed border-qa-line-strong p-10 text-center text-qa-text-2">
          Nothing waiting. Drop a thought in the bar above.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {captures.map((c) => {
          const t = c.triage;
          const failed = !t || t.error;
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} className="rounded-qa border border-qa-line bg-white p-4">
              <p className="text-[15px]">{c.raw_text}</p>

              {failed ? (
                <p className="mt-2 text-sm text-qa-text-2">
                  The agent couldn&apos;t triage this one. Edit it into a task yourself, or dismiss.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-qa-text-2">
                  <span className="font-medium text-qa-text">{t.title}</span>
                  <span>{projectName(t.project_id) ?? "no project match"}</span>
                  <span>{founderName(t.owner) ?? "—"}</span>
                  <span className="font-mono text-xs">{formatDuration(t.estimate_minutes)}</span>
                  <span>{t.energy}</span>
                  {t.suggested_date && <span className="font-mono text-xs">{t.suggested_date}</span>}
                </div>
              )}

              {!failed && t.confidence === "low" && t.note && (
                <p className="mt-1.5 text-xs text-qa-text-2">{t.note}</p>
              )}

              {isEditing && (
                <div className="mt-3 flex flex-wrap gap-2 rounded-qa-sm bg-qa-surface p-3">
                  <input
                    className="min-w-0 flex-1 rounded-qa-sm border border-qa-line-strong bg-white px-2 py-1.5 text-sm"
                    defaultValue={t?.title ?? c.raw_text}
                    onChange={(e) => setOverrides((o) => ({ ...o, title: e.target.value }))}
                  />
                  <select
                    className="rounded-qa-sm border border-qa-line-strong bg-white px-2 py-1.5 text-sm"
                    defaultValue={t?.project_id ?? ""}
                    onChange={(e) =>
                      setOverrides((o) => ({ ...o, project_id: e.target.value || null }))
                    }
                  >
                    <option value="">project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    className="rounded-qa-sm border border-qa-line-strong bg-white px-2 py-1.5 text-sm"
                    defaultValue={t?.owner ?? ""}
                    onChange={(e) => setOverrides((o) => ({ ...o, owner: e.target.value }))}
                  >
                    {founders.map((f) => (
                      <option key={f.user_id} value={f.user_id}>{f.display_name}</option>
                    ))}
                  </select>
                  <select
                    className="rounded-qa-sm border border-qa-line-strong bg-white px-2 py-1.5 text-sm"
                    defaultValue={t?.estimate_minutes ?? 30}
                    onChange={(e) =>
                      setOverrides((o) => ({ ...o, estimate_minutes: Number(e.target.value) }))
                    }
                  >
                    {[15, 30, 45, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>{formatDuration(m)}</option>
                    ))}
                  </select>
                  <select
                    className="rounded-qa-sm border border-qa-line-strong bg-white px-2 py-1.5 text-sm"
                    defaultValue={t?.energy ?? "shallow"}
                    onChange={(e) =>
                      setOverrides((o) => ({ ...o, energy: e.target.value as "deep" | "shallow" }))
                    }
                  >
                    <option value="deep">deep</option>
                    <option value="shallow">shallow</option>
                  </select>
                  <button
                    onClick={() => act(c.id, "approve", overrides)}
                    className="rounded-qa-sm bg-qa-accent px-3 py-1.5 text-sm font-semibold text-qa-accent-text"
                  >
                    Save as task
                  </button>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                {!failed && !isEditing && (
                  <button
                    onClick={() => act(c.id, "approve")}
                    className="rounded-qa-sm bg-qa-accent px-3 py-1.5 text-sm font-semibold text-qa-accent-text"
                  >
                    Use this
                  </button>
                )}
                {!isEditing && (
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setOverrides({});
                    }}
                    className="rounded-qa-sm border border-qa-line-strong px-3 py-1.5 text-sm hover:bg-qa-surface"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => act(c.id, "dismiss")}
                  className="px-2 py-1.5 text-sm text-qa-text-2 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
