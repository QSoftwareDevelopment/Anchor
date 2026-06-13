// lib/scheduler.ts
// ============================================================
// THE SCHEDULER — Phase 2 core
// Pure function: takes tasks + busy times + founder profile,
// returns proposed schedule blocks. No I/O in here, which makes
// it trivially testable. The cron route (api/cron/nightly) does
// the fetching and persisting around it.
//
// Hard rules encoded (from the personality doc):
//  1. Never exceed the founder's daily ceiling.
//  2. Apply the founder's category multiplier to every estimate.
//  3. The One Metric / anchor tasks are placed FIRST, in deep slots.
//  4. Deep tasks only go in high-energy windows; shallow fills gaps.
//  5. If work doesn't fit, it is RETURNED as unplaced — never crammed.
// ============================================================

export type EnergyWindow = { days: string[]; start: string; end: string }; // "09:00"

export type FounderProfile = {
  userId: string;
  energyWindows: EnergyWindow[];
  dailyCeilingMinutes: number;
  multipliers: Record<string, number>; // {"product": 2.1, "_default": 1.5}
  timezone: string;
  // Scheduling horizon within a day (waking/working bounds)
  dayStart?: string; // default "08:30"
  dayEnd?: string;   // default "22:00"
};

export type SchedulableTask = {
  id: string;
  title: string;
  energy: "deep" | "shallow";
  category: string;
  estimateMinutes: number;
  dueDate?: string;      // "2026-06-15"
  isAnchor: boolean;     // anchor commitment or One Metric task
  slipCount: number;
};

export type BusyInterval = { start: Date; end: Date }; // from GCal freebusy + existing blocks

export type ProposedBlock = {
  taskId: string;
  title: string;
  start: Date;
  end: Date;
};

export type ScheduleResult = {
  blocks: ProposedBlock[];
  unplaced: { task: SchedulableTask; reason: string }[]; // surfaced to the founder, never hidden
  minutesPlannedByDay: Record<string, number>;
};

const GRANULARITY_MIN = 15;   // snap blocks to 15-minute boundaries
const BUFFER_MIN = 10;        // breathing room between blocks
const MAX_BLOCK_MIN = 120;    // split anything longer into <=2h chunks

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ---------- small time helpers ----------
function hm(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}
function addMin(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}
function dayKey(d: Date): string {
  return DAY_KEYS[d.getDay()];
}
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function snapUp(d: Date): Date {
  const ms = GRANULARITY_MIN * 60_000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

// ---------- free-slot computation ----------
type Slot = { start: Date; end: Date; deep: boolean };

function freeSlotsForDay(
  day: Date,
  profile: FounderProfile,
  busy: BusyInterval[],
  now: Date
): Slot[] {
  const dayStart = hm(day, profile.dayStart ?? "08:30");
  const dayEnd = hm(day, profile.dayEnd ?? "22:00");
  // never schedule into the past
  const horizon = now > dayStart ? snapUp(addMin(now, 5)) : dayStart;
  if (horizon >= dayEnd) return [];

  // merge & sort the day's busy intervals
  const dayBusy = busy
    .filter((b) => b.end > horizon && b.start < dayEnd)
    .map((b) => ({
      start: b.start < horizon ? horizon : b.start,
      end: b.end > dayEnd ? dayEnd : b.end,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: BusyInterval[] = [];
  for (const b of dayBusy) {
    const last = merged[merged.length - 1];
    if (last && b.start <= addMin(last.end, BUFFER_MIN)) {
      if (b.end > last.end) last.end = b.end;
    } else merged.push({ ...b });
  }

  // gaps between busy intervals = raw free slots
  const raw: { start: Date; end: Date }[] = [];
  let cursor = horizon;
  for (const b of merged) {
    if (b.start > cursor) raw.push({ start: cursor, end: b.start });
    cursor = b.end > cursor ? addMin(b.end, BUFFER_MIN) : cursor;
  }
  if (cursor < dayEnd) raw.push({ start: cursor, end: dayEnd });

  // classify each slot (split on energy-window boundaries)
  const windows = profile.energyWindows.filter((w) =>
    w.days.includes(dayKey(day))
  );
  const slots: Slot[] = [];
  for (const r of raw) {
    if (r.end.getTime() - r.start.getTime() < GRANULARITY_MIN * 60_000) continue;
    // boundaries: slot edges + window edges that fall inside it
    const edges = new Set<number>([r.start.getTime(), r.end.getTime()]);
    for (const w of windows) {
      const ws = hm(day, w.start).getTime();
      const we = hm(day, w.end).getTime();
      if (ws > r.start.getTime() && ws < r.end.getTime()) edges.add(ws);
      if (we > r.start.getTime() && we < r.end.getTime()) edges.add(we);
    }
    const sorted = [...edges].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const s = new Date(sorted[i]);
      const e = new Date(sorted[i + 1]);
      if (e.getTime() - s.getTime() < GRANULARITY_MIN * 60_000) continue;
      const mid = new Date((s.getTime() + e.getTime()) / 2);
      const deep = windows.some(
        (w) => mid >= hm(day, w.start) && mid < hm(day, w.end)
      );
      slots.push({ start: snapUp(s), end: e, deep });
    }
  }
  return slots;
}

// ---------- task ordering ----------
// Anchors first, then most-slipped (they've waited longest),
// then nearest due date, then deep before shallow (deep capacity
// is the scarce resource — spend it before it's fragmented).
function orderTasks(tasks: SchedulableTask[]): SchedulableTask[] {
  return [...tasks].sort((a, b) => {
    if (a.isAnchor !== b.isAnchor) return a.isAnchor ? -1 : 1;
    if (a.slipCount !== b.slipCount) return b.slipCount - a.slipCount;
    const ad = a.dueDate ?? "9999-12-31";
    const bd = b.dueDate ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    if (a.energy !== b.energy) return a.energy === "deep" ? -1 : 1;
    return 0;
  });
}

// ---------- main ----------
export function buildSchedule(opts: {
  profile: FounderProfile;
  tasks: SchedulableTask[];
  busy: BusyInterval[];
  days: Date[]; // the days to plan (e.g. tomorrow only for nightly; Mon–Fri for weekly)
  now?: Date;
}): ScheduleResult {
  const now = opts.now ?? new Date();
  const blocks: ProposedBlock[] = [];
  const unplaced: ScheduleResult["unplaced"] = [];
  const minutesByDay: Record<string, number> = {};

  // free slots per day, mutated as we place blocks
  const slotsByDay = new Map<string, Slot[]>();
  for (const day of opts.days) {
    slotsByDay.set(dateKey(day), freeSlotsForDay(day, opts.profile, opts.busy, now));
    minutesByDay[dateKey(day)] = 0;
  }

  const mult = (cat: string) =>
    opts.profile.multipliers[cat] ?? opts.profile.multipliers["_default"] ?? 1.5;

  for (const task of orderTasks(opts.tasks)) {
    // Rule 2: realistic duration, snapped to granularity
    let remaining =
      Math.ceil((task.estimateMinutes * mult(task.category)) / GRANULARITY_MIN) *
      GRANULARITY_MIN;
    const chunks: number[] = [];
    while (remaining > 0) {
      chunks.push(Math.min(remaining, MAX_BLOCK_MIN));
      remaining -= Math.min(remaining, MAX_BLOCK_MIN);
    }

    let placedAll = true;
    for (const chunk of chunks) {
      let placed = false;
      for (const day of opts.days) {
        const dk = dateKey(day);
        // Rule 1: ceiling is sacred
        if (minutesByDay[dk] + chunk > opts.profile.dailyCeilingMinutes) continue;
        // due date: don't place past it
        if (task.dueDate && dk > task.dueDate) continue;

        const slots = slotsByDay.get(dk)!;
        // Rule 4: deep tasks need deep slots; shallow prefers shallow
        // slots (to preserve deep capacity) but may use deep ones.
        const tryOrders: boolean[][] =
          task.energy === "deep" ? [[true]] : [[false], [true]];
        for (const pass of tryOrders) {
          const idx = slots.findIndex(
            (s) =>
              pass.includes(s.deep) &&
              s.end.getTime() - s.start.getTime() >= chunk * 60_000
          );
          if (idx === -1) continue;
          const slot = slots[idx];
          const start = slot.start;
          const end = addMin(start, chunk);
          blocks.push({ taskId: task.id, title: task.title, start, end });
          minutesByDay[dk] += chunk;
          // shrink the slot (consume from the front + buffer)
          const newStart = snapUp(addMin(end, BUFFER_MIN));
          if (slot.end.getTime() - newStart.getTime() >= GRANULARITY_MIN * 60_000) {
            slots[idx] = { ...slot, start: newStart };
          } else {
            slots.splice(idx, 1);
          }
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) {
        placedAll = false;
        break;
      }
    }

    if (!placedAll) {
      // Rule 5: honesty over cramming. Remove any chunks we placed
      // for this task and report it whole.
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].taskId === task.id) blocks.splice(i, 1);
      }
      unplaced.push({
        task,
        reason:
          task.energy === "deep"
            ? "No deep-work slot big enough (or daily ceiling reached). Trade something out or shrink it."
            : "No room under the daily ceiling. Trade something out, shrink it, or move it.",
      });
    }
  }

  return { blocks, unplaced, minutesPlannedByDay: minutesByDay };
}
