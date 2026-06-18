// app/contacts/page.tsx
// ============================================================
// CONTACTS — clients & leads. Track stage, the next step, and who
// owns the relationship. Filter by stage; advance a contact inline.
// ============================================================
"use client";

import { useEffect, useMemo, useState } from "react";

type Stage = "lead" | "active" | "client" | "dormant" | "lost";
type Contact = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: Stage;
  next_step: string | null;
  next_step_date: string | null;
  notes: string | null;
};

const STAGES: Stage[] = ["lead", "active", "client", "dormant", "lost"];
const STAGE_TONE: Record<Stage, string> = {
  lead: "text-qa-accent border-qa-accent/40",
  active: "text-qa-accent-2 border-qa-accent-2/40",
  client: "text-qa-success border-qa-success/40",
  dormant: "text-qa-text-2 border-qa-line-strong",
  lost: "text-qa-warn border-qa-warn/40",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Stage | "all">("all");

  // add form
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [stage, setStage] = useState<Stage>("lead");
  const [nextStep, setNextStep] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/contacts").then((r) => r.json()).catch(() => null);
    if (res) setContacts(res.contacts ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), company: company.trim() || null, stage, next_step: nextStep.trim() || null }),
      });
      const data = await res.json();
      if (res.ok) setContacts((c) => [data.contact, ...c]);
      setName("");
      setCompany("");
      setNextStep("");
      setStage("lead");
    } finally {
      setBusy(false);
    }
  }

  async function setContactStage(id: string, newStage: Stage) {
    setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, stage: newStage } : c)));
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage, last_touch: new Date().toISOString().slice(0, 10) }),
    });
  }

  async function remove(id: string) {
    setContacts((cs) => cs.filter((c) => c.id !== id));
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
  }

  const shown = useMemo(
    () => (filter === "all" ? contacts : contacts.filter((c) => c.stage === filter)),
    [contacts, filter]
  );
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of contacts) m[c.stage] = (m[c.stage] ?? 0) + 1;
    return m;
  }, [contacts]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <p className="qa-eyebrow">Partnership admin</p>
      <h1 className="mt-0.5 text-2xl font-[650]">Contacts</h1>

      {/* add */}
      <form onSubmit={add} className="qa-card-grad mt-5 flex flex-wrap items-end gap-2 p-4">
        <input placeholder="Name" className="qa-input flex-1 min-w-[120px]" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Company" className="qa-input flex-1 min-w-[120px]" value={company} onChange={(e) => setCompany(e.target.value)} />
        <select className="qa-input w-auto" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input placeholder="Next step" className="qa-input flex-[2] min-w-[140px]" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
        <button disabled={busy} className="qa-btn qa-btn-primary">{busy ? "…" : "Add"}</button>
      </form>

      {/* filters */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        <button onClick={() => setFilter("all")} className={`qa-chip ${filter === "all" ? "qa-chip-on" : ""}`}>
          All {contacts.length > 0 && <span className="text-qa-text-3">· {contacts.length}</span>}
        </button>
        {STAGES.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`qa-chip ${filter === s ? "qa-chip-on" : ""}`}>
            {s} {counts[s] ? <span className="text-qa-text-3">· {counts[s]}</span> : null}
          </button>
        ))}
      </div>

      {/* list */}
      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="h-24 animate-pulse rounded-qa bg-qa-surface" />
        ) : shown.length === 0 ? (
          <p className="text-sm text-qa-text-3">No contacts here yet.</p>
        ) : (
          shown.map((c) => (
            <div key={c.id} className="group qa-card rounded-qa p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-[600]">{c.name}</p>
                  {c.company && <p className="text-sm text-qa-text-2">{c.company}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={c.stage}
                    onChange={(e) => setContactStage(c.id, e.target.value as Stage)}
                    className={`rounded-full border bg-qa-glass px-2 py-0.5 text-xs font-medium ${STAGE_TONE[c.stage]}`}
                  >
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => remove(c.id)} aria-label="Delete" className="text-qa-text-3 opacity-0 transition-opacity hover:text-qa-warn group-hover:opacity-100">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
              </div>
              {c.next_step && (
                <p className="mt-2 text-sm text-qa-text-2">
                  <span className="text-qa-text-3">Next:</span> {c.next_step}
                  {c.next_step_date && <span className="ml-1 font-mono text-xs">· {c.next_step_date}</span>}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
