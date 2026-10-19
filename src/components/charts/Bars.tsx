import type { ReactNode } from "react";
import { productivityClass } from "../../lib/categories";
import { fmtDuration } from "../../lib/time";

export interface BarRow {
  key: string;
  label: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  value: number;
  productivity: number;
  trailing?: ReactNode;
}

/** Ranked list with a thin bar per row; bar colour carries productivity, text stays in ink. */
export function BarList({ rows, max, empty }: { rows: BarRow[]; max?: number; empty?: ReactNode }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <>{empty}</>;
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.key}>
          {r.icon}
          <div className="barlist-main">
            <div className="barlist-line">
              <span className="barlist-label">{r.label}</span>
              <span className="barlist-value tabular">{fmtDuration(r.value)}</span>
            </div>
            <div className="barlist-track">
              <span className={`barlist-fill ${productivityClass(r.productivity)}`} style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%` }} />
            </div>
            {r.sub && <div className="barlist-sub">{r.sub}</div>}
          </div>
          {r.trailing}
        </li>
      ))}
    </ul>
  );
}

/** One horizontal bar split into productive / neutral / distracting with surface gaps. */
export function ProportionBar({ p, n, d, height = 8 }: { p: number; n: number; d: number; height?: number }) {
  const total = p + n + d;
  if (total <= 0) return <div className="propbar empty" style={{ height }} />;
  const parts = [
    { v: p, c: "productive" },
    { v: n, c: "neutral" },
    { v: d, c: "distracting" },
  ].filter((x) => x.v > 0);
  return (
    <div className="propbar" style={{ height }} role="img" aria-label={`Productive ${fmtDuration(p)}, neutral ${fmtDuration(n)}, distracting ${fmtDuration(d)}`}>
      {parts.map((x) => (
        <span key={x.c} className={x.c} style={{ flexGrow: x.v }} />
      ))}
    </div>
  );
}
