import { useState } from "react";
import type { RhythmCell } from "../../lib/analytics";
import { fmtDuration, fmtHour } from "../../lib/time";
import { ChartTooltip, useSize, type TipData } from "./common";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STEPS = 6;
const LEFT = 36;
const BOTTOM = 20;

/** Weekday × hour rhythm, single-hue sequential scale (blue = productive minutes). */
export function Heatmap({ grid, caption }: { grid: RhythmCell[][]; caption: string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [tip, setTip] = useState<TipData | null>(null);
  const max = Math.max(1, ...grid.flat().map((c) => c.productiveMs));
  const cell = Math.max(6, Math.min(30, (width - LEFT) / 24));
  const gap = 2;
  const height = 7 * cell + BOTTOM;
  const level = (v: number) => (v <= 0 ? 0 : Math.min(STEPS, 1 + Math.floor((v / max) * (STEPS - 0.001))));

  return (
    <div ref={ref} className="chart">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={caption} onMouseLeave={() => setTip(null)}>
          {grid.map((row, d) => (
            <g key={d}>
              <text x={0} y={d * cell + cell / 2} dy="0.32em" className="chart-axis">
                {DAYS[d]}
              </text>
              {row.map((c) => (
                <rect
                  key={c.hour}
                  x={LEFT + c.hour * cell + gap / 2}
                  y={d * cell + gap / 2}
                  width={cell - gap}
                  height={cell - gap}
                  rx={Math.min(4, cell / 4)}
                  className={`heat heat-${level(c.productiveMs)}`}
                  onMouseEnter={() =>
                    setTip({
                      x: LEFT + c.hour * cell + cell / 2,
                      y: d * cell - 4,
                      title: `${DAYS[d]} · ${fmtHour(c.hour)}`,
                      rows: [
                        { label: "productive, on average", value: fmtDuration(c.productiveMs), color: "var(--productive)" },
                        { label: "distracting, on average", value: fmtDuration(c.distractingMs), color: "var(--distracting)" },
                      ],
                    })
                  }
                />
              ))}
            </g>
          ))}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
            <text key={h} x={LEFT + h * cell + cell / 2} y={height - 4} textAnchor="middle" className="chart-axis">
              {fmtHour(h)}
            </text>
          ))}
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
      <div className="heat-legend">
        <span>Less</span>
        {Array.from({ length: STEPS + 1 }, (_, i) => (
          <span key={i} className={`heat-swatch heat-${i}`} />
        ))}
        <span>More productive time</span>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {grid.map((row, d) => (
            <tr key={d}>
              <th>{DAYS[d]}</th>
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
