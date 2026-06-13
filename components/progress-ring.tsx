// components/progress-ring.tsx
// A calm circular progress indicator. Used on Today as the day's
// completion signal.
//
// Why a ring: the goal-gradient effect (Hull; Kivetz et al. 2006) —
// motivation to finish rises as the visible gap to completion shrinks.
// A ring makes "how close am I" legible at a glance. It never shames an
// empty day: 0% is just a quiet outline, no red, no number-down framing.
type Props = {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  /** centre label, e.g. "3/5" */
  children?: React.ReactNode;
  /** override colour (defaults to accent; success when full) */
  tone?: "accent" | "success";
};

export default function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  children,
  tone,
}: Props) {
  const clamped = Math.max(0, Math.min(1, isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  const color =
    (tone ?? (clamped >= 1 ? "success" : "accent")) === "success"
      ? "var(--qa-success)"
      : "var(--qa-accent)";

  return (
    <div
      style={{ width: size, height: size }}
      className="relative shrink-0"
      role="img"
      aria-label={`${Math.round(clamped * 100)} percent of today complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--qa-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 500ms var(--qa-ease), stroke 300ms var(--qa-ease)" }}
        />
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
