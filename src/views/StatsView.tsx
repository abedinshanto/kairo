import { AppWindow, Check, ChevronLeft, ChevronRight, Download, Flame, Hourglass, Sparkles, Timer } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Buddy } from "../components/Buddy";
import { BarList, ProportionBar, type BarRow } from "../components/charts/Bars";
import { Legend, SERIES, FOCUS_COLOR } from "../components/charts/common";
import { activeHourRange, DayTimeline } from "../components/charts/DayTimeline";
import { Heatmap } from "../components/charts/Heatmap";
import { ScoreRing } from "../components/charts/ScoreRing";
import { StackedColumns } from "../components/charts/StackedColumns";
import { InsightList } from "../components/InsightList";
import { Avatar, Delta, PageTitle, PillTabs, Segmented, Sheet, TopBar, cx } from "../components/ui";
import { buildDayStats, categoryTotals, goalStreak, pctChange, rhythmMatrix, sumDays, type DayStat, type RhythmCell } from "../lib/analytics";
import { backend } from "../lib/backend";
import { categoryLabel, entityName, PRODUCTIVITY_LABEL } from "../lib/categories";
import { useMediaQuery, useQuery } from "../lib/hooks";
import { focusPersona, generateInsights, type Insight, type Persona } from "../lib/insights";
import { exportPersonaCard } from "../lib/shareCard";
import { useApp } from "../lib/store";
import { addDays, dayBuckets, fmtDuration, fmtHour, fmtShortDay, fmtTime, fmtWeekday, hourBuckets, HOUR, MINUTE, relativeDayLabel, startOfDay } from "../lib/time";
import type { ActivitySpan, BucketTotals, EntityTotal, FocusSession } from "../lib/types";
import "../styles/views/stats.css";

type Range = "day" | 7 | 30;
type Summary = ReturnType<typeof sumDays>;

interface Model {
  key: string;
  range: Range;
  /** First day of the period (the day itself in day mode). */
  first: number;
  /** Number of days covered. */
  n: number;
  /** Day mode, today: `before` covers yesterday only up to the same clock time. */
  cut: boolean;
  now: Summary;
  before: Summary;
  days: DayStat[];
  prevDays: DayStat[];
  hourly: BucketTotals[];
  spans: ActivitySpan[];
  sessions: FocusSession[];
  entities: EntityTotal[];
  prevEntities: EntityTotal[];
}

const shortDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const longWeekday = new Intl.DateTimeFormat(undefined, { weekday: "long" });

// ------------------------------------------------------------------ URL state (#/stats?d=… or ?r=7)

/** The last period shown, so leaving for Apps & sites (or another tab) and coming back keeps it. */
let lastShown: { range: Range; day: number } | null = null;

function readHash(): { range: Range; day: number } {
  const h = window.location.hash;
  const today = startOfDay(Date.now());
  const r = h.match(/[?&]r=(7|30)\b/);
  const d = h.match(/[?&]d=(\d+)/);
  if (!r && !d && lastShown) return { range: lastShown.range, day: Math.min(today, lastShown.day) };
  const day = d ? Math.min(today, startOfDay(Number(d[1]))) : today;
  return { range: r ? (Number(r[1]) as 7 | 30) : "day", day };
}

function writeHash(range: Range, day: number) {
  const today = startOfDay(Date.now());
  const q = range !== "day" ? `?r=${range}` : day !== today ? `?d=${day}` : "";
  window.history.replaceState(null, "", `#/stats${q}`);
  lastShown = { range, day };
}

// ------------------------------------------------------------------ Loading

async function loadDay(day: number): Promise<Model> {
  const prev = addDays(day, -1);
  const next = addDays(day, 1);
  // Today is still in progress, so compare it with yesterday up to the same clock time.
  const cut = day === startOfDay(Date.now());
  const prevEnd = cut ? Math.min(day, prev + (Date.now() - day)) : day;
  const [totals, spans, sessions, entities, prevEntities] = await Promise.all([
    backend.bucketTotals([[prev, prevEnd], [day, next], ...hourBuckets(day)]),
    backend.activitySpans(day, next),
    backend.focusSessions(prev, next),
    backend.entityTotals(day, next),
    backend.entityTotals(prev, prevEnd),
  ]);
  const [yTotals, dTotals, ...hourly] = totals;
  const [yesterday, stat] = buildDayStats(
    [
      [prev, prevEnd],
      [day, next],
    ],
    [yTotals, dTotals],
    sessions,
    hourly,
  );
  return {
    key: `day:${day}`,
    range: "day",
    first: day,
    n: 1,
    cut,
    now: sumDays([stat]),
    before: sumDays([yesterday]),
    days: [stat],
    prevDays: [yesterday],
    hourly,
    spans,
    sessions: sessions.filter((s) => s.start >= day),
    entities,
    prevEntities,
  };
}

async function loadRange(n: 7 | 30, today: number): Promise<Model> {
  const first = addDays(today, -(n - 1));
  const prevFirst = addDays(first, -n);
  const end = addDays(today, 1);
  const days = dayBuckets(first, n);
  const prevDays = dayBuckets(prevFirst, n);
  const hours = days.flatMap(([from]) => hourBuckets(from));
  const [totals, prevTotals, hourly, sessions, prevSessions, entities, prevEntities] = await Promise.all([
    backend.bucketTotals(days),
    backend.bucketTotals(prevDays),
    backend.bucketTotals(hours),
    backend.focusSessions(first, end),
    backend.focusSessions(prevFirst, first),
    backend.entityTotals(first, end),
    backend.entityTotals(prevFirst, first),
  ]);
  const stats = buildDayStats(days, totals, sessions, hourly);
  const prevStats = buildDayStats(prevDays, prevTotals, prevSessions);
  return {
    key: `${n}:${today}`,
    range: n,
    first,
    n,
    cut: false,
    now: sumDays(stats),
    before: sumDays(prevStats),
    days: stats,
    prevDays: prevStats,
    hourly,
    spans: [],
    sessions,
    entities,
    prevEntities,
  };
}

// ------------------------------------------------------------------ Small pieces

/** "4h 12m" with the units set small, like the references' "1.5 Hours". */
function Dur({ ms }: { ms: number }) {
  const total = Math.round(Math.max(0, ms) / MINUTE);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (ms > 0 && total === 0)
    return (
      <span className="dur">
        {"<1"}
        <small>m</small>
      </span>
    );
  return (
    <span className="dur">
      {h > 0 && (
        <>
          {h}
          <small>h</small>
        </>
      )}
      {(m > 0 || h === 0) && (
        <>
          {m}
          <small>m</small>
        </>
      )}
    </span>
  );
}

/** Tile figure, matching Home's tiles: "1.5 hours" / "42 min". */
function TileDur({ ms }: { ms: number }) {
  if (ms >= HOUR)
    return (
      <>
        {(ms / HOUR).toFixed(1)}
        <small>hours</small>
      </>
    );
  const m = Math.round(ms / MINUTE);
  return (
    <>
      {ms > 0 && m === 0 ? "<1" : m}
      <small>min</small>
    </>
  );
}

const perDay = (ms: number, days: number) => (days > 0 ? ms / days : 0);

/** What the hero's delta (and the score) is measured against. */
function vsLabel(model: Model | undefined): string {
  if (!model) return "vs yesterday";
  if (model.range !== "day") return `vs prior ${model.n} days`;
  return model.cut ? "vs this time yesterday" : "vs the day before";
}

/**
 * Single-day wording for insight copy written for periods ("per active day",
 * "the period before"), and the right comparison name for ranges.
 */
function periodWording(i: Insight, model: Model): Insight {
  const before = model.range === "day" ? (model.cut ? "this time yesterday" : "the day before") : `the ${model.n} days before`;
  let body = i.body.replace(/the period before/g, before);
  if (model.range === "day") body = body.replace(/,? about [^.]*? per active day\./, ".").replace(/ per active day/g, "").replace(/^That hour averages /, "That hour had ");
  return body === i.body ? i : { ...i, body };
}

// ------------------------------------------------------------------ View

type SheetKind = "score" | "blocks" | null;

export function StatsView() {
  const initial = useMemo(readHash, []);
  const [range, setRange] = useState<Range>(initial.range);
  const [day, setDay] = useState(initial.day);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const settings = useApp((s) => s.settings);
  const setView = useApp((s) => s.setView);
  const today = startOfDay(Date.now());
  const isToday = day === today;
  const goalMs = settings.dailyFocusGoalMinutes * 60_000;
  const budgetMs = settings.distractionBudgetMinutes * 60_000;

  useEffect(() => writeHash(range, day), [range, day]);

  const wantKey = range === "day" ? `day:${day}` : `${range}:${today}`;
  const { data } = useQuery<Model>(() => (range === "day" ? loadDay(day) : loadRange(range, today)), [range, day, today]);
  const stale = !!data && data.key !== wantKey;

  const derived = useMemo(() => {
    if (!data) return null;
    const dayMode = data.range === "day";
    let insights: Insight[] = generateInsights({
      days: data.days,
      prevDays: data.prevDays,
      hourly: data.hourly,
      entities: data.entities,
      prevEntities: data.prevEntities,
      sessions: data.sessions,
      goalMs,
      periodLabel: dayMode ? (data.first === today ? "today" : "that day") : data.n === 7 ? "this week" : `in ${data.n} days`,
    });
    // The hero already carries the productive-time trend.
    insights = insights.filter((i) => i.id !== "trend");
    if (dayMode) insights = insights.filter((i) => i.id !== "goal" && i.id !== "weekday" && i.id !== "late");
    // App switching has no tile of its own; keep the middle ground visible here too.
    const activeHours = data.now.activeMs / HOUR;
    if (activeHours >= 2 && !insights.some((i) => i.id === "switching")) {
      insights.push({
        id: "switching",
        tone: "neutral",
        icon: "shuffle",
        weight: 30,
        title: `About ${Math.round(data.now.switches / activeHours)} app switches an hour`,
        body: "A healthy middle ground. Batching chat and email between blocks keeps it there.",
      });
    }
    insights = insights.map((i) => periodWording(i, data)).sort((a, b) => b.weight - a.weight);
    return {
      insights,
      persona: dayMode ? null : focusPersona(data.days, data.hourly),
      grid: dayMode ? null : rhythmMatrix(data.hourly),
      streak: goalStreak(data.days, goalMs),
    };
  }, [data, goalMs, today]);

  const go = (d: number) => setDay(Math.min(today, d));
  const pickRange = (r: Range) => {
    if (r === "day" && range !== "day") setDay(today);
    setRange(r);
  };

  /** Apps & sites opens on the same period (Today / 7 / 30 days). */
  const openApps = () => {
    const r = range === "day" ? (isToday ? 1 : null) : range;
    setView("apps");
    if (r) window.history.replaceState(null, "", `#/apps?r=${r}`);
  };

  const dayMode = range === "day";
  const dim = dayMode
    ? isToday
      ? "today."
      : day === addDays(today, -1)
        ? "yesterday."
        : `on ${longWeekday.format(day)}.`
    : range === 7
      ? "this week."
      : "this month.";

  const whenName = dayMode ? shortDate.format(day) : `${fmtShortDay(addDays(today, -(range - 1)))} – ${fmtShortDay(today)}`;
  const shownDayMode = !data || data.range === "day";
  const focusSessions = (data?.sessions ?? []).filter((s) => s.kind === "focus");

  return (
    <div className={cx("stats", stale && "refreshing")}>
      <TopBar
        left={
          <div className="stats-when">
            <div className="who-name">{whenName}</div>
            {dayMode && !isToday ? (
              <button className="who-sub stats-back" onClick={() => go(today)}>
                Back to today
              </button>
            ) : (
              <div className="who-sub">{dayMode ? "Tracked privately" : `vs the ${range} days before`}</div>
            )}
          </div>
        }
        right={
          <>
            {dayMode && (
              <div className="stats-daynav">
                <button className="circle-btn" aria-label="Previous day" title="Previous day" onClick={() => go(addDays(day, -1))}>
                  <ChevronLeft />
                </button>
                <button className="circle-btn" aria-label="Next day" title="Next day" disabled={isToday} onClick={() => go(addDays(day, 1))}>
                  <ChevronRight />
                </button>
              </div>
            )}
            <button className="circle-btn" aria-label="Apps & sites" title="Apps & sites" onClick={openApps}>
              <AppWindow />
            </button>
          </>
        }
      />

      {/* Desktop: two columns. Below 1024px the columns dissolve and the o-* classes set the order. */}
      <div className={cx("stats-grid", shownDayMode ? "is-day" : "is-range")}>
        <div className="stats-main">
          <div className="stats-intro o-1">
            <PageTitle strong="Your progress," dim={dim} />
            <div className="stats-tabs">
              <PillTabs<Range>
                label="Period"
                value={range}
                onChange={pickRange}
                options={[
                  { value: "day", label: dayMode ? relativeDayLabel(day) : "Today" },
                  { value: 7, label: "7 days" },
                  { value: 30, label: "30 days" },
                ]}
              />
            </div>
          </div>

          <div className="o-2">
            <Hero model={data} onScore={() => setSheet("score")} />
          </div>

          {shownDayMode ? (
            <div className="o-4">{data && <DayChart model={data} />}</div>
          ) : (
            <>
              <div className="o-5">
                <RangeChart model={data} goalMs={goalMs} grid={derived?.grid ?? null} />
              </div>
              <Insights className="o-6" insights={derived?.insights ?? null} />
            </>
          )}
        </div>

        <div className="stats-side">
          <div className="o-3">
            <Tiles model={data} streak={derived?.streak ?? 0} goalMs={goalMs} budgetMs={budgetMs} onFocus={shownDayMode ? () => setSheet("blocks") : undefined} />
          </div>
          {!shownDayMode && data && (
            <div className="o-4">
              <PersonaCard persona={derived?.persona ?? null} range={data.n} activeHours={data.now.activeMs / HOUR} />
            </div>
          )}
          <div className={cx("stats-apps-slot", shownDayMode ? "o-6" : "o-7")}>
            <TopApps model={data} onSeeAll={openApps} />
          </div>
        </div>

        {shownDayMode && <Insights className="o-5 stats-insights-wide" insights={derived?.insights ?? null} columns />}
      </div>

      {sheet === "score" && data && <ScoreSheet model={data} onClose={() => setSheet(null)} />}
      {sheet === "blocks" && (
        <FocusBlocksSheet
          sessions={focusSessions}
          isToday={data ? data.first === today : true}
          onClose={() => setSheet(null)}
          onStart={() => {
            setSheet(null);
            setView("home");
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Hero

function Hero({ model, onScore }: { model: Model | undefined; onScore: () => void }) {
  const now = model?.now;
  const before = model?.before;
  const dayMode = !model || model.range === "day";

  let headline = 0;
  let delta: number | null = null;
  let sub = "";
  if (model && now && before) {
    if (dayMode) {
      headline = now.productiveMs;
      delta = before.productiveMs > 0 ? pctChange(now.productiveMs, before.productiveMs) : null;
      sub = now.activeMs > 0 ? `${Math.round((now.productiveMs / now.activeMs) * 100)}% of ${fmtDuration(now.activeMs)} active` : "Nothing tracked yet";
    } else {
      headline = perDay(now.productiveMs, now.activeDays);
      delta = pctChange(headline, perDay(before.productiveMs, before.activeDays));
      sub = now.activeMs > 0 ? "a day, on average" : "Nothing tracked yet";
    }
  }
  // Ranges headline a daily average, so the split under it is per day too.
  const per = (ms: number) => (dayMode ? ms : perDay(ms, now?.activeDays ?? 0));
  const split = [
    { name: "Productive", color: "#fff", ms: per(now?.productiveMs ?? 0) },
    { name: "Neutral", color: "rgba(255,255,255,.42)", ms: per(now?.neutralMs ?? 0) },
    { name: "Distracting", color: "#ffae9b", ms: per(now?.distractingMs ?? 0) },
  ];
  const compact = useMediaQuery("(max-width: 760px)");
  const score = now?.score ?? null;

  return (
    <section className="card hero stats-hero" aria-label="Summary">
        <div className="stats-hero-top">
          <span className="stats-hero-label">Productive time</span>
          {delta !== null && (
            <span className="stats-hero-delta">
              <Delta value={delta} />
              <span>{vsLabel(model)}</span>
            </span>
          )}
        </div>

        <div className="stats-hero-body">
          <div className="stats-hero-figure">
            <div className="stats-hero-number">
              <Dur ms={headline} />
            </div>
            <div className="stats-hero-sub">{sub || " "}</div>
          </div>
          <button
            type="button"
            className="stats-hero-score"
            onClick={onScore}
            disabled={!model}
            aria-haspopup="dialog"
            aria-label={score === null ? "Productivity score: not enough data yet. What it means" : `Productivity score ${score} out of 100. What it means`}
            title="What's the score?"
          >
            <ScoreRing value={score} onBrand size={compact ? 68 : 80} stroke={compact ? 6 : 7} />
          </button>
        </div>

        <div className="stats-hero-split">
          <ProportionBar p={split[0].ms} n={split[1].ms} d={split[2].ms} height={10} onBrand />
          <dl className="stats-hero-legend">
            {split.map((s) => (
              <div key={s.name}>
                <dt>
                  <span className="swatch" style={{ background: s.color }} />
                  {s.name}
                </dt>
                <dd>{fmtDuration(s.ms)}</dd>
              </div>
            ))}
          </dl>
        </div>
    </section>
  );
}

function ScoreSheet({ model, onClose }: { model: Model; onClose: () => void }) {
  const dayMode = model.range === "day";
  const isToday = model.first === startOfDay(Date.now());
  const now = model.now.score;
  const before = model.before.score;
  const change = now !== null && before !== null ? now - before : null;
  const nowLabel = dayMode ? (isToday ? "Today so far" : shortDate.format(model.first)) : `Last ${model.n} days`;
  const beforeLabel = dayMode ? (model.cut ? "Yesterday by now" : "The day before") : `${model.n} days before`;
  return (
    <Sheet label="Productivity score" onClose={onClose}>
      <div className="score-sheet">
        <ScoreRing value={now} size={104} stroke={9} />
        <h2 className="title">Productivity score</h2>
        <p className="score-sheet-text">
          A 0–100 read of how your active time was spent. Productive time counts fully, neutral time half, distracting time not at all.
        </p>
        <div className="score-sheet-compare">
          <div>
            <span className="label">{nowLabel}</span>
            <strong>{now ?? "–"}</strong>
          </div>
          <div>
            <span className="label">{beforeLabel}</span>
            <strong>{before ?? "–"}</strong>
          </div>
        </div>
        {change !== null && (
          <p className="score-sheet-change">
            <Delta value={change} format={(v) => `${v} pts`} /> {vsLabel(model)}
          </p>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Tiles

function Tiles({
  model,
  streak,
  goalMs,
  budgetMs,
  onFocus,
}: {
  model: Model | undefined;
  streak: number;
  goalMs: number;
  budgetMs: number;
  /** Day mode: the focus tile opens the day's focus blocks. */
  onFocus?: () => void;
}) {
  const now = model?.now;
  const dayMode = !model || model.range === "day";
  const days = model?.days ?? [];
  const eligible = days.filter((d) => d.activeMs >= 30 * MINUTE);

  // Focus: the day's total, or a per-day average for ranges (same unit as the meter and the next tile).
  const focusMs = now?.focusMs ?? 0;
  const focusAvg = dayMode ? focusMs : perDay(focusMs, now?.activeDays ?? 0);
  const focusMeter = goalMs ? focusAvg / goalMs : 0;
  const focusFoot = dayMode
    ? now?.sessions
      ? `${now.completed} of ${now.sessions} block${now.sessions === 1 ? "" : "s"} done`
      : `Goal ${fmtDuration(goalMs)}`
    : `${fmtDuration(focusMs)} total · goal ${fmtDuration(goalMs)}`;

  // Distracting vs budget
  const distractMs = dayMode ? (now?.distractingMs ?? 0) : perDay(now?.distractingMs ?? 0, now?.activeDays ?? 0);
  const underBudget = eligible.filter((d) => d.distractingMs <= budgetMs).length;
  const distractFoot = !budgetMs
    ? "No budget set"
    : dayMode
      ? distractMs <= budgetMs
        ? `${fmtDuration(budgetMs - distractMs)} left of ${fmtDuration(budgetMs)}`
        : `${fmtDuration(distractMs - budgetMs)} over budget`
      : eligible.length
        ? `In budget ${underBudget} of ${eligible.length} days`
        : `Budget ${fmtDuration(budgetMs)} a day`;

  return (
    <div className="stats-tiles">
      <Tile
        tint
        icon={<Timer />}
        iconClass="brand-solid"
        value={<TileDur ms={focusAvg} />}
        label={dayMode ? "Focus time" : "Focus a day"}
        meter={Math.min(1, focusMeter)}
        meterClass={focusMeter >= 1 ? "done" : undefined}
        foot={focusFoot}
        onClick={onFocus}
        badge={
          !dayMode && streak > 0 ? (
            <span className="badge warn">
              <Flame />
              {streak}d streak
            </span>
          ) : undefined
        }
      />
      <Tile
        icon={<Hourglass />}
        iconClass="warn"
        value={<TileDur ms={distractMs} />}
        label={dayMode ? "Distracting" : "Distracting a day"}
        meter={budgetMs ? Math.min(1, distractMs / budgetMs) : undefined}
        meterClass="distracting"
        foot={distractFoot}
      />
    </div>
  );
}

function Tile({
  icon,
  iconClass,
  value,
  label,
  meter,
  meterClass,
  foot,
  tint,
  badge,
  onClick,
}: {
  icon: ReactNode;
  iconClass?: string;
  value: ReactNode;
  label: string;
  meter?: number;
  meterClass?: string;
  foot: string;
  tint?: boolean;
  badge?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="tile-top">
        <span className={cx("icon-tile round", iconClass)}>{icon}</span>
        {badge}
        {onClick && (
          <span className="tile-go" aria-hidden>
            <ChevronRight />
          </span>
        )}
      </span>
      <span className="big-number">{value}</span>
      <span className="tile-label">{label}</span>
      {meter !== undefined && (
        <span className={cx("meter", meterClass)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter * 100)}>
          <span style={{ width: `${meter * 100}%` }} />
        </span>
      )}
      <span className="tile-foot">{foot}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={cx("card tile tile-button", tint && "tint")} onClick={onClick} aria-haspopup="dialog">
      {body}
    </button>
  ) : (
    <div className={cx("card tile", tint && "tint")}>{body}</div>
  );
}

// ------------------------------------------------------------------ Charts

const ACTIVITY_SERIES = [SERIES.productive, SERIES.neutral, SERIES.distracting];
/** Ended-early focus blocks are drawn hollow; the swatch matches. */
const PARTIAL_SWATCH = "radial-gradient(circle, var(--surface) 0 2.6px, var(--focus-mark) 3.1px)";

function DayChart({ model }: { model: Model }) {
  const [mode, setMode] = useState<"hours" | "timeline">("hours");
  const isToday = model.first === startOfDay(Date.now());
  const [h0, h1] = useMemo(() => activeHourRange(model.spans, model.first, 10), [model.spans, model.first]);
  const spans = model.spans;
  const hourly = model.hourly;
  const focus = model.sessions.filter((s) => s.kind === "focus");
  const timelineLegend = [
    ...ACTIVITY_SERIES,
    { name: "Focus block", color: FOCUS_COLOR },
    ...(focus.some((s) => !s.completed) ? [{ name: "Ended early", color: PARTIAL_SWATCH }] : []),
  ];
  return (
    <section className="card stats-chart" aria-labelledby="day-chart-title">
      <div className="card-head stats-chart-head">
        <div>
          <h2 className="card-title" id="day-chart-title">
            Your day
          </h2>
          <div className="card-sub">
            {spans.length ? `${fmtTime(spans[0].start)} – ${fmtTime(spans[spans.length - 1].end)} · ${fmtDuration(model.now.activeMs)} active` : "Nothing recorded yet"}
          </div>
        </div>
        {spans.length > 0 && (
          <Segmented
            label="Chart"
            value={mode}
            onChange={setMode}
            options={[
              { value: "hours", label: "Hours" },
              { value: "timeline", label: "Timeline" },
            ]}
          />
        )}
      </div>
      {spans.length ? (
        mode === "hours" ? (
          <>
            <Legend className="stats-legend" items={[...ACTIVITY_SERIES]} />
            <StackedColumns
              caption="Time per hour by productivity"
              height={196}
              series={ACTIVITY_SERIES}
              labelEvery={h1 - h0 > 12 ? 2 : 1}
              gridLines={2}
              data={hourly.slice(h0, h1).map((h, i) => ({
                key: h0 + i,
                label: fmtHour(h0 + i),
                title: `${fmtHour(h0 + i)} – ${fmtHour((h0 + i + 1) % 24)}`,
                values: [h.productiveMs, h.neutralMs, h.distractingMs],
                note: h.switches ? `${h.switches} switches` : undefined,
              }))}
            />
          </>
        ) : (
          <>
            <Legend className="stats-legend" items={timelineLegend} />
            <div className="stats-timeline">
              <DayTimeline day={model.first} spans={spans} sessions={model.sessions} hours={[h0, h1]} />
            </div>
          </>
        )
      ) : (
        <div className="empty stats-empty">
          <Buddy mood="sleep" size={84} />
          <strong>{isToday ? "Nothing tracked yet today" : "No activity recorded"}</strong>
          {isToday ? "Kairo quietly notes which app is in front. Check back in a bit." : "Kairo wasn't running, or you were away."}
        </div>
      )}
    </section>
  );
}

type RangeMode = "activity" | "focus" | "rhythm";

function RangeChart({ model, goalMs, grid }: { model: Model | undefined; goalMs: number; grid: RhythmCell[][] | null }) {
  const [mode, setMode] = useState<RangeMode>("activity");
  const n = model?.n ?? 7;
  const days = model?.days ?? [];
  const labelEvery = n <= 7 ? 1 : 5;
  const label = (d: number) => (n <= 7 ? fmtWeekday(d) : fmtShortDay(d));
  const title = (d: number) => `${fmtWeekday(d)}, ${fmtShortDay(d)}`;
  const sub =
    mode === "activity" ? "Active time, split by productivity" : mode === "focus" ? `Focus time against your ${fmtDuration(goalMs)} goal` : "When you focus best, by weekday and hour";
  return (
    <section className="card stats-chart" aria-labelledby="range-chart-title">
      <div className="card-head stats-chart-head">
        <div>
          <h2 className="card-title" id="range-chart-title">
            {n <= 7 ? "Your week" : "Your month"}
          </h2>
          <div className="card-sub">{sub}</div>
        </div>
        <Segmented<RangeMode>
          label="Chart"
          value={mode}
          onChange={setMode}
          options={[
            { value: "activity", label: "Activity" },
            { value: "focus", label: "Focus" },
            { value: "rhythm", label: "Rhythm" },
          ]}
        />
      </div>
      {mode === "activity" ? (
        <>
          <Legend className="stats-legend" items={[...ACTIVITY_SERIES]} />
          <StackedColumns
            caption="Daily active time by productivity"
            height={232}
            labelEvery={labelEvery}
            series={ACTIVITY_SERIES}
            data={days.map((x) => ({
              key: x.day,
              label: label(x.day),
              title: title(x.day),
              values: [x.productiveMs, x.neutralMs, x.distractingMs],
              note: x.score !== null ? `score ${x.score}` : undefined,
            }))}
          />
        </>
      ) : mode === "focus" ? (
        <StackedColumns
          caption="Focus time per day against the daily goal"
          height={232 + 36}
          labelEvery={labelEvery}
          series={[{ name: "Focus", color: "var(--brand)" }]}
          reference={goalMs ? { value: goalMs, label: `Goal ${fmtDuration(goalMs)}` } : undefined}
          data={days.map((x) => ({
            key: x.day,
            label: label(x.day),
            title: title(x.day),
            values: [x.focusMs],
            note: `${x.completed} of ${x.sessions} blocks completed`,
          }))}
        />
      ) : (
        grid && <Heatmap grid={grid} caption="Average productive time per weekday and hour" />
      )}
    </section>
  );
}

// ------------------------------------------------------------------ Top apps & sites

type AppsMode = "apps" | "categories" | "leaks";

function TopApps({ model, onSeeAll }: { model: Model | undefined; onSeeAll: () => void }) {
  const [mode, setMode] = useState<AppsMode>("apps");
  const entities = model?.entities ?? [];
  const activeDays = Math.max(1, model?.now.activeDays ?? 1);
  const dayMode = !model || model.range === "day";

  let rows: BarRow[] = [];
  if (mode === "apps") {
    rows = entities.slice(0, 5).map((e) => {
      const name = entityName(e.kind, e.key, e.name);
      return {
        key: `${e.kind}:${e.key}`,
        icon: <Avatar name={name} productivity={e.productivity} size={42} />,
        label: name,
        sub: categoryLabel(e.category),
        value: e.ms,
        productivity: e.productivity,
      };
    });
  } else if (mode === "categories") {
    rows = categoryTotals(entities)
      .slice(0, 5)
      .map((c) => ({
        key: c.category,
        icon: <Avatar name={categoryLabel(c.category)} productivity={c.productivity} size={42} />,
        label: categoryLabel(c.category),
        sub: PRODUCTIVITY_LABEL[Math.sign(c.productivity) as -1 | 0 | 1],
        value: c.ms,
        productivity: c.productivity,
      }));
  } else {
    rows = entities
      .filter((e) => e.productivity < 0)
      .slice(0, 5)
      .map((e) => {
        const name = entityName(e.kind, e.key, e.name);
        const prev = model?.prevEntities.find((p) => p.key === e.key && p.kind === e.kind);
        return {
          key: `${e.kind}:${e.key}`,
          icon: <Avatar name={name} productivity={e.productivity} size={42} />,
          label: name,
          sub: dayMode ? categoryLabel(e.category) : `${categoryLabel(e.category)} · ${fmtDuration(e.ms / activeDays)} a day`,
          value: e.ms,
          productivity: e.productivity,
          trailing: <Delta value={prev ? pctChange(e.ms, prev.ms) : null} goodWhenUp={false} />,
        };
      });
  }

  return (
    <section className="card stats-apps" aria-labelledby="apps-title">
      <div className="card-head">
        <div>
          <h2 className="card-title" id="apps-title">
            Top apps & sites
          </h2>
          <div className="card-sub">
            {entities.length} used {dayMode ? "that day" : `in ${model?.n} days`}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm card-link" onClick={onSeeAll}>
          See all
        </button>
      </div>
      <Segmented<AppsMode>
        label="Group by"
        value={mode}
        onChange={setMode}
        options={[
          { value: "apps", label: "Apps & sites" },
          { value: "categories", label: "Categories" },
          { value: "leaks", label: "Time leaks" },
        ]}
      />
      <div className="stats-apps-list">
        <BarList
          rows={rows}
          empty={
            <div className="empty">
              <strong>{mode === "leaks" ? "No leaks" : "Nothing here yet"}</strong>
              {mode === "leaks" ? "Nothing distracting recorded. Lovely." : "Apps and sites show up as you use them."}
            </div>
          }
        />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Insights

function Insights({ insights, className, columns }: { insights: Insight[] | null; className?: string; columns?: boolean }) {
  return (
    <section className={cx("stats-insights", className)} aria-labelledby="insights-title">
      <h2 className="section-title" id="insights-title">
        Worth noticing
      </h2>
      {insights === null ? null : insights.length ? (
        <InsightList insights={insights} limit={3} columns={columns} />
      ) : (
        <div className="card soft stats-insights-empty">
          <span className="icon-tile round">
            <Sparkles />
          </span>
          <div>
            <div className="insight-title">Not enough to go on yet</div>
            <div className="card-sub">A bit more tracking and Kairo will start spotting patterns.</div>
          </div>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ Focus blocks (day) — opened from the Focus tile

function FocusBlocksSheet({ sessions, isToday, onClose, onStart }: { sessions: FocusSession[]; isToday: boolean; onClose: () => void; onStart: () => void }) {
  const ordered = [...sessions].reverse();
  const done = sessions.filter((s) => s.completed).length;
  const total = sessions.reduce((a, s) => a + s.actualMs, 0);
  return (
    <Sheet label="Focus blocks" onClose={onClose}>
      <div className="stats-sheet">
        <div className="stats-sheet-head">
          <h2 className="title">Focus blocks</h2>
          <div className="card-sub">{sessions.length ? `${done} of ${sessions.length} completed · ${fmtDuration(total)}` : isToday ? "None yet today" : "None that day"}</div>
        </div>
        {sessions.length ? (
          <ul className="list">
            {ordered.map((s) => (
              <li key={s.id} className="list-row block-row">
                <span className={cx("block-check", s.completed && "done")} aria-label={s.completed ? "Completed" : "Ended early"}>
                  {s.completed && <Check />}
                </span>
                <div className="list-main">
                  <div className="list-title">{s.intention || "Untitled focus block"}</div>
                  <div className="list-sub">
                    {fmtTime(s.start)} · {s.completed ? "Completed" : "Ended early"}
                    {s.interruptions ? ` · ${s.interruptions} detour${s.interruptions > 1 ? "s" : ""}` : ""}
                  </div>
                </div>
                <span className="list-trail">{fmtDuration(s.actualMs)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <Buddy mood="idle" size={64} />
            <strong>No focus blocks</strong>
            {isToday ? "Start one from Home and it lands here with your intention." : "Nothing was timed that day."}
            {isToday && (
              <button className="btn btn-soft btn-sm" style={{ marginTop: 8 }} onClick={onStart}>
                Start a block
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Persona (7 / 30 days)

function PersonaCard({ persona, range, activeHours }: { persona: Persona | null; range: number; activeHours: number }) {
  const toast = useApp((s) => s.toast);
  const [saving, setSaving] = useState(false);
  return (
    <section className="card persona-card" aria-labelledby="persona-title">
      <div className="persona-head">
        <Buddy mood={persona ? "happy" : "sleep"} tone="violet" size={80} />
        <div className="persona-id">
          <div className="label">Your focus persona</div>
          <h2 className="persona-name" id="persona-title">
            {persona ? persona.name : "Still getting to know you"}
          </h2>
        </div>
      </div>
      {persona ? (
        <>
          <p className="persona-tagline">{persona.tagline}</p>
          <div className="persona-traits">
            {persona.traits.map((t) => (
              <div key={t.label} className="persona-trait">
                <div className="persona-trait-value">{t.value}</div>
                <div className="persona-trait-label">{t.label}</div>
              </div>
            ))}
          </div>
          <ul className="persona-tips">
            {persona.tips.map((t) => (
              <li key={t}>
                <Check />
                {t}
              </li>
            ))}
          </ul>
          <div className="persona-foot">
            <span className="persona-note">Based on the last {range} days</span>
            <button
              className="btn btn-dark btn-sm"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const ok = await exportPersonaCard(persona, range, activeHours);
                  if (ok) toast({ title: "Card saved", body: "Share it wherever you like. It's an image, with no data attached.", tone: "success" });
                } catch (e) {
                  toast({ title: "Couldn't save the card", body: String(e), tone: "warning" });
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Download /> Save card
            </button>
          </div>
        </>
      ) : (
        <p className="persona-tagline">Your persona appears after a couple of hours of productive work.</p>
      )}
    </section>
  );
}
