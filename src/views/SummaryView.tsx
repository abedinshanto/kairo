import { ArrowLeft, ArrowRightLeft, Check, ChevronLeft, ChevronRight, Hourglass, ListChecks, Sparkles, Sun, Target, Timer, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Buddy } from "../components/Buddy";
import { ProportionBar } from "../components/charts/Bars";
import { Avatar, PageTitle, TopBar, cx } from "../components/ui";
import { backend } from "../lib/backend";
import { categoryLabel, entityName } from "../lib/categories";
import { useQuery } from "../lib/hooks";
import { useApp } from "../lib/store";
import { addDays, fmtDay, fmtDuration, fmtHour, fmtWeekday, hourBuckets, startOfDay } from "../lib/time";
import type { BucketTotals, EntityTotal, FocusSession, Task } from "../lib/types";
import "../styles/views/summary.css";

/** Below this, a day has too little in it to sum up. */
const QUIET_MS = 60_000;

const activeOf = (b: BucketTotals) => b.productiveMs + b.neutralMs + b.distractingMs;

interface Day {
  totals: BucketTotals;
  active: number;
  /** Average screen time over the previous 7 days that had any. */
  average: number | null;
  entities: EntityTotal[];
  focus: FocusSession[];
  done: Task[];
  /** Hour of the day with the most productive time, if it had a meaningful amount. */
  peakHour: number | null;
  hours: BucketTotals[];
}

async function loadDay(day: number): Promise<Day> {
  const next = addDays(day, 1);
  const end = Math.min(next, Date.now());
  const before = Array.from({ length: 7 }, (_, i): [number, number] => [addDays(day, -(i + 1)), addDays(day, -i)]);
  const [[totals], hours, entities, sessions, tasks, prev] = await Promise.all([
    backend.bucketTotals([[day, end]]),
    backend.bucketTotals(hourBuckets(day)),
    backend.entityTotals(day, end),
    backend.focusSessions(day, end),
    backend.tasksList(),
    backend.bucketTotals(before),
  ]);
  const previous = prev.map(activeOf).filter((ms) => ms >= QUIET_MS);
  const peak = hours.reduce((best, h, i) => (h.productiveMs > hours[best].productiveMs ? i : best), 0);
  return {
    totals,
    active: activeOf(totals),
    average: previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : null,
    entities: entities.slice().sort((a, b) => b.ms - a.ms),
    focus: sessions.filter((s) => s.kind === "focus"),
    done: tasks.filter((t) => t.done && t.completedAt !== null && t.completedAt >= day && t.completedAt < next),
    peakHour: hours[peak].productiveMs >= 15 * 60_000 ? peak : null,
    hours,
  };
}

/** The end-of-day summary: what got done, where the time went, what pulled you away. */
export function SummaryView() {
  const summaryDay = useApp((s) => s.summaryDay);
  const openSummary = useApp((s) => s.openSummary);
  const setView = useApp((s) => s.setView);
  const today = startOfDay(Date.now());
  const day = summaryDay ?? today;
  const isToday = day === today;
  const { data } = useQuery(() => loadDay(day), [day]);
  const quiet = data && data.active < QUIET_MS && data.focus.length === 0;

  return (
    <div className="summary">
      <TopBar
        left={
          <>
            <button className="circle-btn" aria-label="Back to Home" title="Back" onClick={() => setView("home")}>
              <ArrowLeft />
            </button>
            <div style={{ minWidth: 0 }}>
              <div className="who-name">Daily summary</div>
              <div className="who-sub">{fmtDay(day)}</div>
            </div>
          </>
        }
        right={
          <>
            <button className="circle-btn" aria-label="Previous day" onClick={() => openSummary(addDays(day, -1))}>
              <ChevronLeft />
            </button>
            <button className="circle-btn" aria-label="Next day" disabled={isToday} onClick={() => openSummary(addDays(day, 1))}>
              <ChevronRight />
            </button>
          </>
        }
      />
      <header className="summary-head">
        <PageTitle strong={isToday ? "Your day," : `${fmtWeekday(day)},`} dim="wrapped." />
      </header>

      {!data ? null : quiet ? (
        <div className="card summary-empty">
          <Buddy mood="sleep" size={96} />
          <strong>{isToday ? "A quiet day so far" : "Nothing tracked that day"}</strong>
          <span>Kairo sums up a day once it has seen some of it.</span>
        </div>
      ) : (
        <>
          <div className="summary-grid">
            <Hero data={data} />
            <Tiles data={data} />
            <HowItWent data={data} />
            <WhereItWent data={data} />
          </div>
          <div className="summary-actions">
            <button className="btn btn-soft" onClick={() => setView("stats")}>
              Full stats
            </button>
            <button className="btn btn-primary" onClick={() => setView("tasks")}>
              <ListChecks /> Plan tomorrow
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Hero({ data }: { data: Day }) {
  const { totals: t, active, average } = data;
  const share = active ? Math.round((t.productiveMs / active) * 100) : 0;
  const diff = average !== null ? active - average : null;
  return (
    <section className="card hero summary-hero" aria-label="Screen time">
      <div className="summary-hero-top">
        <span className="summary-hero-label">On screen</span>
        <Buddy mood={share >= 60 ? "happy" : "idle"} tone="cloud" size={72} />
      </div>
      <div className="summary-hero-number">{fmtDuration(active)}</div>
      <div className="summary-hero-sub">
        {share}% productive
        {diff !== null && Math.abs(diff) >= 5 * 60_000 && ` · ${fmtDuration(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than your usual day`}
      </div>
      <DayShape hours={data.hours} />
      <div className="summary-hero-split">
        <ProportionBar p={t.productiveMs} n={t.neutralMs} d={t.distractingMs} height={10} onBrand />
        <dl className="summary-legend">
          <div>
            <dt>Productive</dt>
            <dd>{fmtDuration(t.productiveMs)}</dd>
          </div>
          <div>
            <dt>Neutral</dt>
            <dd>{fmtDuration(t.neutralMs)}</dd>
          </div>
          <div>
            <dt>Distracting</dt>
            <dd>{fmtDuration(t.distractingMs)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** The day's shape: one thin stacked column per hour, from the first active hour to the last. */
function DayShape({ hours }: { hours: BucketTotals[] }) {
  const used = hours.flatMap((h, i) => (activeOf(h) >= QUIET_MS ? [i] : []));
  if (used.length < 2) return null;
  const from = used[0];
  const to = used[used.length - 1];
  const shown = hours.slice(from, to + 1);
  const max = Math.max(...shown.map(activeOf), 1);
  const pct = (ms: number) => `${(ms / max) * 100}%`;
  return (
    <div className="day-shape" role="img" aria-label={`Screen time by hour, ${fmtHour(from)} to ${fmtHour(to + 1)}`}>
      <div className="day-shape-bars">
        {shown.map((h, i) => (
          <span key={i} className="day-shape-col" title={`${fmtHour(from + i)} · ${fmtDuration(activeOf(h))}`}>
            <span className="p" style={{ height: pct(h.productiveMs) }} />
            <span className="n" style={{ height: pct(h.neutralMs) }} />
            <span className="d" style={{ height: pct(h.distractingMs) }} />
          </span>
        ))}
      </div>
      <div className="day-shape-axis">
        <span>{fmtHour(from)}</span>
        <span>{fmtHour(to + 1)}</span>
      </div>
    </div>
  );
}

function Tile({ icon, tone, value, label, foot, meter }: { icon: ReactNode; tone: string; value: string; label: string; foot: string; meter?: { ratio: number; warn?: boolean } }) {
  return (
    <div className="card tile">
      <span className={cx("icon-tile round", tone)}>{icon}</span>
      <div className="summary-tile-value">{value}</div>
      <div className="tile-label">{label}</div>
      {meter && (
        <div className={cx("meter", meter.warn ? "distracting" : meter.ratio >= 1 && "done")}>
          <span style={{ width: `${Math.min(100, meter.ratio * 100)}%` }} />
        </div>
      )}
      <div className="tile-foot">{foot}</div>
    </div>
  );
}

function Tiles({ data }: { data: Day }) {
  const goal = useApp((s) => s.settings.dailyFocusGoalMinutes) * 60_000;
  const budget = useApp((s) => s.settings.distractionBudgetMinutes) * 60_000;
  const focusMs = data.focus.reduce((a, s) => a + s.actualMs, 0);
  const blocks = data.focus.filter((s) => s.completed).length;
  const distracting = data.totals.distractingMs;
  return (
    <div className="summary-tiles">
      <Tile
        icon={<Timer />}
        tone="brand-solid"
        value={fmtDuration(focusMs)}
        label="Focused"
        meter={goal ? { ratio: focusMs / goal } : undefined}
        foot={`${blocks} block${blocks === 1 ? "" : "s"}${goal ? ` · goal ${fmtDuration(goal)}` : ""}`}
      />
      <Tile icon={<Check />} tone="good" value={String(data.done.length)} label={data.done.length === 1 ? "Task done" : "Tasks done"} foot={data.done[0]?.title ?? "None ticked off"} />
      <Tile
        icon={<Hourglass />}
        tone="warn"
        value={fmtDuration(distracting)}
        label="Distracting"
        meter={budget ? { ratio: distracting / budget, warn: true } : undefined}
        foot={budget ? (distracting > budget ? `${fmtDuration(distracting - budget)} over budget` : `${fmtDuration(budget - distracting)} left of ${fmtDuration(budget)}`) : "No budget set"}
      />
      <Tile icon={<Sun />} tone="gray" value={data.peakHour === null ? "—" : fmtHour(data.peakHour)} label="Sharpest hour" foot={data.peakHour === null ? "Not enough focus yet" : "Most productive time"} />
    </div>
  );
}

interface Note {
  tone: "good" | "warn" | "brand";
  icon: ReactNode;
  text: string;
}

/** A few plain sentences: what went well, where it fell short, and one idea for tomorrow. */
function notesFor(data: Day, goal: number, budget: number): Note[] {
  const notes: Note[] = [];
  const focusMs = data.focus.reduce((a, s) => a + s.actualMs, 0);
  const blocks = data.focus.filter((s) => s.completed).length;
  if (goal && focusMs >= goal) notes.push({ tone: "good", icon: <Target />, text: `Focus goal reached: ${fmtDuration(focusMs)} across ${blocks} block${blocks === 1 ? "" : "s"}.` });
  else if (focusMs > 0) notes.push({ tone: "brand", icon: <Timer />, text: `${fmtDuration(focusMs)} of focus${goal ? `, ${fmtDuration(goal - focusMs)} short of your goal` : ""}.` });
  else notes.push({ tone: "warn", icon: <Timer />, text: "No focus blocks today. Even one 25-minute block moves the needle." });
  if (data.done.length) notes.push({ tone: "good", icon: <Check />, text: `Finished ${data.done.length === 1 ? `“${data.done[0].title}”` : `${data.done.length} tasks`}.` });
  const leak = data.entities.find((e) => e.productivity < 0 && e.ms >= 5 * 60_000);
  if (leak) {
    const over = budget && data.totals.distractingMs > budget ? ` Distracting time ran ${fmtDuration(data.totals.distractingMs - budget)} over your budget.` : "";
    notes.push({ tone: "warn", icon: <TriangleAlert />, text: `${entityName(leak.kind, leak.key, leak.name)} took ${fmtDuration(leak.ms)}, your biggest distraction.${over}` });
  }
  const share = data.active ? data.totals.productiveMs / data.active : 0;
  if (share >= 0.7) notes.push({ tone: "good", icon: <Sparkles />, text: `${Math.round(share * 100)}% of your screen time was productive.` });
  const main = data.entities.find((e) => e.productivity > 0);
  if (main) notes.push({ tone: "brand", icon: <Check />, text: `Most of the work happened in ${entityName(main.kind, main.key, main.name)} (${fmtDuration(main.ms)}).` });
  if (!leak && budget) notes.push({ tone: "good", icon: <Hourglass />, text: `Distractions stayed low: ${fmtDuration(data.totals.distractingMs)} of your ${fmtDuration(budget)} budget.` });
  if (data.totals.switches >= 150) notes.push({ tone: "warn", icon: <ArrowRightLeft />, text: `You switched apps ${data.totals.switches} times. Fewer switches usually means deeper work.` });
  if (data.peakHour !== null) notes.push({ tone: "brand", icon: <Sparkles />, text: `You were sharpest around ${fmtHour(data.peakHour)}. Save it for tomorrow's hardest task.` });
  return notes.slice(0, 6);
}

function HowItWent({ data }: { data: Day }) {
  const goal = useApp((s) => s.settings.dailyFocusGoalMinutes) * 60_000;
  const budget = useApp((s) => s.settings.distractionBudgetMinutes) * 60_000;
  return (
    <section className="card">
      <div className="card-title">How it went</div>
      <ul className="summary-notes">
        {notesFor(data, goal, budget).map((n) => (
          <li key={n.text}>
            <span className={cx("icon-tile round", n.tone)}>{n.icon}</span>
            <span>{n.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WhereItWent({ data }: { data: Day }) {
  const top = data.entities.slice(0, 5);
  const max = top[0]?.ms ?? 1;
  return (
    <section className="card">
      <div className="card-title">Where the time went</div>
      <ul className="list summary-where">
        {top.map((e) => {
          const name = entityName(e.kind, e.key, e.name);
          return (
            <li key={`${e.kind}:${e.key}`} className="list-row">
              <Avatar name={name} productivity={e.productivity} size={38} iconKey={e.kind === "app" ? e.key : undefined} />
              <span className="list-main">
                <span className="list-title">{name}</span>
                <span className={cx("summary-bar", e.productivity > 0 ? "productive" : e.productivity < 0 ? "distracting" : "neutral")}>
                  <span style={{ width: `${Math.max(4, (e.ms / max) * 100)}%` }} />
                </span>
              </span>
              <span className="list-trail">
                {fmtDuration(e.ms)}
                <small>{categoryLabel(e.category)}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
