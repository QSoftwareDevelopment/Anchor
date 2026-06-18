// app/api/finances/route.ts
// GET  — recent entries + a computed money summary (month net, MRR, burn, runway).
// POST — add an income / expense / balance entry.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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

function summarize(entries: Entry[]) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  let incomeMonth = 0,
    expenseMonth = 0,
    mrr = 0,
    burn = 0;
  let latestBalance: number | null = null;
  let latestBalanceDate = "";

  for (const e of entries) {
    if (e.kind === "income") {
      if (e.occurred_on >= monthStart) incomeMonth += Number(e.amount);
      if (e.recurring) mrr += Number(e.amount);
    } else if (e.kind === "expense") {
      if (e.occurred_on >= monthStart) expenseMonth += Number(e.amount);
      if (e.recurring) burn += Number(e.amount);
    } else if (e.kind === "balance") {
      if (e.occurred_on >= latestBalanceDate) {
        latestBalance = Number(e.amount);
        latestBalanceDate = e.occurred_on;
      }
    }
  }

  return {
    income_month: incomeMonth,
    expense_month: expenseMonth,
    net_month: incomeMonth - expenseMonth,
    mrr,
    monthly_burn: burn,
    cash_on_hand: latestBalance,
    runway_months: latestBalance != null && burn > 0 ? latestBalance / burn : null,
  };
}

export async function GET() {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("finance_entries")
    .select("id, kind, amount, currency, category, description, recurring, occurred_on")
    .order("occurred_on", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = (data as Entry[]) ?? [];
  return NextResponse.json({ entries, summary: summarize(entries) });
}

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Partial<Entry>;
  if (!body.kind || body.amount == null || isNaN(Number(body.amount))) {
    return NextResponse.json({ error: "kind and amount are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("finance_entries")
    .insert({
      kind: body.kind,
      amount: Math.abs(Number(body.amount)),
      currency: body.currency ?? "CAD",
      category: body.category ?? "general",
      description: body.description ?? null,
      recurring: body.recurring ?? false,
      occurred_on: body.occurred_on ?? new Date().toISOString().slice(0, 10),
      created_by: founder.user_id,
    })
    .select("id, kind, amount, currency, category, description, recurring, occurred_on")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}
