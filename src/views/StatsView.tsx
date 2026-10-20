import { AppWindow, Check, ChevronLeft, ChevronRight, Download, Flame, Hourglass, Shuffle, Sparkles, Timer } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Buddy } from "../components/Buddy";
import { BarList, ProportionBar, type BarRow } from "../components/charts/Bars";
import { Legend, SERIES, FOCUS_COLOR } from "../components/charts/common";
import { activeHourRange, DayTimeline } from "../components/charts/DayTimeline";
import { Heatmap } from "../components/charts/Heatmap";
import { ScoreRing } from "../components/charts/ScoreRing";
import { StackedColumns } from "../components/charts/StackedColumns";
import { InsightList } from "../components/InsightList";
import { Avatar, Delta, PageTitle, PillTabs, Segmented, TopBar, cx } from "../components/ui";
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

function readHash(): { range: Range; day: number } {
  const h = window.location.hash;
  const today = startOfDay(Date.now());
  const r = h.match(/[?&]r=(7|30)\b/);
  const d = h.match(/[?&]d=(\d+)/);
  const day = d ? Math.min(today, startOfDay(Number(d[1]))) : today;
  return { range: r ? (Number(r[1]) as 7 | 30) : "day", day };
}

function writeHash(range: Range, day: number) {
  const today = startOfDay(Date.now());
  const q = range !== "day" ? `?r=${range}` : day !== today ? `?d=${day}` : "";
  window.history.replaceState(null, "", `#/stats${q}`);
}

// ------------------------------------------------------------------ Loading

async function loadDay(day: number): Promise<Model> {
  const prev = addDays(day, -1);
  const next = addDays(day, 1);
  const [totals, spans, sessions, entities, prevEntities] = await Promise.all([
    backend.bucketTotals([[prev, day], [day, next], ...hourBuckets(day)]),
    backend.activitySpans(day, next),
    backend.focusSessions(prev, next),
    backend.entityTotals(day, next),
    backend.entityTotals(prev, day),
  ]);
  const [yTotals, dTotals, ...hourly] = totals;
  const [yesterday, stat] = buildDayStats(
    [
      [prev, day],
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

// ------------------------------------------------------------------ View

export function StatsView() {
  const initial = useMemo(readHash, []);
  const [range, setRange] = useState<Range>(initial.range);
  const [day, setDay] = useState(initial.day);
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
    if (dayMode) insights = insights.filter((i) => i.id !== "goal" && i.id !== "weekday" && i.id !== "late");
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
            <button className="circle-btn" aria-label="Apps & sites" title="Apps & sites" onClick={() => setView("apps")}>
              <AppWindow />
            </button>
          </>
        }
      />

      <div className="stats-grid">
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
            <Hero model={data} />
          </div>

          <div className="o-4">{data && data.range === "day" ? <DayChart model={data} /> : <RangeChart model={data} goalMs={goalMs} />}</div>

          {data && data.range !== "day" && (
            <section className="card o-7" aria-labelledby="rhythm-title">
              <div className="card-head">
                <div>
                  <h2 className="card-title" id="rhythm-title">
                    When you focus best
                  </h2>
                  <div className="card-sub">Average productive time by weekday and hour</div>
                </div>
              </div>
              {derived?.grid && <Heatmap grid={derived.grid as RhythmCell[][]} caption="Average productive time per weekday and hour" />}
            </section>
          )}

          <Insights className="o-5" insights={derived?.insights ?? null} />
        </div>

        <div className="stats-side">
          <div className="o-3">
            <Tiles model={data} streak={derived?.streak ?? 0} goalMs={goalMs} budgetMs={budgetMs} />
          </div>
          <div className="o-6">
            <TopApps model={data} />
          </div>
          {data && data.range !== "day" ? (
            <div className="o-8">
              <PersonaCard persona={derived?.persona ?? null} range={data.n} activeHours={data.now.activeMs / HOUR} />
            </div>
          ) : (
            <div className="o-7">
              <FocusBlocks sessions={(data?.sessions ?? []).filter((s) => s.kind === "focus")} isToday={data ? data.first === today : true} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Hero

function Hero({ model }: { model: Model | undefined }) {
  const now = model?.now;
  const before = model?.before;
  const dayMode = !model || model.range === "day";
  const today = startOfDay(Date.now());

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
  const vs = dayMode ? (model && model.first !== today ? "vs the day before" : "vs yesterday") : `vs prior ${model?.n} days`;
  const scoreDelta = now?.score != null && before?.score != null ? now.score - before.score : null;
  const compact = useMediaQuery("(max-width: 760px)");

  return (
    <div className="stacked">
      <section className="card hero stats-hero" aria-label="Summary">
        <div className="stats-hero-top">
          <span className="chip on-brand">
            <Sparkles />
            Productive time
          </span>
          {delta !== null && (
            <span className="stats-hero-delta">
              <Delta value={delta} />
              <span>{vs}</span>
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
          <div className="stats-hero-score">
            <ScoreRing value={now?.score ?? null} onBrand size={compact ? 88 : 112} stroke={compact ? 8 : 9} title="Productivity score: productive time counts fully, neutral time half." />
            <span className="stats-hero-score-delta">
              {scoreDelta === null ? "Productivity" : scoreDelta === 0 ? "No change" : `${scoreDelta > 0 ? "+" : "−"}${Math.abs(scoreDelta)} pts`}
            </span>
          </div>
        </div>

        <div className="stats-hero-split">
          <ProportionBar p={now?.productiveMs ?? 0} n={now?.neutralMs ?? 0} d={now?.distractingMs ?? 0} height={12} onBrand />
          <Legend
            className="on-brand"
            items={[
              { name: "Productive", color: "#fff", value: fmtDuration(now?.productiveMs ?? 0) },
              { name: "Neutral", color: "rgba(255,255,255,.42)", value: fmtDuration(now?.neutralMs ?? 0) },
              { name: "Distracting", color: "#ffae9b", value: fmtDuration(now?.distractingMs ?? 0) },
            ]}
          />
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ Tiles

function Tiles({ model, streak, goalMs, budgetMs }: { model: Model | undefined; streak: number; goalMs: number; budgetMs: number }) {
  const now = model?.now;
  const dayMode = !model || model.range === "day";
  const days = model?.days ?? [];
  const eligible = days.filter((d) => d.activeMs >= 30 * MINUTE);

  // Focus
  const focusMs = now?.focusMs ?? 0;
  const focusAvg = dayMode ? focusMs : perDay(focusMs, now?.activeDays ?? 0);
  const focusMeter = goalMs ? focusAvg / goalMs : 0;
  const focusFoot = dayMode
    ? now?.sessions
      ? `${now.completed} of ${now.sessions} block${now.sessions === 1 ? "" : "s"} done`
      : `Goal ${fmtDuration(goalMs)}`
    : `${fmtDuration(focusAvg)} a day · goal ${fmtDuration(goalMs)}`;

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

  // Switches
  const activeHours = (now?.activeMs ?? 0) / HOUR;
  const perHour = activeHours >= 0.5 ? Math.round((now?.switches ?? 0) / activeHours) : null;
  const mood = perHour === null ? null : perHour <= 12 ? { label: "Steady", cls: "good" } : perHour >= 25 ? { label: "Scattered", cls: "warn" } : { label: "Balanced", cls: "brand" };
  const firstSeen = dayMode && model?.spans.length ? fmtTime(model.spans[0].start) : null;
  const switchFoot = dayMode
    ? firstSeen
      ? `${now?.switches ?? 0} switches · since ${firstSeen}`
      : "Too early to tell"
    : `${now?.switches ?? 0} switches in ${now?.activeDays ?? 0} active day${now?.activeDays === 1 ? "" : "s"}`;

  return (
    <div className="stats-tiles">
      <Tile
        tint
        icon={<Timer />}
        iconClass="brand-solid"
        value={<TileDur ms={focusMs} />}
        label="Focus time"
        meter={Math.min(1, focusMeter)}
        meterClass={focusMeter >= 1 ? "done" : undefined}
        foot={focusFoot}
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
      <div className="card tile tile-wide">
        <span className="icon-tile round gray">
          <Shuffle />
        </span>
        <div className="tile-wide-main">
          <div className="big-number">
            {perHour ?? "–"}
            <small>/ hour</small>
          </div>
          <div className="tile-label">App switches</div>
          <div className="tile-foot">{switchFoot}</div>
        </div>
        {mood && <span className={cx("badge", mood.cls)}>{mood.label}</span>}
      </div>
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
}) {
  return (
    <div className={cx("card tile", tint && "tint")}>
      <div className="tile-top">
        <span className={cx("icon-tile round", iconClass)}>{icon}</span>
        {badge}
      </div>
      <div className="big-number">{value}</div>
      <div className="tile-label">{label}</div>
      {meter !== undefined && (
        <div className={cx("meter", meterClass)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter * 100)}>
          <span style={{ width: `${meter * 100}%` }} />
        </div>
      )}
      <div className="tile-foot">{foot}</div>
    </div>
  );
}

// ------------------------------------------------------------------ Charts

const ACTIVITY_SERIES = [SERIES.productive, SERIES.neutral, SERIES.distracting];

function DayChart({ model }: { model: Model }) {
  const isToday = model.first === startOfDay(Date.now());
  const [h0, h1] = useMemo(() => activeHourRange(model.spans, model.first, 10), [model.spans, model.first]);
  const spans = model.spans;
  const hourly = model.hourly;
  return (
    <section className="card stats-chart" aria-labelledby="day-chart-title">
      <div className="card-head">
        <div>
          <h2 className="card-title" id="day-chart-title">
            Your day
          </h2>
          <div className="card-sub">
            {spans.length ? `${fmtTime(spans[0].start)} – ${fmtTime(spans[spans.length - 1].end)} · ${fmtDuration(model.now.activeMs)} active` : "Nothing recorded yet"}
          </div>
        </div>
      </div>
      {spans.length ? (
        <>
          <Legend className="stats-legend" items={[...ACTIVITY_SERIES, { name: "Focus block", color: FOCUS_COLOR }]} />
          <DayTimeline day={model.first} spans={spans} sessions={model.sessions} hours={[h0, h1]} axis={false} />
          <div className="stats-chart-gap" />
          <StackedColumns
            caption="Time per hour by productivity"
            height={168}
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
        <div className="empty stats-empty">
          <Buddy mood="sleep" size={84} />
          <strong>{isToday ? "Nothing tracked yet today" : "No activity recorded"}</strong>
          {isToday ? "Kairo quietly notes which app is in front. Check back in a bit." : "Kairo wasn't running, or you were away."}
        </div>
      )}
    </section>
  );
}

function RangeChart({ model, goalMs }: { model: Model | undefined; goalMs: number }) {
  const [mode, setMode] = useState<"activity" | "focus">("activity");
  const n = model?.n ?? 7;
  const days = model?.days ?? [];
  const labelEvery = n <= 7 ? 1 : 5;
  const label = (d: number) => (n <= 7 ? fmtWeekday(d) : fmtShortDay(d));
  const title = (d: number) => `${fmtWeekday(d)}, ${fmtShortDay(d)}`;
  return (
    <section className="card stats-chart" aria-labelledby="range-chart-title">
      <div className="card-head stats-chart-head">
        <div>
          <h2 className="card-title" id="range-chart-title">
            Day by day
          </h2>
          <div className="card-sub">{mode === "activity" ? "Active time, split by productivity" : `Focus time against your ${fmtDuration(goalMs)} goal`}</div>
        </div>
        <Segmented
          label="Chart"
          value={mode}
          onChange={setMode}
          options={[
            { value: "activity", label: "Activity" },
            { value: "focus", label: "Focus" },
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
      ) : (
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
      )}
    </section>
  );
}

// ------------------------------------------------------------------ Top apps & sites

type AppsMode = "apps" | "categories" | "leaks";

function TopApps({ model }: { model: Model | undefined }) {
  const setView = useApp((s) => s.setView);
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
        <button className="btn btn-ghost btn-sm" onClick={() => setView("apps")}>
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

function Insights({ insights, className }: { insights: Insight[] | null; className?: string }) {
  return (
    <section className={cx("stats-insights", className)} aria-labelledby="insights-title">
      <h2 className="section-title" id="insights-title">
        Worth noticing
      </h2>
      {insights === null ? null : insights.length ? (
        <InsightList insights={insights} limit={3} />
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

// ------------------------------------------------------------------ Focus blocks (day)

function FocusBlocks({ sessions, isToday }: { sessions: FocusSession[]; isToday: boolean }) {
  const setView = useApp((s) => s.setView);
  const [all, setAll] = useState(false);
  const ordered = [...sessions].reverse();
  const shown = all ? ordered : ordered.slice(0, 4);
  const done = sessions.filter((s) => s.completed).length;
  const total = sessions.reduce((a, s) => a + s.actualMs, 0);
  return (
    <section className="card stats-blocks" aria-labelledby="blocks-title">
      <div className="card-head">
        <div>
          <h2 className="card-title" id="blocks-title">
            Focus blocks
          </h2>
          <div className="card-sub">{sessions.length ? `${done} of ${sessions.length} completed · ${fmtDuration(total)}` : isToday ? "None yet today" : "None that day"}</div>
        </div>
      </div>
      {sessions.length ? (
        <>
          <ul className="list">
            {shown.map((s) => (
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
          {sessions.length > 4 && (
            <button className="btn btn-ghost btn-sm stats-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
              {all ? "Show less" : `Show all ${sessions.length}`}
            </button>
          )}
        </>
      ) : (
        <div className="empty">
          <Buddy mood="idle" size={64} />
          <strong>No focus blocks</strong>
          {isToday ? "Start one from Home and it lands here with your intention." : "Nothing was timed that day."}
          {isToday && (
            <button className="btn btn-soft btn-sm" style={{ marginTop: 8 }} onClick={() => setView("home")}>
              Start a block
            </button>
          )}
        </div>
      )}
    </section>
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
