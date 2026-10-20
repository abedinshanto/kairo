import {
  Calendar,
  ChevronDown,
  CircleCheck,
  Droplets,
  MessageSquare,
  Moon,
  ShieldCheck,
  Shuffle,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import type { Insight, InsightIcon, InsightTone } from "../lib/insights";
import { cx } from "./ui";

const ICONS: Record<InsightIcon, React.ReactNode> = {
  "trend-up": <TrendingUp />,
  "trend-down": <TrendingDown />,
  sun: <Sun />,
  moon: <Moon />,
  alert: <TriangleAlert />,
  shuffle: <Shuffle />,
  target: <Target />,
  check: <CircleCheck />,
  calendar: <Calendar />,
  message: <MessageSquare />,
  shield: <ShieldCheck />,
  leak: <Droplets />,
};

const TONE_TILE: Record<InsightTone, string | undefined> = {
  positive: "good",
  warning: "warn",
  neutral: undefined,
};

/**
 * Calm insight cards: a tinted icon, a title and a one-line body that opens on tap.
 * Shows `limit` at first; "Show more" reveals the rest.
 */
export function InsightList({ insights, limit = 3, columns }: { insights: Insight[]; limit?: number; columns?: boolean }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = all ? insights : insights.slice(0, limit);
  const hidden = insights.length - shown.length;

  return (
    <div className="insights-wrap">
      <ul className={cx("insights", columns && "columns")}>
        {shown.map((i) => {
          const expanded = open === i.id;
          return (
            <li key={i.id}>
              <button
                type="button"
                className={cx("insight", i.tone, expanded && "open")}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : i.id)}
              >
                <span className={cx("icon-tile round", TONE_TILE[i.tone])} aria-hidden>
                  {ICONS[i.icon]}
                </span>
                <span className="insight-text">
                  <span className="insight-title">{i.title}</span>
                  <span className="insight-body">{i.body}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {insights.length > limit && (
        <button type="button" className="btn btn-ghost btn-sm insights-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show less" : `Show ${hidden} more`}
          <ChevronDown className={cx(all && "flip")} />
        </button>
      )}
    </div>
  );
}
