import { useId, type ReactNode } from "react";
import type { Phase, TimerStatus } from "../../lib/types";

const PHASE_COLORS: Record<Phase, [string, string]> = {
  focus: ["var(--phase-focus)", "var(--phase-focus-hi)"],
  short_break: ["var(--phase-short)", "var(--phase-short-hi)"],
  long_break: ["var(--phase-long)", "var(--phase-long-hi)"],
};

/** The countdown ring. `progress` is the elapsed fraction (0 → 1). */
export function TimerRing({
  progress,
  phase,
  status,
  size = 340,
  children,
}: {
  progress: number;
  phase: Phase;
  status: TimerStatus;
  size?: number;
  children: ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const stroke = Math.max(8, Math.round(size * 0.032));
  const r = size / 2 - stroke - 6;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  // The ring empties as time runs out: what remains is drawn.
  const remaining = 1 - p;
  const angle = -Math.PI / 2 + remaining * 2 * Math.PI;
  const kx = size / 2 + r * Math.cos(angle);
  const ky = size / 2 + r * Math.sin(angle);
  const [a, b] = PHASE_COLORS[phase];
  const ticks = 60;

  return (
    <div className={`ring ring-${phase} ring-${status}`} style={{ width: size, height: size }}>
      <div className="ring-glow" />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={b} />
            <stop offset="1" stopColor={a} />
          </linearGradient>
        </defs>
        {Array.from({ length: ticks }, (_, i) => {
          const t = (i / ticks) * 2 * Math.PI - Math.PI / 2;
          const r1 = r - stroke - 8;
          const r2 = r1 - (i % 5 === 0 ? 7 : 3.5);
          return (
            <line
              key={i}
              x1={size / 2 + r1 * Math.cos(t)}
              y1={size / 2 + r1 * Math.sin(t)}
              x2={size / 2 + r2 * Math.cos(t)}
              y2={size / 2 + r2 * Math.sin(t)}
              className={i % 5 === 0 ? "ring-tick major" : "ring-tick"}
            />
          );
        })}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="ring-track" strokeWidth={stroke} />
        {remaining > 0.0005 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#g${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * remaining} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="ring-progress"
          />
        )}
        {remaining > 0.0005 && (
          <>
            <circle cx={kx} cy={ky} r={stroke * 0.95} className="ring-knob-halo" style={{ fill: a }} />
            <circle cx={kx} cy={ky} r={stroke * 0.42} className="ring-knob" />
          </>
        )}
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
