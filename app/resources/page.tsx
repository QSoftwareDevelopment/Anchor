// app/resources/page.tsx
// ============================================================
// RESOURCES — the shared links & docs hub. One place for contracts,
// dashboards, brand assets, and references. Links only (never secrets).
// ============================================================
"use client";

import { useEffect, useMemo, useState } from "react";

type Category = "link" | "contract" | "dashboard" | "brand" | "doc";
type Resource = {
  id: string;
  title: string;
  url: string | null;
  category: Category;
  notes: string | null;
  created_at: string;
};

const CATEGORIES: Category[] = ["link", "contract", "dashboard", "brand", "doc"];
const ICON: Record<Category, string> = { link: "🔗", contract: "📄", dashboard: "📊", brand: "🎨", doc: "📝" };

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category | "all">("all");

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Category>("link");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/resources").then((r) => r.json()).catch(() => null);
    if (res) setResources(res.resources ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), url: url.trim() || null, category }),
      });
      const data = await res.json();
      if (res.ok) setResources((r) => [data.resource, ...r]);
      setTitle("");
      setUrl("");
      setCategory("link");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setResources((rs) => rs.filter((r) => r.id !== id));
    await fetch(`/api/resources/${id}`, { method: "DELETE" });
  }

  const shown = useMemo(
    () => (filter === "all" ? resources : resources.filter((r) => r.category === filter)),
    [resources, filter]
  );

  function hostOf(u: string | null) {
    if (!u) return null;
    try {
      return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace("www.", "");
    } catch {
      return u;
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <p className="qa-eyebrow">Partnership admin</p>
      <h1 className="mt-0.5 text-2xl font-[650]">Resources</h1>
      <p className="mt-1 text-sm text-qa-text-2">Shared links & docs. Never store passwords or secrets here.</p>

      <form onSubmit={add} className="qa-card-grad mt-5 flex flex-wrap items-end gap-2 p-4">
        <input placeholder="Title" className="qa-input flex-1 min-w-[120px]" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="https://…" className="qa-input flex-[2] min-w-[160px]" value={url} onChange={(e) => setUrl(e.target.value)} />
        <select className="qa-input w-auto" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button disabled={busy} className="qa-btn qa-btn-primary">{busy ? "…" : "Save"}</button>
      </form>

      <div className="mt-5 flex flex-wrap gap-1.5">
        <button onClick={() => setFilter("all")} className={`qa-chip ${filter === "all" ? "qa-chip-on" : ""}`}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={`qa-chip ${filter === c ? "qa-chip-on" : ""}`}>
            {ICON[c]} {c}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {loading ? (
          <div className="h-20 animate-pulse rounded-qa bg-qa-surface sm:col-span-2" />
        ) : shown.length === 0 ? (
          <p className="text-sm text-qa-text-3 sm:col-span-2">Nothing saved here yet.</p>
        ) : (
          shown.map((r) => (
            <div key={r.id} className="group qa-card-link flex items-start gap-3 p-4">
              <span className="text-xl" aria-hidden>{ICON[r.category]}</span>
              <div className="min-w-0 flex-1">
                {r.url ? (
                  <a href={r.url.startsWith("http") ? r.url : `https://${r.url}`} target="_blank" rel="noopener noreferrer" className="font-[600] hover:text-qa-accent">
                    {r.title}
                  </a>
                ) : (
                  <p className="font-[600]">{r.title}</p>
                )}
                {r.url && <p className="truncate text-xs text-qa-text-3">{hostOf(r.url)}</p>}
              </div>
              <button onClick={() => remove(r.id)} aria-label="Delete" className="shrink-0 text-qa-text-3 opacity-0 transition-opacity hover:text-qa-warn group-hover:opacity-100">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
