// lib/utils.ts — small shared helpers
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}

/** YYYY-MM-DD for the Monday of the given date's week. */
export function mondayOf(date: Date): string {
  const x = new Date(date);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return toISODate(x);
}

/** YYYY-MM-DD for next Monday (strictly after today's Monday). */
export function nextMondayOf(date: Date): string {
  const x = new Date(mondayOf(date) + "T00:00:00");
  x.setDate(x.getDate() + 7);
  return toISODate(x);
}

/** "9:00 AM" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "45 min" / "1h 30m" / "2h" */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Current date as YYYY-MM-DD (local time). */
export function todayISO(): string {
  return toISODate(new Date());
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Whole weeks between today and a target date (floor, min 0). */
export function weeksUntil(targetDate: string): number {
  const ms = new Date(targetDate + "T00:00:00").getTime() - Date.now();
  return Math.max(0, Math.floor(ms / (7 * 24 * 3600 * 1000)));
}
