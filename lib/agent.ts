// lib/agent.ts
// ============================================================
// THE OPERATING PARTNER — an agentic Claude that actually runs the
// company's plan. It has tools to create/triage tasks, plan the day
// and week (via the real scheduler), set anchors, and read insights.
//
// Server-side ONLY. The tool loop runs against Supabase as the signed-in
// founder, so RLS still scopes everything to the two of them.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCalendarEvent } from "@/lib/gcal";
import { scheduleDaysFor } from "@/lib/schedule-run";
import { mondayOf, todayISO } from "@/lib/utils";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
const MAX_STEPS = 8; // tool-loop ceiling

export type Founder = { user_id: string; display_name: string };
export type AgentContext = { supabase: SupabaseClient; founder: Founder; now: Date; founders: Founder[] };
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type AgentAction = { kind: string; label: string; detail?: string };

type ToolUse = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type TextBlock = { type: "text"; text: string };
type ToolResult = { type: "tool_result"; tool_use_id: string; content: string };
type ContentBlock = TextBlock | ToolUse | ToolResult;
type ApiMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

// ---------- low-level call ----------
async function callMessages(body: Record<string, unknown>): Promise<{
  content: ContentBlock[];
  stop_reason: string;
}> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, ...body }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { content: data.content ?? [], stop_reason: data.stop_reason ?? "end_turn" };
}

// ============================================================
// TOOLS
// ============================================================
const TOOLS = [
  {
    name: "create_task",
    description:
      "Create a task. If no project_id is given it goes to the founder's General project. Defaults: owner = the current founder, status = planned, energy = shallow.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        project_id: { type: "string" },
        owner: { type: "string", description: "founder user_id" },
        estimate_minutes: { type: "number", enum: [15, 30, 45, 60, 90, 120] },
        energy: { type: "string", enum: ["deep", "shallow"] },
        category: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        week_assigned: { type: "string", description: "Monday of the week, YYYY-MM-DD" },
        is_anchor: { type: "boolean" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_tasks",
    description: "List tasks, optionally filtered. Use to see what's open before planning.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["planned", "scheduled", "done", "killed"] },
        week_assigned: { type: "string" },
        project_id: { type: "string" },
        mine_only: { type: "boolean", description: "only the current founder's tasks" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "update_task",
    description:
      "Update a task by id. Set status to 'done' to complete, 'killed' to kill it (a decision, not a failure). Can move it (week_assigned/due_date), resize it (estimate_minutes), make it an anchor, or HAND IT OFF to the other founder by setting owner to their user_id (the founders list is in the snapshot).",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        status: { type: "string", enum: ["planned", "scheduled", "done", "killed"] },
        estimate_minutes: { type: "number" },
        energy: { type: "string", enum: ["deep", "shallow"] },
        due_date: { type: "string" },
        week_assigned: { type: "string" },
        is_anchor: { type: "boolean" },
        owner: { type: "string", description: "founder user_id — reassign/hand off the task to that founder" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "list_projects",
    description: "List projects with their ids, status and goal link.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_project",
    description: "Create a project, optionally tied to a goal.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        goal_id: { type: "string" },
        owner: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_goals",
    description: "List the company's goals (quarterly outcomes).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_goal",
    description: "Create a quarterly goal/outcome.",
    input_schema: {
      type: "object",
      properties: {
        quarter: { type: "string", description: "e.g. 2026-Q3" },
        outcome: { type: "string" },
        target_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["quarter", "outcome", "target_date"],
    },
  },
  {
    name: "set_anchor",
    description:
      "Set the current founder's anchor commitment for the week — one specific, verifiable promise. Defaults to this week.",
    input_schema: {
      type: "object",
      properties: {
        commitment: { type: "string" },
        week_start: { type: "string", description: "Monday, YYYY-MM-DD" },
      },
      required: ["commitment"],
    },
  },
  {
    name: "plan_day",
    description:
      "Lay out the founder's open work into real time blocks for one day, respecting their energy windows and daily ceiling. Writes the schedule (and Google Calendar if connected). Returns what was placed and what didn't fit.",
    input_schema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD, default today" } },
    },
  },
  {
    name: "plan_week",
    description:
      "Plan Monday–Friday of a week for the founder — the scheduler places open tasks into their energy windows under the daily ceiling. Returns a per-day summary.",
    input_schema: {
      type: "object",
      properties: { week_start: { type: "string", description: "Monday, YYYY-MM-DD, default this week" } },
    },
  },
  {
    name: "get_schedule",
    description: "Get the founder's scheduled blocks for a date.",
    input_schema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD, default today" } },
    },
  },
  {
    name: "get_insights",
    description:
      "Where time is going: this week's minutes by category, share on goal-linked work, deep vs shallow, tasks shipped, and the learned estimate multipliers.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_calendar_event",
    description:
      "Add a real event to the founder's calendar — a meeting, call, or appointment (NOT a task to be auto-scheduled). Syncs to Google Calendar if connected. Use this when the founder says things like 'add a meeting with X at 3pm' or 'put dentist on my calendar Friday'. Provide start (and end if known) as ISO 8601 with timezone offset, or set all_day with a date.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: { type: "string", description: "ISO 8601 datetime, e.g. 2026-06-15T15:00:00-04:00. For all-day, a YYYY-MM-DD date." },
        end: { type: "string", description: "ISO 8601 datetime; defaults to +1h for timed events." },
        all_day: { type: "boolean" },
        location: { type: "string" },
        notes: { type: "string" },
      },
      required: ["title", "start"],
    },
  },
  {
    name: "list_events",
    description: "List the founder's calendar events (meetings/appointments) in a date range. Defaults to the next 7 days.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO datetime or YYYY-MM-DD, start of range" },
        to: { type: "string", description: "ISO datetime or YYYY-MM-DD, end of range" },
      },
    },
  },
  {
    name: "get_partner_status",
    description:
      "Get the OTHER founder's current state — their #1 today, today's scheduled blocks, this week's anchor, what they've shipped, and how many open tasks they carry. Use when asked 'what is <partner> working on / up to' or before handing work to them.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_finance_entry",
    description:
      "Record money: an 'income' or 'expense', or a 'balance' snapshot (current cash on hand). Set recurring=true for things that repeat monthly (powers MRR and burn). Use for 'log a $120 hosting expense', 'we got a $500 client', 'cash on hand is 9000'.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["income", "expense", "balance"] },
        amount: { type: "number" },
        description: { type: "string" },
        category: { type: "string" },
        recurring: { type: "boolean", description: "true if it repeats monthly" },
      },
      required: ["kind", "amount"],
    },
  },
  {
    name: "get_money_summary",
    description: "The partnership's money snapshot: this month's income/expense/net, MRR, monthly burn, cash on hand, and runway in months.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_contact",
    description: "Add a client or lead to the CRM. Stage is one of lead/active/client/dormant/lost.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        company: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        stage: { type: "string", enum: ["lead", "active", "client", "dormant", "lost"] },
        next_step: { type: "string" },
        next_step_date: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_contacts",
    description: "List CRM contacts, optionally filtered by stage.",
    input_schema: {
      type: "object",
      properties: { stage: { type: "string", enum: ["lead", "active", "client", "dormant", "lost"] } },
    },
  },
  {
    name: "update_contact",
    description: "Update a contact by id — move their stage, set the next step, log a touch.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        stage: { type: "string", enum: ["lead", "active", "client", "dormant", "lost"] },
        next_step: { type: "string" },
        next_step_date: { type: "string" },
        last_touch: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "add_resource",
    description: "Save a shared link/doc to the resources hub (contracts, dashboards, brand assets). Links only — never passwords or secrets.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        url: { type: "string" },
        category: { type: "string", enum: ["link", "contract", "dashboard", "brand", "doc"] },
        notes: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_resources",
    description: "List the shared resources/links hub.",
    input_schema: { type: "object", properties: {} },
  },
];

// ============================================================
// TOOL DISPATCH
// ============================================================
async function ensureProjectId(ctx: AgentContext, given?: string): Promise<string> {
  if (given) return given;
  const { data: existing } = await ctx.supabase
    .from("projects")
    .select("id")
    .eq("name", "General")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: made, error } = await ctx.supabase
    .from("projects")
    .insert({ name: "General", owner: ctx.founder.user_id, status: "active" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return made.id as string;
}

// Thin wrapper over the shared scheduler runner (lib/schedule-run.ts),
// which both the agent and the REST planning endpoints use.
function scheduleDays(ctx: AgentContext, days: Date[]) {
  return scheduleDaysFor(ctx.supabase, ctx.founder.user_id, days, ctx.now);
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });

async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentContext
): Promise<{ result: unknown; action?: AgentAction }> {
  const { supabase, founder, now } = ctx;
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  const n = (k: string) => (typeof input[k] === "number" ? (input[k] as number) : undefined);
  const b = (k: string) => (typeof input[k] === "boolean" ? (input[k] as boolean) : undefined);

  switch (name) {
    case "create_task": {
      const project_id = await ensureProjectId(ctx, s("project_id"));
      const row = {
        title: s("title") ?? "Untitled",
        project_id,
        owner: s("owner") ?? founder.user_id,
        status: "planned" as const,
        energy: (s("energy") as "deep" | "shallow") ?? "shallow",
        category: s("category") ?? "general",
        estimate_minutes: n("estimate_minutes") ?? 30,
        due_date: s("due_date") ?? null,
        week_assigned: s("week_assigned") ?? null,
        is_anchor: b("is_anchor") ?? false,
        created_by: founder.user_id,
      };
      const { data, error } = await supabase.from("tasks").insert(row).select("id, title").single();
      if (error) return { result: { error: error.message } };
      return { result: data, action: { kind: "task", label: "Added task", detail: data.title } };
    }
    case "list_tasks": {
      let q = supabase
        .from("tasks")
        .select("id, title, status, energy, estimate_minutes, due_date, week_assigned, is_anchor, project_id, slip_count, owner");
      if (s("status")) q = q.eq("status", s("status")!);
      if (s("week_assigned")) q = q.eq("week_assigned", s("week_assigned")!);
      if (s("project_id")) q = q.eq("project_id", s("project_id")!);
      if (b("mine_only")) q = q.eq("owner", founder.user_id);
      const { data, error } = await q.limit(n("limit") ?? 50);
      return { result: error ? { error: error.message } : data };
    }
    case "update_task": {
      const id = s("task_id");
      if (!id) return { result: { error: "task_id required" } };
      const patch: Record<string, unknown> = {};
      for (const k of ["title", "status", "energy", "due_date", "week_assigned", "owner"]) if (k in input) patch[k] = input[k];
      if ("estimate_minutes" in input) patch.estimate_minutes = n("estimate_minutes");
      if ("is_anchor" in input) patch.is_anchor = b("is_anchor");
      if (patch.status === "done") patch.completed_at = now.toISOString();
      if (patch.status && patch.status !== "done") patch.completed_at = null;
      const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select("id, title, status").single();
      if (error) return { result: { error: error.message } };
      let verb = data.status === "done" ? "Completed" : data.status === "killed" ? "Killed" : "Updated";
      if ("owner" in patch) {
        const to = ctx.founders.find((f) => f.user_id === patch.owner)?.display_name;
        verb = to ? `Handed to ${to}` : "Reassigned";
      }
      return { result: data, action: { kind: "task", label: `${verb} task`, detail: data.title } };
    }
    case "list_projects": {
      const { data, error } = await supabase.from("projects").select("id, name, status, goal_id");
      return { result: error ? { error: error.message } : data };
    }
    case "create_project": {
      const { data, error } = await supabase
        .from("projects")
        .insert({ name: s("name") ?? "Untitled", goal_id: s("goal_id") ?? null, owner: s("owner") ?? founder.user_id, status: "active" })
        .select("id, name")
        .single();
      if (error) return { result: { error: error.message } };
      return { result: data, action: { kind: "project", label: "Created project", detail: data.name } };
    }
    case "list_goals": {
      const { data, error } = await supabase.from("goals").select("id, quarter, outcome, target_date, status");
      return { result: error ? { error: error.message } : data };
    }
    case "create_goal": {
      const { data, error } = await supabase
        .from("goals")
        .insert({ quarter: s("quarter"), outcome: s("outcome"), target_date: s("target_date"), created_by: founder.user_id })
        .select("id, outcome")
        .single();
      if (error) return { result: { error: error.message } };
      return { result: data, action: { kind: "goal", label: "Set goal", detail: data.outcome } };
    }
    case "set_anchor": {
      const week_start = s("week_start") ?? mondayOf(now);
      const commitment = s("commitment") ?? "";
      const { error } = await supabase
        .from("anchor_commitments")
        .upsert({ week_start, founder_id: founder.user_id, commitment }, { onConflict: "week_start,founder_id" });
      if (error) return { result: { error: error.message } };
      return { result: { ok: true, week_start, commitment }, action: { kind: "anchor", label: "Set your anchor", detail: commitment } };
    }
    case "plan_day": {
      const dateStr = s("date") ?? todayISO();
      const day = new Date(dateStr + "T00:00:00");
      try {
        const r = await scheduleDays(ctx, [day]);
        return {
          result: r,
          action: { kind: "schedule", label: "Planned the day", detail: `${r.placed} block${r.placed === 1 ? "" : "s"}${r.unplaced.length ? ` · ${r.unplaced.length} didn't fit` : ""}` },
        };
      } catch (e) {
        return { result: { error: e instanceof Error ? e.message : "couldn't plan" } };
      }
    }
    case "plan_week": {
      const monday = s("week_start") ?? mondayOf(now);
      const days: Date[] = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday + "T00:00:00");
        d.setDate(d.getDate() + i);
        days.push(d);
      }
      try {
        const r = await scheduleDays(ctx, days);
        return {
          result: r,
          action: { kind: "schedule", label: "Planned the week", detail: `${r.placed} blocks${r.unplaced.length ? ` · ${r.unplaced.length} didn't fit` : ""}` },
        };
      } catch (e) {
        return { result: { error: e instanceof Error ? e.message : "couldn't plan" } };
      }
    }
    case "get_schedule": {
      const dateStr = s("date") ?? todayISO();
      const { data } = await supabase
        .from("schedule_blocks")
        .select("start_at, end_at, tasks(title, is_anchor, status)")
        .eq("founder_id", founder.user_id)
        .eq("block_date", dateStr)
        .order("start_at");
      const blocks = (data ?? []).map((blk) => {
        const t = Array.isArray(blk.tasks) ? blk.tasks[0] : blk.tasks;
        return { time: `${fmtTime(blk.start_at)}–${fmtTime(blk.end_at)}`, title: t?.title ?? "—", is_anchor: t?.is_anchor ?? false, done: t?.status === "done" };
      });
      return { result: { date: dateStr, blocks } };
    }
    case "get_insights": {
      const monday = mondayOf(now);
      const { data: done } = await supabase
        .from("tasks")
        .select("category, energy, estimate_minutes, actual_minutes, projects(goal_id)")
        .eq("status", "done")
        .gte("completed_at", `${monday}T00:00:00`);
      const { data: prof } = await supabase
        .from("founder_profiles")
        .select("multipliers")
        .eq("user_id", founder.user_id)
        .maybeSingle();
      const rows = done ?? [];
      const min = (t: { actual_minutes: number | null; estimate_minutes: number | null }) => t.actual_minutes ?? t.estimate_minutes ?? 0;
      const byCat: Record<string, number> = {};
      let goalMin = 0, otherMin = 0, deepMin = 0, shallowMin = 0;
      for (const t of rows) {
        const m = min(t);
        byCat[t.category] = (byCat[t.category] ?? 0) + m;
        const p = Array.isArray(t.projects) ? t.projects[0] : t.projects;
        if (p?.goal_id) goalMin += m; else otherMin += m;
        if (t.energy === "deep") deepMin += m; else shallowMin += m;
      }
      return {
        result: {
          week_start: monday,
          shipped: rows.length,
          minutes_by_category: byCat,
          on_goal_minutes: goalMin,
          off_goal_minutes: otherMin,
          deep_minutes: deepMin,
          shallow_minutes: shallowMin,
          learned_multipliers: prof?.multipliers ?? {},
        },
      };
    }
    case "add_calendar_event": {
      const title = s("title");
      const startStr = s("start");
      if (!title || !startStr) return { result: { error: "title and start required" } };
      const allDay = b("all_day") ?? false;
      const start = new Date(allDay && startStr.length === 10 ? startStr + "T00:00:00" : startStr);
      if (isNaN(start.getTime())) return { result: { error: "couldn't parse start time" } };
      const endStr = s("end");
      const end = endStr
        ? new Date(endStr)
        : new Date(start.getTime() + (allDay ? 24 : 1) * 3_600_000);

      const { data: inserted, error } = await supabase
        .from("calendar_events")
        .insert({
          founder_id: founder.user_id,
          title,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          all_day: allDay,
          location: s("location") ?? null,
          notes: s("notes") ?? null,
        })
        .select("id, title, start_at, end_at, all_day")
        .single();
      if (error) return { result: { error: error.message } };

      let synced = false;
      const { data: tokenRow } = await supabase
        .from("gcal_tokens")
        .select("refresh_token, calendar_id")
        .eq("user_id", founder.user_id)
        .maybeSingle();
      if (tokenRow) {
        const { data: profile } = await supabase
          .from("founder_profiles")
          .select("timezone")
          .eq("user_id", founder.user_id)
          .maybeSingle();
        try {
          const gcalId = await createCalendarEvent(
            tokenRow,
            { title, start, end, allDay, location: s("location"), description: s("notes") },
            profile?.timezone ?? "America/Toronto"
          );
          await supabase.from("calendar_events").update({ gcal_event_id: gcalId }).eq("id", inserted.id);
          synced = true;
        } catch {
          /* saved locally even if push fails */
        }
      }

      const when = allDay
        ? start.toLocaleDateString("en-CA", { month: "short", day: "numeric" })
        : `${fmtTime(start.toISOString())}, ${start.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`;
      return {
        result: { ...inserted, synced },
        action: {
          kind: "event",
          label: synced ? "Added to calendar" : "Saved event",
          detail: `${title} · ${when}`,
        },
      };
    }
    case "list_events": {
      let q = supabase
        .from("calendar_events")
        .select("id, title, start_at, end_at, all_day, location")
        .order("start_at");
      const from = s("from");
      const to = s("to");
      q = q.gte("start_at", from ?? now.toISOString());
      if (to) q = q.lte("start_at", to);
      else {
        const week = new Date(now.getTime() + 7 * 86_400_000);
        q = q.lte("start_at", week.toISOString());
      }
      const { data, error } = await q.limit(50);
      return { result: error ? { error: error.message } : data };
    }
    case "get_partner_status": {
      const partner = ctx.founders.find((f) => f.user_id !== founder.user_id);
      if (!partner) return { result: { error: "no partner in this workspace" } };
      const monday = mondayOf(now);
      const [{ data: blocks }, { data: anchor }, { count: shipped }, { count: open }] = await Promise.all([
        supabase.from("schedule_blocks").select("start_at, tasks(title, is_anchor, status)").eq("founder_id", partner.user_id).eq("block_date", todayISO()).order("start_at"),
        supabase.from("anchor_commitments").select("commitment").eq("founder_id", partner.user_id).eq("week_start", monday).maybeSingle(),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("owner", partner.user_id).eq("status", "done").gte("completed_at", `${monday}T00:00:00`),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("owner", partner.user_id).in("status", ["planned", "scheduled"]),
      ]);
      const today = (blocks ?? []).map((blk) => {
        const t = Array.isArray(blk.tasks) ? blk.tasks[0] : blk.tasks;
        return `${fmtTime(blk.start_at)} ${t?.title ?? "—"}${t?.is_anchor ? " (anchor)" : ""}${t?.status === "done" ? " ✓" : ""}`;
      });
      return {
        result: {
          partner: partner.display_name,
          partner_id: partner.user_id,
          anchor_this_week: anchor?.commitment ?? null,
          shipped_this_week: shipped ?? 0,
          open_tasks: open ?? 0,
          today_schedule: today,
        },
      };
    }
    case "add_finance_entry": {
      const kind = s("kind");
      const amount = n("amount");
      if (!kind || amount == null) return { result: { error: "kind and amount required" } };
      const { data, error } = await supabase
        .from("finance_entries")
        .insert({
          kind,
          amount: Math.abs(amount),
          category: s("category") ?? "general",
          description: s("description") ?? null,
          recurring: b("recurring") ?? false,
          created_by: founder.user_id,
        })
        .select("id, kind, amount, description")
        .single();
      if (error) return { result: { error: error.message } };
      const sign = kind === "expense" ? "-" : kind === "income" ? "+" : "";
      return {
        result: data,
        action: { kind: "money", label: kind === "balance" ? "Logged balance" : `Logged ${kind}`, detail: `${sign}$${Math.abs(amount)}${s("description") ? ` · ${s("description")}` : ""}` },
      };
    }
    case "get_money_summary": {
      const { data } = await supabase.from("finance_entries").select("kind, amount, recurring, occurred_on");
      const rows = (data ?? []) as { kind: string; amount: number; recurring: boolean; occurred_on: string }[];
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      let incomeMonth = 0, expenseMonth = 0, mrr = 0, burn = 0, latestBalance: number | null = null, latestDate = "";
      for (const e of rows) {
        const amt = Number(e.amount);
        if (e.kind === "income") { if (e.occurred_on >= monthStart) incomeMonth += amt; if (e.recurring) mrr += amt; }
        else if (e.kind === "expense") { if (e.occurred_on >= monthStart) expenseMonth += amt; if (e.recurring) burn += amt; }
        else if (e.kind === "balance" && e.occurred_on >= latestDate) { latestBalance = amt; latestDate = e.occurred_on; }
      }
      return {
        result: {
          income_this_month: incomeMonth,
          expense_this_month: expenseMonth,
          net_this_month: incomeMonth - expenseMonth,
          mrr,
          monthly_burn: burn,
          cash_on_hand: latestBalance,
          runway_months: latestBalance != null && burn > 0 ? Math.round((latestBalance / burn) * 10) / 10 : null,
        },
      };
    }
    case "add_contact": {
      const name = s("name");
      if (!name) return { result: { error: "name required" } };
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          name,
          company: s("company") ?? null,
          email: s("email") ?? null,
          phone: s("phone") ?? null,
          stage: s("stage") ?? "lead",
          next_step: s("next_step") ?? null,
          next_step_date: s("next_step_date") ?? null,
          notes: s("notes") ?? null,
          owner: founder.user_id,
          created_by: founder.user_id,
        })
        .select("id, name, stage")
        .single();
      if (error) return { result: { error: error.message } };
      return { result: data, action: { kind: "contact", label: "Added contact", detail: `${data.name} · ${data.stage}` } };
    }
    case "list_contacts": {
      let q = supabase.from("contacts").select("id, name, company, stage, next_step, next_step_date");
      if (s("stage")) q = q.eq("stage", s("stage")!);
      const { data, error } = await q.limit(100);
      return { result: error ? { error: error.message } : data };
    }
    case "update_contact": {
      const id = s("contact_id");
      if (!id) return { result: { error: "contact_id required" } };
      const patch: Record<string, unknown> = {};
      for (const k of ["stage", "next_step", "next_step_date", "last_touch", "notes"]) if (k in input) patch[k] = input[k];
      const { data, error } = await supabase.from("contacts").update(patch).eq("id", id).select("id, name, stage").single();
      if (error) return { result: { error: error.message } };
      return { result: data, action: { kind: "contact", label: "Updated contact", detail: `${data.name} · ${data.stage}` } };
    }
    case "add_resource": {
      const title = s("title");
      if (!title) return { result: { error: "title required" } };
      const { data, error } = await supabase
        .from("resources")
        .insert({ title, url: s("url") ?? null, category: s("category") ?? "link", notes: s("notes") ?? null, created_by: founder.user_id })
        .select("id, title, category")
        .single();
      if (error) return { result: { error: error.message } };
      return { result: data, action: { kind: "resource", label: "Saved resource", detail: data.title } };
    }
    case "list_resources": {
      const { data, error } = await supabase.from("resources").select("id, title, url, category").order("created_at", { ascending: false }).limit(100);
      return { result: error ? { error: error.message } : data };
    }
    default:
      return { result: { error: `unknown tool ${name}` } };
  }
}

// ============================================================
// CONTEXT SNAPSHOT + SYSTEM PROMPT
// ============================================================
async function loadSnapshot(ctx: AgentContext): Promise<string> {
  const { supabase, founder, now, founders } = ctx;
  const today = todayISO();
  const monday = mondayOf(now);
  const partner = founders.find((f) => f.user_id !== founder.user_id) ?? null;

  const [{ data: blocks }, { data: openTasks }, { data: goals }, { data: projects }, { data: profile }, { data: partnerBlocks }, { data: anchors }, { count: partnerOpen }] =
    await Promise.all([
      supabase.from("schedule_blocks").select("start_at, end_at, tasks(title, is_anchor, status)").eq("founder_id", founder.user_id).eq("block_date", today).order("start_at"),
      supabase.from("tasks").select("id, title, status, estimate_minutes, energy, is_anchor, week_assigned").eq("owner", founder.user_id).in("status", ["planned", "scheduled"]).limit(40),
      supabase.from("goals").select("id, outcome, quarter, target_date, status").eq("status", "active"),
      supabase.from("projects").select("id, name, status").eq("status", "active"),
      supabase.from("founder_profiles").select("daily_ceiling_minutes, timezone").eq("user_id", founder.user_id).maybeSingle(),
      partner
        ? supabase.from("schedule_blocks").select("start_at, tasks(title, is_anchor, status)").eq("founder_id", partner.user_id).eq("block_date", today).order("start_at")
        : Promise.resolve({ data: [] }),
      supabase.from("anchor_commitments").select("founder_id, commitment").eq("week_start", monday),
      partner
        ? supabase.from("tasks").select("id", { count: "exact", head: true }).eq("owner", partner.user_id).in("status", ["planned", "scheduled"])
        : Promise.resolve({ count: 0 }),
    ]);

  const todayBlocks = (blocks ?? []).map((blk) => {
    const t = Array.isArray(blk.tasks) ? blk.tasks[0] : blk.tasks;
    return `${fmtTime(blk.start_at)}–${fmtTime(blk.end_at)} ${t?.title ?? "—"}${t?.is_anchor ? " (anchor)" : ""}${t?.status === "done" ? " ✓" : ""}`;
  });
  const tasks = (openTasks ?? []).map((t) => `- [${t.id}] ${t.title} · ${t.estimate_minutes ?? 30}m · ${t.energy}${t.is_anchor ? " · anchor" : ""}${t.status === "scheduled" ? " · scheduled" : ""}`);
  const goalLines = (goals ?? []).map((g) => `- [${g.id}] ${g.outcome} (${g.quarter}, due ${g.target_date})`);
  const projLines = (projects ?? []).map((p) => `- [${p.id}] ${p.name}`);

  // Partner block — so the agent knows what the other founder is doing and can hand off / reference.
  let partnerSection = "";
  if (partner) {
    const pBlocks = ((partnerBlocks as { start_at: string; tasks: unknown }[]) ?? []).map((blk) => {
      const t = Array.isArray(blk.tasks) ? blk.tasks[0] : blk.tasks;
      const tt = t as { title?: string; is_anchor?: boolean; status?: string } | null;
      return `${fmtTime(blk.start_at)} ${tt?.title ?? "—"}${tt?.is_anchor ? " (anchor)" : ""}${tt?.status === "done" ? " ✓" : ""}`;
    });
    const pAnchor = (anchors ?? []).find((a) => a.founder_id === partner.user_id)?.commitment;
    partnerSection =
      `\nPARTNER — ${partner.display_name} (user_id ${partner.user_id}):\n` +
      `Anchor this week: ${pAnchor ?? "(none set)"}\n` +
      `Open tasks: ${partnerOpen ?? 0}\n` +
      `Their day today:\n${pBlocks.length ? pBlocks.join("\n") : "(nothing scheduled)"}`;
  }

  const roster = founders.map((f) => `- ${f.display_name}: ${f.user_id}${f.user_id === founder.user_id ? " (you)" : ""}`).join("\n");

  return [
    `Today is ${today} (week of ${monday}). Daily ceiling: ${profile?.daily_ceiling_minutes ?? 300} min. Timezone: ${profile?.timezone ?? "America/Toronto"}.`,
    `\nFOUNDERS (use these ids to hand off work):\n${roster}`,
    `\nTODAY'S SCHEDULE (yours):\n${todayBlocks.length ? todayBlocks.join("\n") : "(nothing scheduled yet)"}`,
    `\nYOUR OPEN TASKS (id in brackets):\n${tasks.length ? tasks.join("\n") : "(none)"}`,
    partnerSection,
    `\nACTIVE GOALS:\n${goalLines.length ? goalLines.join("\n") : "(none)"}`,
    `\nACTIVE PROJECTS:\n${projLines.length ? projLines.join("\n") : "(none — a General project will be created on first task)"}`,
  ].join("\n");
}

function systemPrompt(ctx: AgentContext, snapshot: string): string {
  const partner = ctx.founders.find((f) => f.user_id !== ctx.founder.user_id);
  return `You are Anchor — the executive assistant and chief of staff for Q Software, a two-founder startup run by Sid and Aaryan. You are talking with ${ctx.founder.display_name}${partner ? `; their partner is ${partner.display_name}` : ""}. Think of yourself as their Jarvis: always briefed, proactive, discreet, and genuinely capable. You are not a chatbot or a cheerleader — you run the operation alongside them and actually do the work when asked.

You are the control center for the whole partnership: the plan and calendar, what each founder is doing, the money, the clients, and the shared resources. USE YOUR TOOLS to take real action — don't describe what you'd do, do it:
- Planning: plan_day / plan_week (real scheduler, never past the daily ceiling); create_task when they mention something to do.
- Calendar: add_calendar_event for any meeting/call/appointment at a time ("investor call tomorrow at 10") so it lands on their real Google Calendar.
- The partnership: get_partner_status to see what ${partner ? partner.display_name : "the other founder"} is doing; hand work off with update_task's owner field when they say "give this to ${partner ? partner.display_name : "them"}".
- Admin: add_finance_entry / get_money_summary for money ("log a $120 hosting expense", "cash on hand is 9000"); add_contact / update_contact / list_contacts for clients & leads; add_resource / list_resources for shared links and docs.
- Reflection: get_insights for where time is going.
Prefer acting over asking; ask at most one short clarifying question, and only when you genuinely can't proceed.

VOICE:
- Warm, sharp, and a little anticipatory — like a great chief of staff who already pulled the file. Lead with the point. Short paragraphs, plain language. No corporate filler, no AI-speak ("I'd be happy to", "Great question").
- Open by name when it's natural ("Hey ${ctx.founder.display_name}…") but don't overuse it.
- Your replies may be read aloud, so write clean spoken sentences — no markdown tables, no raw ids, no JSON.
- Never expose tool names or internal mechanics. After you act, confirm what you did in one or two human sentences, then offer the obvious next step.

PRINCIPLES (hard rules):
- Progress first. Open with what moved before what slipped.
- No guilt, ever. Slipped work gets neutral triage — reschedule, shrink, hand to the other founder, or kill. Killing is a legitimate decision, not a failure.
- Realism over ambition. Never plan past the daily ceiling; the scheduler enforces this and will return work that didn't fit — surface that honestly rather than pretending.
- One challenge per week, earned by the data, never nagging.

Here is the live state of the company right now:
${snapshot}

Use the ids above when updating or planning. If a project is needed and none fits, a General project is fine. Keep replies concise — this is a conversation, not a report.`;
}

// ============================================================
// THE TURN
// ============================================================
export async function runAgent(
  history: ChatMessage[],
  base: Omit<AgentContext, "founders">
): Promise<{ text: string; actions: AgentAction[] }> {
  // Load the founder roster once so the agent can name + hand off between partners.
  const { data: foundersData } = await base.supabase.from("founders").select("user_id, display_name");
  const ctx: AgentContext = { ...base, founders: (foundersData as Founder[]) ?? [] };
  const snapshot = await loadSnapshot(ctx);
  const system = systemPrompt(ctx, snapshot);
  const messages: ApiMessage[] = history.map((m) => ({ role: m.role, content: m.content }));
  const actions: AgentAction[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await callMessages({ system, tools: TOOLS, messages });
    if (res.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: res.content });
      const toolResults: ToolResult[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const { result, action } = await dispatchTool(block.name, block.input, ctx);
        if (action) actions.push(action);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result).slice(0, 6000) });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }
    const text = res.content.filter((b): b is TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    return { text: text || "Done.", actions };
  }
  return { text: "I took several steps but stopped to avoid looping. Tell me how you'd like to continue.", actions };
}
