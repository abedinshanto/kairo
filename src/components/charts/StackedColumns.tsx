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

interface Props {
  data: ColumnDatum[];
  series: { name: string; color: string }[];
  height?: number;
  /** Show every n-th x label. */
  labelEvery?: number;
  reference?: { value: number; label: string };
  caption: string;
}

const PAD = { top: 10, right: 6, bottom: 24, left: 40 };

export function StackedColumns({ data, series, height = 220, labelEvery = 1, reference, caption }: Props) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals, reference?.value ?? 0);
  const ticks = durationTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band * 0.64));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  const tip: TipData | null =
    active !== null && data[active]
      ? {
          x: PAD.left + band * active + band / 2,
          y: y(totals[active]) - 8,
          title: data[active].title,
          rows: [
            ...series
              .map((s, i) => ({ label: s.name, value: fmtDuration(data[active].values[i]), color: s.color, raw: data[active].values[i] }))
              .filter((r) => r.raw > 0)
              .reverse(),
          ],
          note: totals[active] > 0 ? `${fmtDuration(totals[active])} total${data[active].note ? ` · ${data[active].note}` : ""}` : "No activity",
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
    <div ref={ref} className="chart" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={caption}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onMouseLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? "chart-baseline" : "chart-grid"} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-axis">
                {fmtHours(t)}
              </text>
            </g>
          ))}

          {active !== null && (
            <rect className="chart-hover-band" x={PAD.left + band * active + 1} y={PAD.top} width={Math.max(0, band - 2)} height={plotH} rx={6} />
          )}

          {data.map((d, i) => {
            const x = PAD.left + band * i + (band - barW) / 2;
            let acc = 0;
            const lastIdx = d.values.reduce((last, v, k) => (v > 0 ? k : last), -1);
            const dimmed = (active !== null && active !== i) || d.dim;
            return (
              <g key={d.key} opacity={dimmed ? 0.5 : 1} style={{ transition: "opacity .15s" }}>
                {d.values.map((v, k) => {
                  if (v <= 0) return null;
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const h = y0 - y1;
                  const gap = k > 0 && acc - v > 0 ? 2 : 0;
                  return k === lastIdx ? (
                    <path key={k} d={topRounded(x, y1, barW, Math.max(0, h - gap))} fill={series[k].color} />
                  ) : (
                    <rect key={k} x={x} y={y1} width={barW} height={Math.max(0, h - gap)} fill={series[k].color} />
                  );
                })}
              </g>
            );
          })}

          {reference && (
            <g>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(reference.value)} y2={y(reference.value)} className="chart-reference" />
              <text x={width - PAD.right} y={y(reference.value) - 6} textAnchor="end" className="chart-axis chart-ref-label">
                {reference.label}
              </text>
            </g>
          )}

          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.key} x={PAD.left + band * i + band / 2} y={height - 6} textAnchor="middle" className="chart-axis">
                {d.label}
              </text>
            ) : null,
          )}

          {data.map((d, i) => (
            <rect
              key={d.key}
              x={PAD.left + band * i}
              y={PAD.top}
              width={band}
              height={plotH + PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onMouseMove={() => setActive(i)}
            />
          ))}
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
      <table className="sr-only">
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
  );
}
