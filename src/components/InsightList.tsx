import {
  Calendar,
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
import type { Insight, InsightIcon } from "../lib/insights";
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

export function InsightList({ insights, columns }: { insights: Insight[]; columns?: boolean }) {
  return (
    <ul className={cx("insights", columns && "columns")}>
      {insights.map((i) => (
        <li key={i.id} className={cx("insight", i.tone)}>
          <span className="insight-icon" aria-hidden>
            {ICONS[i.icon]}
          </span>
          <div>
            <div className="insight-title">{i.title}</div>
            <p className="insight-body">{i.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
