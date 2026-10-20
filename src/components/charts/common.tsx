import { useLayoutEffect, useRef, useState } from "react";
import { HOUR, MINUTE } from "../../lib/time";

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export interface TipRow {
  label: string;
  value: string;
  color?: string;
}

export interface TipData {
  x: number;
  y: number;
  title: string;
  rows: TipRow[];
  note?: string;
}

/** Values lead, labels follow; series are keyed with a short line in their colour. */
export function ChartTooltip({ tip, width }: { tip: TipData | null; width: number }) {
  if (!tip) return null;
  const half = 96;
  const left = Math.min(Math.max(tip.x, half), Math.max(half, width - half));
  return (
    <div className="chart-tip" style={{ left, top: tip.y }} role="presentation">
      <div className="chart-tip-title">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="chart-tip-row">
          {r.color && <span className="chart-tip-key" style={{ background: r.color }} />}
          <strong>{r.value}</strong>
          <span>{r.label}</span>
        </div>
      ))}
      {tip.note && <div className="chart-tip-note">{tip.note}</div>}
    </div>
  );
}

/** Rect with only the top corners rounded (data end), square at the baseline. */
export function topRounded(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Clean duration ticks for a time axis (`count` = gridlines above the baseline, at most). */
export function durationTicks(max: number, count = 4): number[] {
  const steps = [5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720].map((m) => m * MINUTE);
  const step = steps.find((s) => max / s <= count) ?? Math.ceil(max / count / HOUR) * HOUR;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1; v += step) ticks.push(v);
  return ticks;
}

/** Legend row for ≥ 2 series: a swatch beside ink-coloured text. */
export function Legend({ items, className }: { items: { name: string; color: string; value?: string }[]; className?: string }) {
  return (
    <div className={className ? `legend ${className}` : "legend"}>
      {items.map((i) => (
        <span key={i.name} className="legend-item">
          <span className="swatch" style={{ background: i.color }} />
          {i.name}
          {i.value && <strong className="legend-value">{i.value}</strong>}
        </span>
      ))}
    </div>
  );
}

export const SERIES = {
  productive: { name: "Productive", color: "var(--productive)" },
  neutral: { name: "Neutral", color: "var(--neutral)" },
  distracting: { name: "Distracting", color: "var(--distracting)" },
} as const;

/** Focus sessions in charts: ink, so they never read as another productivity series. */
export const FOCUS_COLOR = "var(--focus-mark)";
