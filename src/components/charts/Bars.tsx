import type { ReactNode } from "react";
import { PRODUCTIVITY_LABEL, productivityClass } from "../../lib/categories";
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

/** Ranked rows with a thin bar each; the bar colour carries productivity, text stays in ink. */
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
              <span className="barlist-value">{fmtDuration(r.value)}</span>
              {/* The bar colour carries productivity; say it in words too. */}
              <span className="sr-only">, {PRODUCTIVITY_LABEL[Math.sign(r.productivity) as -1 | 0 | 1]}</span>
            </div>
            {r.sub && <div className="barlist-sub">{r.sub}</div>}
            <div className="barlist-track" aria-hidden>
              <span className={`barlist-fill ${productivityClass(r.productivity)}`} style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }} />
            </div>
          </div>
          {r.trailing && <div className="barlist-trail">{r.trailing}</div>}
        </li>
      ))}
    </ul>
  );
}

/**
 * One horizontal bar split into productive / neutral / distracting with gaps between
 * parts. `onBrand` swaps to white / translucent white / soft coral for hero cards.
 */
export function ProportionBar({ p, n, d, height = 8, onBrand = false }: { p: number; n: number; d: number; height?: number; onBrand?: boolean }) {
  const total = p + n + d;
  const cls = onBrand ? "propbar on-brand" : "propbar";
  if (total <= 0) return <div className={`${cls} is-empty`} style={{ height }} />;
  const parts = [
    { v: p, c: "productive" },
    { v: n, c: "neutral" },
    { v: d, c: "distracting" },
  ].filter((x) => x.v > 0);
  return (
    <div className={cls} style={{ height }} role="img" aria-label={`Productive ${fmtDuration(p)}, neutral ${fmtDuration(n)}, distracting ${fmtDuration(d)}`}>
      {parts.map((x) => (
        <span key={x.c} className={x.c} style={{ flexGrow: x.v }} />
      ))}
    </div>
  );
}
