// app/money/page.tsx
// ============================================================
// MONEY — the partnership's lightweight ledger. Log income, expenses,
// and cash-balance snapshots; see MRR, monthly burn, runway, and this
// month's net at a glance. Manual entry (no bank integration).
// ============================================================
"use client";

import { useEffect, useState } from "react";

type Entry = {
  id: string;
  kind: "income" | "expense" | "balance";
  amount: number;
  currency: string;
  category: string;
  description: string | null;
  recurring: boolean;
  occurred_on: string;
};
type Summary = {
  income_month: number;
  expense_month: number;
  net_month: number;
  mrr: number;
  monthly_burn: number;
  cash_on_hand: number | null;
  runway_months: number | null;
};

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

export default function MoneyPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // add form
  const [kind, setKind] = useState<"income" | "expense" | "balance">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/finances").then((r) => r.json()).catch(() => null);
    if (res) {
      setEntries(res.entries ?? []);
      setSummary(res.summary ?? null);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || isNaN(amt)) return;
    setBusy(true);
    try {
      await fetch("/api/finances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, amount: amt, description: description.trim() || null, recurring: kind === "balance" ? false : recurring }),
      });
      setAmount("");
      setDescription("");
      setRecurring(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setEntries((es) => es.filter((e) => e.id !== id));
    await fetch(`/api/finances/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <p className="qa-eyebrow">Partnership admin</p>
      <h1 className="mt-0.5 text-2xl font-[650]">Money</h1>

      {/* summary tiles */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="MRR" value={money(summary?.mrr)} tone="accent" />
        <Tile label="Monthly burn" value={money(summary?.monthly_burn)} tone="warn" />
        <Tile label="Runway" value={summary?.runway_months != null ? `${summary.runway_months.toFixed(1)} mo` : "—"} tone="accent" />
        <Tile label="Net this month" value={money(summary?.net_month)} tone={(summary?.net_month ?? 0) >= 0 ? "success" : "warn"} />
      </div>
      {summary?.cash_on_hand != null && (
        <p className="mt-2 text-sm text-qa-text-2">
          Cash on hand: <span className="font-mono text-qa-text">{money(summary.cash_on_hand)}</span>
        </p>
      )}

      {/* add */}
      <form onSubmit={add} className="qa-card-grad mt-6 flex flex-wrap items-end gap-2 p-4">
        <div className="flex gap-1.5">
          {(["income", "expense", "balance"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`qa-chip ${kind === k ? "qa-chip-on" : ""}`}>
              {k}
            </button>
          ))}
        </div>
        <div className="flex-1">
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="Amount"
            className="qa-input font-mono"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <input
          placeholder={kind === "balance" ? "Note (optional)" : "What for?"}
          className="qa-input flex-[2] min-w-[140px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {kind !== "balance" && (
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-qa-text-2">
            <input type="checkbox" className="accent-[var(--qa-accent)]" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            monthly
          </label>
        )}
        <button disabled={busy} className="qa-btn qa-btn-primary">
          {busy ? "…" : "Add"}
        </button>
      </form>

      {/* ledger */}
      <div className="mt-6">
        <p className="qa-eyebrow mb-2">Ledger</p>
        {loading ? (
          <div className="h-24 animate-pulse rounded-qa bg-qa-surface" />
        ) : entries.length === 0 ? (
          <p className="text-sm text-qa-text-3">No entries yet. Log income, an expense, or your current cash balance above.</p>
        ) : (
          <div className="divide-y divide-qa-line">
            {entries.map((e) => {
              const sign = e.kind === "income" ? "+" : e.kind === "expense" ? "−" : "=";
              const tone = e.kind === "income" ? "text-qa-success" : e.kind === "expense" ? "text-qa-warn" : "text-qa-accent";
              return (
                <div key={e.id} className="group flex items-center gap-3 py-2.5">
                  <span className={`w-24 shrink-0 font-mono text-sm font-semibold ${tone}`}>
                    {sign}{money(Number(e.amount)).replace("CA", "")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {e.description || <span className="text-qa-text-3">{e.kind}</span>}
                    {e.recurring && <span className="ml-1.5 rounded-full bg-qa-glass-2 px-1.5 py-0.5 text-[10px] text-qa-text-2">monthly</span>}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-qa-text-3">{e.occurred_on}</span>
                  <button onClick={() => remove(e.id)} aria-label="Delete" className="shrink-0 text-qa-text-3 opacity-0 transition-opacity hover:text-qa-warn group-hover:opacity-100">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: "accent" | "warn" | "success" }) {
  const color = tone === "warn" ? "text-qa-warn" : tone === "success" ? "text-qa-success" : "text-qa-accent";
  return (
    <div className="qa-card rounded-qa p-3">
      <p className="text-[11px] uppercase tracking-wide text-qa-text-3">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
