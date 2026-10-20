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

/** The first sentence of a note ("1.5" and "11am–1pm" don't end one). */
function lead(body: string): string {
  const m = body.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : body;
}

/** Keep "11am–1pm" on one line. */
const keepRanges = (s: string) => s.replace(/(\w)–(\w)/g, "$1\u2060–\u2060$2");

/**
 * Calm insight cards: a tinted icon, a title and the note's lead sentence; the
 * rest of the note (usually the advice) opens on tap.
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
          const short = lead(i.body);
          const icon = (
            <span className={cx("icon-tile round", TONE_TILE[i.tone])} aria-hidden>
              {ICONS[i.icon]}
            </span>
          );
          // Nothing more to say: a plain card, not a button.
          if (short === i.body)
            return (
              <li key={i.id}>
                <div className={cx("insight", i.tone)}>
                  {icon}
                  <span className="insight-text">
                    <span className="insight-title">{keepRanges(i.title)}</span>
                    <span className="insight-body">{i.body}</span>
                  </span>
                </div>
              </li>
            );
          const expanded = open === i.id;
          return (
            <li key={i.id}>
              <button
                type="button"
                className={cx("insight", i.tone, expanded && "open")}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : i.id)}
              >
                {icon}
                <span className="insight-text">
                  <span className="insight-title">{keepRanges(i.title)}</span>
                  <span className="insight-body">{expanded ? i.body : short}</span>
                </span>
                <ChevronDown className="insight-more" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {insights.length > limit && (
        <button type="button" className="btn btn-ghost btn-sm card-link insights-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show less" : `Show ${hidden} more`}
          <ChevronDown className={cx(all && "flip")} />
        </button>
      )}
    </div>
  );
}
