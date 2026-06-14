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
export type AgentContext = { supabase: SupabaseClient; founder: Founder; now: Date };
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
      "Update a task by id. Set status to 'done' to complete, 'killed' to kill it (a decision, not a failure). Can move it (week_assigned/due_date), resize it (estimate_minutes), or make it an anchor.",
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
      for (const k of ["title", "status", "energy", "due_date", "week_assigned"]) if (k in input) patch[k] = input[k];
      if ("estimate_minutes" in input) patch.estimate_minutes = n("estimate_minutes");
      if ("is_anchor" in input) patch.is_anchor = b("is_anchor");
      if (patch.status === "done") patch.completed_at = now.toISOString();
      if (patch.status && patch.status !== "done") patch.completed_at = null;
      const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select("id, title, status").single();
      if (error) return { result: { error: error.message } };
      const verb = data.status === "done" ? "Completed" : data.status === "killed" ? "Killed" : "Updated";
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
    default:
      return { result: { error: `unknown tool ${name}` } };
  }
}

// ============================================================
// CONTEXT SNAPSHOT + SYSTEM PROMPT
// ============================================================
async function loadSnapshot(ctx: AgentContext): Promise<string> {
  const { supabase, founder, now } = ctx;
  const today = todayISO();
  const monday = mondayOf(now);
  const [{ data: blocks }, { data: openTasks }, { data: goals }, { data: projects }, { data: profile }] =
    await Promise.all([
      supabase.from("schedule_blocks").select("start_at, end_at, tasks(title, is_anchor, status)").eq("founder_id", founder.user_id).eq("block_date", today).order("start_at"),
      supabase.from("tasks").select("id, title, status, estimate_minutes, energy, is_anchor, week_assigned").eq("owner", founder.user_id).in("status", ["planned", "scheduled"]).limit(40),
      supabase.from("goals").select("id, outcome, quarter, target_date, status").eq("status", "active"),
      supabase.from("projects").select("id, name, status").eq("status", "active"),
      supabase.from("founder_profiles").select("daily_ceiling_minutes, timezone").eq("user_id", founder.user_id).maybeSingle(),
    ]);

  const todayBlocks = (blocks ?? []).map((blk) => {
    const t = Array.isArray(blk.tasks) ? blk.tasks[0] : blk.tasks;
    return `${fmtTime(blk.start_at)}–${fmtTime(blk.end_at)} ${t?.title ?? "—"}${t?.is_anchor ? " (anchor)" : ""}${t?.status === "done" ? " ✓" : ""}`;
  });
  const tasks = (openTasks ?? []).map((t) => `- [${t.id}] ${t.title} · ${t.estimate_minutes ?? 30}m · ${t.energy}${t.is_anchor ? " · anchor" : ""}${t.status === "scheduled" ? " · scheduled" : ""}`);
  const goalLines = (goals ?? []).map((g) => `- [${g.id}] ${g.outcome} (${g.quarter}, due ${g.target_date})`);
  const projLines = (projects ?? []).map((p) => `- [${p.id}] ${p.name}`);

  return [
    `Today is ${today} (week of ${monday}). Daily ceiling: ${profile?.daily_ceiling_minutes ?? 300} min. Timezone: ${profile?.timezone ?? "America/Toronto"}.`,
    `\nTODAY'S SCHEDULE:\n${todayBlocks.length ? todayBlocks.join("\n") : "(nothing scheduled yet)"}`,
    `\nOPEN TASKS (id in brackets):\n${tasks.length ? tasks.join("\n") : "(none)"}`,
    `\nACTIVE GOALS:\n${goalLines.length ? goalLines.join("\n") : "(none)"}`,
    `\nACTIVE PROJECTS:\n${projLines.length ? projLines.join("\n") : "(none — a General project will be created on first task)"}`,
  ].join("\n");
}

function systemPrompt(ctx: AgentContext, snapshot: string): string {
  return `You are the operating partner for Q Software — a two-founder startup run by Sid and Aaryan. You are talking with ${ctx.founder.display_name}. You are not a chatbot or a cheerleader; you are the sharp third person in the room who keeps the plan honest and the calendar realistic, and who actually does the work when asked.

You have tools. USE THEM to take real action — don't describe what you would do, do it. When ${ctx.founder.display_name} asks you to plan the day or week, actually call plan_day / plan_week. When they mention something to do, create the task. When they name a meeting, call, or appointment at a specific time ("dentist Friday 2pm", "investor call tomorrow at 10"), call add_calendar_event so it lands on their real Google Calendar. When they want to know where time is going, call get_insights. Prefer acting over asking; ask at most one short clarifying question, and only when you genuinely can't proceed.

VOICE:
- Warm but crisp. Lead with the point. Short paragraphs, plain language. No corporate filler, no AI-speak ("I'd be happy to", "Great question").
- Address ${ctx.founder.display_name} by name occasionally, naturally — not every line.
- Never expose tool names, ids, JSON, or internal mechanics. Speak like a brilliant chief of staff.
- After you act, confirm what you did in one or two human sentences, then offer the obvious next step.

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
  ctx: AgentContext
): Promise<{ text: string; actions: AgentAction[] }> {
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
