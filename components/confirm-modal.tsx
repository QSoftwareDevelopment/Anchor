// components/confirm-modal.tsx
// Weekly plan confirmation. The agent proposed; this is where the
// founders commit. Summary of what's about to be committed, then
// "Edit more" or "Confirm this week".
"use client";

export default function ConfirmModal({
  open,
  oneMetric,
  taskCountByFounder,
  anchorSid,
  anchorAaryan,
  confirming,
  onClose,
  onConfirm,
}: {
  open: boolean;
  oneMetric: string;
  taskCountByFounder: { name: string; count: number }[];
  anchorSid: string;
  anchorAaryan: string;
  confirming: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm this week's plan"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-qa border border-qa-line bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Commit next week</h2>
        <p className="mt-2 text-sm text-qa-text-2">This week&apos;s one metric:</p>
        <p className="mt-1 font-medium">{oneMetric}</p>

        <div className="mt-4 space-y-1 border-t border-qa-line pt-4 text-sm">
          {taskCountByFounder.map((f) => (
            <p key={f.name}>
              <span className="font-medium">{f.name}</span> —{" "}
              <span className="font-mono">{f.count}</span> task{f.count === 1 ? "" : "s"}
            </p>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-qa-line pt-4 text-sm">
          <p><span className="font-medium">Sid&apos;s anchor:</span> {anchorSid || "—"}</p>
          <p><span className="font-medium">Aaryan&apos;s anchor:</span> {anchorAaryan || "—"}</p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-qa-sm border border-qa-line-strong px-4 py-2 text-sm font-medium hover:bg-qa-surface"
          >
            Edit more
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="rounded-qa-sm bg-qa-accent px-4 py-2 text-sm font-semibold text-qa-accent-text disabled:opacity-50"
          >
            {confirming ? "Committing…" : "Confirm this week"}
          </button>
        </div>
      </div>
    </div>
  );
}
