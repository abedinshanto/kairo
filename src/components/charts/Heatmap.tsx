import { useMemo, useState, type KeyboardEvent } from "react";
import type { RhythmCell } from "../../lib/analytics";
import { fmtDuration, fmtHour } from "../../lib/time";
import { ChartTooltip, useSize, type TipData } from "./common";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const STEPS = 5;
const LEFT = 40;
const BOTTOM = 24;
const GAP = 4;
/** Hours per column: two-hour windows keep the grid calm (8 columns, not 16). */
const SPAN = 2;

/** The hours anyone was active in, padded to at least `min` hours and snapped to SPAN. */
function hourWindow(grid: RhythmCell[][], min = 12): [number, number] {
  let a = 24;
  let b = -1;
  for (const row of grid)
    for (const c of row)
      if (c.activeMs > 0) {
        a = Math.min(a, c.hour);
        b = Math.max(b, c.hour);
      }
  if (b < 0) return [8, 8 + min];
  let lo = a;
  let hi = b + 1;
  while (hi - lo < min) {
    if (lo > 0) lo--;
    if (hi - lo < min && hi < 24) hi++;
  }
  lo -= lo % SPAN;
  hi = Math.min(24, hi + ((SPAN - (hi % SPAN)) % SPAN));
  return [lo, hi];
}

interface Bucket {
  from: number;
  productiveMs: number;
  distractingMs: number;
}

/** Weekday × time-of-day rhythm on one blue ramp (light → deep = more productive time). */
export function Heatmap({ grid, caption }: { grid: RhythmCell[][]; caption: string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [active, setActive] = useState<{ d: number; c: number } | null>(null);
  const [h0, h1] = useMemo(() => hourWindow(grid), [grid]);
  const cols = Math.max(1, Math.ceil((h1 - h0) / SPAN));
  const buckets: Bucket[][] = useMemo(
    () =>
      grid.map((row) =>
        Array.from({ length: cols }, (_, i) => {
          const from = h0 + i * SPAN;
          const cells = row.slice(from, from + SPAN);
          return {
            from,
            productiveMs: cells.reduce((a, c) => a + c.productiveMs, 0),
            distractingMs: cells.reduce((a, c) => a + c.distractingMs, 0),
          };
        }),
      ),
    [grid, h0, cols],
  );
  const max = Math.max(1, ...buckets.flat().map((b) => b.productiveMs));
  const colW = Math.max(14, (width - LEFT) / cols);
  const rowH = Math.round(Math.min(34, Math.max(26, colW * 0.75)));
  const cellW = colW - GAP;
  const cellH = rowH - GAP;
  const height = 7 * rowH + BOTTOM;
  const level = (v: number) => (v <= 0 ? 0 : Math.min(STEPS, 1 + Math.floor((v / max) * (STEPS - 0.001))));
  const labelEvery = colW < 40 ? 2 : 1;
  const windowLabel = (from: number) => `${fmtHour(from % 24)}–${fmtHour((from + SPAN) % 24)}`;

  const tip: TipData | null = active
    ? (() => {
        const b = buckets[active.d][active.c];
        return {
          x: LEFT + active.c * colW + cellW / 2,
          y: active.d * rowH - 8,
          title: `${DAY_NAMES[active.d]}, ${windowLabel(b.from)}`,
          rows: [
            { label: "productive", value: fmtDuration(b.productiveMs), color: "var(--productive)" },
            { label: "distracting", value: fmtDuration(b.distractingMs), color: "var(--distracting)" },
          ],
          note: "On average",
        };
      })()
    : null;

  const onKey = (e: KeyboardEvent) => {
    const at = active ?? { d: 0, c: -1 };
    if (e.key === "ArrowRight") setActive({ d: at.d, c: Math.min(cols - 1, at.c + 1) });
    else if (e.key === "ArrowLeft") setActive({ d: at.d, c: Math.max(0, at.c < 0 ? cols - 1 : at.c - 1) });
    else if (e.key === "ArrowDown") setActive({ d: Math.min(6, active ? at.d + 1 : 0), c: Math.max(0, at.c) });
    else if (e.key === "ArrowUp") setActive({ d: Math.max(0, active ? at.d - 1 : 6), c: Math.max(0, at.c) });
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={ref} className="chart heatmap">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${caption}. Use the arrow keys to read each cell.`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onMouseLeave={() => setActive(null)}
        >
          {buckets.map((row, d) => (
            <g key={d}>
              <text x={LEFT - 12} y={d * rowH + cellH / 2} dy="0.32em" textAnchor="end" className="chart-axis">
                {DAYS[d]}
              </text>
              {row.map((b, c) => (
                <rect
                  key={b.from}
                  x={LEFT + c * colW}
                  y={d * rowH}
                  width={cellW}
                  height={cellH}
                  rx={Math.min(9, cellH * 0.32)}
                  className={`heat heat-${level(b.productiveMs)}${active?.d === d && active.c === c ? " active" : ""}`}
                  onMouseEnter={() => setActive({ d, c })}
                />
              ))}
            </g>
          ))}
          {buckets[0]?.map((b, c) =>
            c % labelEvery === 0 ? (
              <text key={b.from} x={LEFT + c * colW + cellW / 2} y={height - 5} textAnchor="middle" className="chart-axis">
                {fmtHour(b.from % 24)}
              </text>
            ) : null,
          )}
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
      {/* A table can't shrink to the 1px sr-only box, so the wrapper carries the class. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <tbody>
            {buckets.map((row, d) => (
              <tr key={d}>
                <th>{DAY_NAMES[d]}</th>
                {row.map((b) => (
                  <td key={b.from}>{`${windowLabel(b.from)}: ${fmtDuration(b.productiveMs)}`}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
