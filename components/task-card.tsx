// components/task-card.tsx
// Reusable task row. Energy dot (filled = deep, outline = shallow),
// title, owner initials, estimate, slip count (grey — never red).
// Click → inline edit. Checkbox left of title toggles done.
"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/utils";

export type TaskRow = {
  id: string;
  title: string;
  owner: string | null;
  status: "inbox" | "planned" | "scheduled" | "done" | "killed";
  energy: "deep" | "shallow";
  category: string;
  estimate_minutes: number | null;
  slip_count: number;
  is_anchor: boolean;
};

type Founder = { user_id: string; display_name: string };

export default function TaskCard({
  task,
  founders,
  onUpdate,
}: {
  task: TaskRow;
  founders: Founder[];
  onUpdate: (id: string, patch: Partial<TaskRow>) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [estimate, setEstimate] = useState(task.estimate_minutes ?? 30);
  const [energy, setEnergy] = useState<"deep" | "shallow">(task.energy);
  const [owner, setOwner] = useState(task.owner ?? "");

  const ownerName =
    founders.find((f) => f.user_id === task.owner)?.display_name ?? "";
  const initials = ownerName.slice(0, 2).toUpperCase();
  const done = task.status === "done";
  const killed = task.status === "killed";

  async function save() {
    setEditing(false);
    await onUpdate(task.id, {
      title,
      estimate_minutes: estimate,
      energy,
      owner: owner || null,
    });
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-qa-line py-2">
        <input
          className="min-w-0 flex-1 rounded-qa-sm border border-qa-line-strong bg-white px-2 py-1.5 text-[15px]"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <select
          className="rounded-qa-sm border border-qa-line-strong bg-white px-2 py-1.5 text-sm"
          value={estimate}
          onChange={(e) => setEstimate(Number(e.target.value))}
        >
          {[15, 30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>{formatDuration(m)}</option>
          ))}
        </select>
        <select
          className="rounded-qa-sm border border-qa-line-strong bg-white px-2 py-1.5 text-sm"
          value={energy}
          onChange={(e) => setEnergy(e.target.value as "deep" | "shallow")}
        >
          <option value="deep">deep</option>
          <option value="shallow">shallow</option>
        </select>
        <select
          className="rounded-qa-sm border border-qa-line-strong bg-white px-2 py-1.5 text-sm"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="">unowned</option>
          {founders.map((f) => (
            <option key={f.user_id} value={f.user_id}>{f.display_name}</option>
          ))}
        </select>
        <button
          onClick={save}
          className="rounded-qa-sm bg-qa-accent px-3 py-1.5 text-sm font-semibold text-qa-accent-text"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="px-2 py-1.5 text-sm text-qa-text-2"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 border-t border-qa-line py-2.5 ${
        done || killed ? "opacity-45" : ""
      }`}
    >
      {/* status toggle */}
      <button
        aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`}
        onClick={() =>
          onUpdate(task.id, { status: done ? "planned" : "done" })
        }
        className={`h-[22px] w-[22px] shrink-0 rounded-qa-sm border-[1.5px] ${
          done
            ? "border-qa-accent bg-qa-accent"
            : "border-qa-line-strong bg-transparent"
        }`}
      />
      {/* energy dot */}
      <span
        title={task.energy}
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          task.energy === "deep"
            ? "bg-qa-accent"
            : "border-[1.5px] border-qa-line-strong"
        }`}
      />
      <button
        onClick={() => setEditing(true)}
        className={`min-w-0 flex-1 truncate text-left text-[15px] ${
          done ? "line-through" : ""
        } ${killed ? "line-through decoration-qa-text-2" : ""}`}
      >
        {task.title}
        {task.is_anchor && (
          <span className="ml-2 text-xs font-semibold text-qa-accent">anchor</span>
        )}
      </button>
      {task.slip_count > 0 && (
        <span className="rounded-full bg-qa-surface-2 px-2 py-0.5 font-mono text-xs text-qa-text-2">
          moved ×{task.slip_count}
        </span>
      )}
      {task.estimate_minutes != null && (
        <span className="font-mono text-xs text-qa-text-2">
          {formatDuration(task.estimate_minutes)}
        </span>
      )}
      {initials && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-qa-surface-2 text-[10px] font-semibold text-qa-text-2">
          {initials}
        </span>
      )}
    </div>
  );
}
