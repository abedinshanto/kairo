import { useState, type KeyboardEvent } from "react";
import { fmtDuration, fmtHours } from "../../lib/time";
import { ChartTooltip, durationTicks, topRounded, useSize, type TipData } from "./common";

export interface ColumnDatum {
  key: string | number;
  label: string;
  /** Full label for tooltips and the table view. */
  title: string;
  values: number[];
  note?: string;
  dim?: boolean;
}

export interface ChartPad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Props {
  data: ColumnDatum[];
  series: { name: string; color: string }[];
  height?: number;
  /** Show every n-th x label. */
  labelEvery?: number;
  reference?: { value: number; label: string };
  caption: string;
  /** Gridlines above the baseline (kept to 2–3 so the axis stays quiet). */
  gridLines?: number;
  pad?: Partial<ChartPad>;
}

export const COLUMN_PAD: ChartPad = { top: 12, right: 4, bottom: 26, left: 40 };
const GAP = 2;

/** Rounded columns from one baseline; stacked segments separated by a 2px surface gap. */
export function StackedColumns({ data, series, height = 220, labelEvery = 1, reference, caption, gridLines = 2, pad: padIn }: Props) {
  const pad = { ...COLUMN_PAD, ...padIn };
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals, reference?.value ?? 0);
  const ticks = durationTicks(max, gridLines);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(3, Math.min(24, band * 0.58));
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  // Thin x labels until they have room to breathe (≈ 6.6px per character at 11.5px).
  const need = Math.max(0, ...data.map((d) => d.label.length)) * 6.6 + 12;
  let every = Math.max(1, labelEvery);
  while (band > 0 && band * every < need && every < data.length) every++;

  const tip: TipData | null =
    active !== null && data[active]
      ? {
          x: pad.left + band * active + band / 2,
          y: Math.min(y(totals[active]), pad.top + plotH) - 10,
          title: data[active].title,
          rows: series
            .map((s, i) => ({ label: s.name, value: fmtDuration(data[active].values[i]), color: s.color, raw: data[active].values[i] }))
            .filter((r) => r.raw > 0)
            .reverse(),
          note: totals[active] > 0 ? `${fmtDuration(totals[active])} total${data[active].note ? ` · ${data[active].note}` : ""}` : "Nothing tracked",
        }
      : null;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? data.length) - 1));
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={ref} className="chart columns" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${caption}. Use the arrow keys to read each column.`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onMouseLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className={t === 0 ? "chart-baseline" : "chart-grid"} />
              {t > 0 && (
                <text x={pad.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="chart-axis">
                  {fmtHours(t)}
                </text>
              )}
            </g>
          ))}

          {active !== null && (
            <rect className="chart-hover-band" x={pad.left + band * active + 1} y={pad.top - 4} width={Math.max(0, band - 2)} height={plotH + 4} rx={Math.min(10, band / 3)} />
          )}

          {data.map((d, i) => {
            const x = pad.left + band * i + (band - barW) / 2;
            let acc = 0;
            const lastIdx = d.values.reduce((last, v, k) => (v > 0 ? k : last), -1);
            const dimmed = (active !== null && active !== i) || d.dim;
            return (
              <g key={d.key} className="chart-col" opacity={dimmed ? 0.45 : 1}>
                {d.values.map((v, k) => {
                  if (v <= 0) return null;
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const gap = acc - v > 0 ? GAP : 0;
                  const h = Math.max(0, y0 - y1 - gap);
                  if (h < 0.5) return null;
                  return k === lastIdx ? (
                    <path key={k} d={topRounded(x, y1, barW, h, 4)} fill={series[k].color} />
                  ) : (
                    <rect key={k} x={x} y={y1} width={barW} height={h} fill={series[k].color} />
                  );
                })}
              </g>
            );
          })}

          {reference && (
            <g>
              <line x1={pad.left} x2={width - pad.right} y1={y(reference.value)} y2={y(reference.value)} className="chart-reference" />
              <text x={width - pad.right} y={y(reference.value) - 7} textAnchor="end" className="chart-axis chart-ref-label">
                {reference.label}
              </text>
            </g>
          )}

          {data.map((d, i) =>
            i % every === 0 ? (
              <text key={d.key} x={pad.left + band * i + band / 2} y={height - 6} textAnchor="middle" className={active === i ? "chart-axis active" : "chart-axis"}>
                {d.label}
              </text>
            ) : null,
          )}

          {data.map((d, i) => (
            <rect
              key={d.key}
              x={pad.left + band * i}
              y={pad.top - 4}
              width={band}
              height={plotH + pad.bottom + 4}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onMouseMove={() => setActive(i)}
              onClick={() => setActive(i)}
            />
          ))}
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
      {/* A table can't shrink to the 1px sr-only box, so the wrapper carries the class. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th>Period</th>
              {series.map((s) => (
                <th key={s.name}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <th>{d.title}</th>
                {d.values.map((v, k) => (
                  <td key={k}>{fmtDuration(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
