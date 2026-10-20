import { useMemo, useState } from "react";
import type { RhythmCell } from "../../lib/analytics";
import { fmtDuration, fmtHour } from "../../lib/time";
import { ChartTooltip, useSize, type TipData } from "./common";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const STEPS = 5;
const LEFT = 40;
const BOTTOM = 24;
const GAP = 4;

/** The hours anyone was active in, padded to at least `min` columns. */
function hourWindow(grid: RhythmCell[][], min = 12): [number, number] {
  let a = 24;
  let b = -1;
  for (const row of grid)
    for (const c of row)
      if (c.activeMs > 0) {
        a = Math.min(a, c.hour);
        b = Math.max(b, c.hour);
      }
  if (b < 0) return [7, 7 + min];
  let lo = a;
  let hi = b + 1;
  while (hi - lo < min) {
    if (lo > 0) lo--;
    if (hi - lo < min && hi < 24) hi++;
  }
  return [lo, hi];
}

/** Weekday × hour rhythm on one blue ramp (light → deep = more productive time). */
export function Heatmap({ grid, caption }: { grid: RhythmCell[][]; caption: string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [tip, setTip] = useState<TipData | null>(null);
  const [h0, h1] = useMemo(() => hourWindow(grid), [grid]);
  const cols = h1 - h0;
  const max = Math.max(1, ...grid.flat().map((c) => c.productiveMs));
  const cell = Math.max(10, Math.min(34, (width - LEFT) / cols));
  const size = cell - GAP;
  const height = 7 * cell + BOTTOM;
  const level = (v: number) => (v <= 0 ? 0 : Math.min(STEPS, 1 + Math.floor((v / max) * (STEPS - 0.001))));
  const labelEvery = cell < 22 ? 3 : 2;

  return (
    <div ref={ref} className="chart heatmap">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={caption} onMouseLeave={() => setTip(null)}>
          {grid.map((row, d) => (
            <g key={d}>
              <text x={LEFT - 12} y={d * cell + size / 2} dy="0.32em" textAnchor="end" className="chart-axis">
                {DAYS[d]}
              </text>
              {row.slice(h0, h1).map((c) => {
                const cx = LEFT + (c.hour - h0) * cell;
                const cy = d * cell;
                return (
                  <rect
                    key={c.hour}
                    x={cx}
                    y={cy}
                    width={size}
                    height={size}
                    rx={Math.min(8, size * 0.3)}
                    className={`heat heat-${level(c.productiveMs)}`}
                    onMouseEnter={() =>
                      setTip({
                        x: cx + size / 2,
                        y: cy - 8,
                        title: `${DAY_NAMES[d]} · ${fmtHour(c.hour)}`,
                        rows: [
                          { label: "productive, on average", value: fmtDuration(c.productiveMs), color: "var(--productive)" },
                          { label: "distracting, on average", value: fmtDuration(c.distractingMs), color: "var(--distracting)" },
                        ],
                      })
                    }
                  />
                );
              })}
            </g>
          ))}
          {Array.from({ length: cols }, (_, i) => h0 + i)
            .filter((h) => (h - h0) % labelEvery === 0)
            .map((h) => (
              <text key={h} x={LEFT + (h - h0) * cell + size / 2} y={height - 5} textAnchor="middle" className="chart-axis">
                {fmtHour(h)}
              </text>
            ))}
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
      <div className="heat-legend" aria-hidden>
        <span>Less</span>
        {Array.from({ length: STEPS + 1 }, (_, i) => (
          <span key={i} className={`heat-swatch heat-${i}`} />
        ))}
        <span>More</span>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {grid.map((row, d) => (
            <tr key={d}>
              <th>{DAY_NAMES[d]}</th>
              {row.map((c) => (
                <td key={c.hour}>{`${fmtHour(c.hour)}: ${fmtDuration(c.productiveMs)}`}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
