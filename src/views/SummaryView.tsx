import { ArrowLeft, ArrowRightLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Flame, Hourglass, ListChecks, Sparkles, Sun, Target, Timer, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Buddy } from "../components/Buddy";
import { ProportionBar } from "../components/charts/Bars";
import { Avatar, PageTitle, TopBar, cx } from "../components/ui";
import { backend } from "../lib/backend";
import { categoryLabel, entityName } from "../lib/categories";
import { useQuery } from "../lib/hooks";
import { useApp } from "../lib/store";
import { dueFromWords } from "../lib/spoken";
import { addDays, dayBuckets, fmtDay, fmtDuration, fmtHour, fmtShortDay, fmtWeekday, hourBuckets, startOfDay } from "../lib/time";
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
  const week = useApp((s) => s.summaryWeek);
  return week ? <WeekReview /> : <DaySummary />;
}

function DaySummary() {
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
              <Avatar name={name} productivity={e.productivity} size={38} iconKey={e.kind === "app" ? e.key : undefined} siteKey={e.kind === "site" ? e.key : undefined} />
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

// ------------------------------------------------------------------ The weekly review

interface Week {
  first: number;
  days: { day: number; totals: BucketTotals; focusMs: number; blocks: number }[];
  focusMs: number;
  prevFocusMs: number;
  active: number;
  distracting: number;
  entities: EntityTotal[];
  done: Task[];
  open: Task[];
}

async function loadWeek(last: number): Promise<Week> {
  const first = addDays(last, -6);
  const end = Math.min(addDays(last, 1), Date.now());
  const [totals, entities, sessions, prevSessions, tasks] = await Promise.all([
    backend.bucketTotals(dayBuckets(first, 7)),
    backend.entityTotals(first, end),
    backend.focusSessions(first, end),
    backend.focusSessions(addDays(first, -7), first),
    backend.tasksList(),
  ]);
  const focus = sessions.filter((s) => s.kind === "focus");
  const days = totals.map((t, i) => {
    const day = addDays(first, i);
    const mine = focus.filter((s) => s.start >= day && s.start < addDays(day, 1));
    return { day, totals: t, focusMs: mine.reduce((a, s) => a + s.actualMs, 0), blocks: mine.filter((s) => s.completed).length };
  });
  return {
    first,
    days,
    focusMs: days.reduce((a, d) => a + d.focusMs, 0),
    prevFocusMs: prevSessions.filter((s) => s.kind === "focus").reduce((a, s) => a + s.actualMs, 0),
    active: totals.reduce((a, t) => a + activeOf(t), 0),
    distracting: totals.reduce((a, t) => a + t.distractingMs, 0),
    entities: entities.slice().sort((a, b) => b.ms - a.ms),
    done: tasks.filter((t) => t.done && t.completedAt !== null && t.completedAt >= first && t.completedAt < end),
    open: tasks.filter((t) => !t.done),
  };
}

/** Once a week: how the focus went, the best day, what pulled you away, and next week's plan. */
function WeekReview() {
  const summaryDay = useApp((s) => s.summaryDay);
  const openSummary = useApp((s) => s.openSummary);
  const setView = useApp((s) => s.setView);
  const goal = useApp((s) => s.settings.dailyFocusGoalMinutes) * 60_000;
  const today = startOfDay(Date.now());
  const last = summaryDay ?? today;
  const { data } = useQuery(() => loadWeek(last), [last]);
  const thisWeek = last >= today;
  const quiet = data && data.active < QUIET_MS && data.focusMs === 0;

  return (
    <div className="summary week">
      <TopBar
        left={
          <>
            <button className="circle-btn" aria-label="Back to Home" title="Back" onClick={() => setView("home")}>
              <ArrowLeft />
            </button>
            <div style={{ minWidth: 0 }}>
              <div className="who-name">Weekly review</div>
              <div className="who-sub">
                {fmtShortDay(addDays(last, -6))} – {fmtShortDay(last)}
              </div>
            </div>
          </>
        }
        right={
          <>
            <button className="circle-btn" aria-label="Previous week" onClick={() => openSummary(addDays(last, -7), true)}>
              <ChevronLeft />
            </button>
            <button className="circle-btn" aria-label="Next week" disabled={thisWeek} onClick={() => openSummary(Math.min(today, addDays(last, 7)), true)}>
              <ChevronRight />
            </button>
          </>
        }
      />
      <header className="summary-head">
        <PageTitle strong={thisWeek ? "Your week," : "That week,"} dim="wrapped." />
      </header>

      {!data ? null : quiet ? (
        <div className="card summary-empty">
          <Buddy mood="sleep" size={96} />
          <strong>A quiet week</strong>
          <span>Nothing was tracked or timed in these seven days.</span>
        </div>
      ) : (
        <>
          <div className="summary-grid">
            <WeekHero data={data} goal={goal} />
            <WeekTiles data={data} goal={goal} />
            <WeekNotes data={data} goal={goal} />
            <TopOfWeek data={data} />
          </div>
          <PlanNextWeek tasks={data.open} />
        </>
      )}
    </div>
  );
}

function WeekHero({ data, goal }: { data: Week; goal: number }) {
  const change = data.prevFocusMs >= 10 * 60_000 ? Math.round(((data.focusMs - data.prevFocusMs) / data.prevFocusMs) * 100) : null;
  const max = Math.max(goal, ...data.days.map((d) => d.focusMs), 1);
  const best = data.days.reduce((a, d) => (d.focusMs > a.focusMs ? d : a), data.days[0]);
  return (
    <section className="card hero summary-hero" aria-label="Focus this week">
      <div className="summary-hero-top">
        <span className="summary-hero-label">Focused this week</span>
        <Buddy mood={change !== null && change >= 0 ? "happy" : "idle"} tone="cloud" size={72} />
      </div>
      <div className="summary-hero-number">{fmtDuration(data.focusMs)}</div>
      <div className="summary-hero-sub">
        {change === null ? "Your first week with focus blocks" : change === 0 ? "The same as the week before" : `${Math.abs(change)}% ${change > 0 ? "more" : "less"} than the week before`}
        {best.focusMs > 0 && ` · best day ${fmtWeekday(best.day)}`}
      </div>
      <div className="week-bars" role="img" aria-label={data.days.map((d) => `${fmtWeekday(d.day)} ${fmtDuration(d.focusMs)}`).join(", ")}>
        {goal > 0 && <span className="week-goal" style={{ bottom: `${(goal / max) * 100}%` }} title={`Goal ${fmtDuration(goal)}`} />}
        {data.days.map((d) => (
          <span key={d.day} className={cx("week-col", goal > 0 && d.focusMs >= goal && "hit", d === best && d.focusMs > 0 && "best")} title={`${fmtDay(d.day)} · ${fmtDuration(d.focusMs)}`}>
            <span className="week-bar" style={{ height: `${Math.max(d.focusMs ? 4 : 0, (d.focusMs / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="week-axis" aria-hidden>
        {data.days.map((d) => (
          <span key={d.day}>{fmtWeekday(d.day).slice(0, 1)}</span>
        ))}
      </div>
    </section>
  );
}

function WeekTiles({ data, goal }: { data: Week; goal: number }) {
  const budget = useApp((s) => s.settings.distractionBudgetMinutes) * 60_000;
  const hit = goal ? data.days.filter((d) => d.focusMs >= goal).length : 0;
  const blocks = data.days.reduce((a, d) => a + d.blocks, 0);
  const activeDays = Math.max(1, data.days.filter((d) => activeOf(d.totals) >= QUIET_MS).length);
  const overBudget = budget ? data.days.filter((d) => d.totals.distractingMs > budget).length : 0;
  return (
    <div className="summary-tiles">
      <Tile icon={<Target />} tone="brand-solid" value={goal ? `${hit} of 7` : "—"} label="Goal days" meter={goal ? { ratio: hit / 7 } : undefined} foot={goal ? `Days with ${fmtDuration(goal)} of focus` : "No daily goal set"} />
      <Tile icon={<Check />} tone="good" value={String(data.done.length)} label={data.done.length === 1 ? "Task done" : "Tasks done"} foot={`${blocks} focus block${blocks === 1 ? "" : "s"}`} />
      <Tile
        icon={<Hourglass />}
        tone="warn"
        value={fmtDuration(data.distracting / activeDays)}
        label="Distracting a day"
        foot={budget ? (overBudget ? `Over budget on ${overBudget} day${overBudget === 1 ? "" : "s"}` : "Within budget every day") : "No budget set"}
      />
      <Tile icon={<Sun />} tone="gray" value={fmtDuration(data.active / activeDays)} label="On screen a day" foot={`${activeDays} active day${activeDays === 1 ? "" : "s"}`} />
    </div>
  );
}

function WeekNotes({ data, goal }: { data: Week; goal: number }) {
  const notes: Note[] = [];
  const best = data.days.reduce((a, d) => (d.focusMs > a.focusMs ? d : a), data.days[0]);
  if (best.focusMs > 0) notes.push({ tone: "good", icon: <Flame />, text: `${fmtWeekday(best.day)} was your best day: ${fmtDuration(best.focusMs)} of focus.` });
  const hit = goal ? data.days.filter((d) => d.focusMs >= goal).length : 0;
  if (goal) notes.push(hit >= 5 ? { tone: "good", icon: <Target />, text: `You hit your focus goal on ${hit} days. Steady.` } : { tone: "brand", icon: <Target />, text: hit ? `Focus goal reached on ${hit} day${hit === 1 ? "" : "s"}. One more next week?` : "No goal days this week. A smaller goal can get the streak going." });
  const leaks = data.entities.filter((e) => e.productivity < 0).slice(0, 2);
  if (leaks.length) {
    const names = leaks.map((e) => `${entityName(e.kind, e.key, e.name)} (${fmtDuration(e.ms)})`).join(" and ");
    notes.push({ tone: "warn", icon: <TriangleAlert />, text: `What pulled you away most: ${names}.` });
  }
  if (data.done.length) notes.push({ tone: "good", icon: <Check />, text: data.done.length === 1 ? `Finished “${data.done[0].title}”.` : `Finished ${data.done.length} tasks, including “${data.done[0].title}”.` });
  const quietDays = data.days.filter((d) => d.focusMs === 0 && activeOf(d.totals) >= 60 * 60_000).length;
  if (quietDays >= 2) notes.push({ tone: "brand", icon: <Timer />, text: `${quietDays} busy days had no focus blocks. Even one makes a difference.` });
  return (
    <section className="card">
      <div className="card-title">How the week went</div>
      <ul className="summary-notes">
        {notes.map((n) => (
          <li key={n.text}>
            <span className={cx("icon-tile round", n.tone)}>{n.icon}</span>
            <span>{n.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopOfWeek({ data }: { data: Week }) {
  const top = data.entities.slice(0, 5);
  const max = top[0]?.ms ?? 1;
  return (
    <section className="card">
      <div className="card-title">Where the week went</div>
      <ul className="list summary-where">
        {top.map((e) => {
          const name = entityName(e.kind, e.key, e.name);
          return (
            <li key={`${e.kind}:${e.key}`} className="list-row">
              <Avatar name={name} productivity={e.productivity} size={38} iconKey={e.kind === "app" ? e.key : undefined} siteKey={e.kind === "site" ? e.key : undefined} />
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

/** Next week's plan: give open tasks a day, or head to the full list. */
function PlanNextWeek({ tasks }: { tasks: Task[] }) {
  const setView = useApp((s) => s.setView);
  const monday = dueFromWords("next week") ?? addDays(startOfDay(Date.now()), 7);
  const [planned, setPlanned] = useState<Record<number, boolean>>({});
  const shown = tasks.slice(0, 5);
  const plan = async (t: Task) => {
    const on = !planned[t.id];
    setPlanned((p) => ({ ...p, [t.id]: on }));
    try {
      await backend.taskUpdate(t.id, { dueDay: on ? monday : null });
      useApp.getState().bumpData();
    } catch (err) {
      setPlanned((p) => ({ ...p, [t.id]: !on }));
      useApp.getState().toast({ title: "Couldn't plan the task", body: String(err), tone: "warning" });
    }
  };
  return (
    <section className="card week-plan" aria-labelledby="week-plan-title">
      <div className="card-head">
        <div>
          <h2 className="card-title" id="week-plan-title">
            Plan next week
          </h2>
          <div className="card-sub">{shown.length ? `Put what matters on Monday, ${fmtShortDay(monday)}.` : "Nothing open. Add what's coming up."}</div>
        </div>
        <button className="btn btn-soft btn-sm" onClick={() => setView("tasks")}>
          <ListChecks /> All tasks
        </button>
      </div>
      {shown.length > 0 && (
        <ul className="list">
          {shown.map((t) => {
            const on = planned[t.id] ?? t.dueDay === monday;
            return (
              <li key={t.id} className="list-row">
                <span className="list-main">
                  <span className="list-title">{t.title}</span>
                  <span className="list-sub">
                    {t.pomodoros} of {t.estimate} blocks{t.dueDay !== null && t.dueDay !== monday ? ` · due ${fmtShortDay(t.dueDay)}` : ""}
                  </span>
                </span>
                <button className={cx("chip", on && "active")} aria-pressed={on} onClick={() => void plan(t)}>
                  <CalendarDays /> {on ? "Monday" : "Add to Monday"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
