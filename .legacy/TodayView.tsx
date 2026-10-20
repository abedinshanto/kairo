import { Check, ChevronLeft, ChevronRight, Shuffle, Timer, TriangleAlert, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { BarList, ProportionBar } from "../components/charts/Bars";
import { DayTimeline } from "../components/charts/DayTimeline";
import { SERIES } from "../components/charts/common";
import { StackedColumns } from "../components/charts/StackedColumns";
import { InsightList } from "../components/InsightList";
import { PageHeader } from "../components/PageHeader";
import { Delta, Monogram, cx } from "../components/ui";
import { buildDayStats, categoryTotals } from "../lib/analytics";
import { backend } from "../lib/backend";
import { categoryLabel, entityName, PRODUCTIVITY_LABEL } from "../lib/categories";
import { useQuery } from "../lib/hooks";
import { generateInsights } from "../lib/insights";
import { useApp } from "../lib/store";
import { addDays, fmtDay, fmtDuration, fmtHour, fmtTime, hourBuckets, HOUR, relativeDayLabel, startOfDay } from "../lib/time";

export function TodayView() {
  const today = startOfDay(Date.now());
  const [day, setDay] = useState(dayParam);
  const settings = useApp((s) => s.settings);
  const setView = useApp((s) => s.setView);
  const isToday = day === today;
  const next = addDays(day, 1);
  const prev = addDays(day, -1);

  const { data, loading } = useQuery(async () => {
    const hours = hourBuckets(day);
    const [totals, spans, sessions, entities] = await Promise.all([
      backend.bucketTotals([[prev, day], [day, next], ...hours]),
      backend.activitySpans(day, next),
      backend.focusSessions(prev, next),
      backend.entityTotals(day, next),
    ]);
    return { hours, totals, spans, sessions, entities };
  }, [day]);

  const derived = useMemo(() => {
    if (!data) return null;
    const [yTotals, dTotals, ...hourly] = data.totals;
    const [yesterday, todayStat] = buildDayStats(
      [
        [prev, day],
        [day, next],
      ],
      [yTotals, dTotals],
      data.sessions,
      hourly,
    );
    const daySessions = data.sessions.filter((s) => s.start >= day);
    const insights = generateInsights({
      days: [todayStat],
      prevDays: [yesterday],
      hourly,
      entities: data.entities,
      prevEntities: [],
      sessions: daySessions,
      goalMs: settings.dailyFocusGoalMinutes * 60_000,
      periodLabel: isToday ? "today" : "that day",
    }).filter((i) => i.id !== "goal" && i.id !== "weekday" && i.id !== "late");
    return { hourly, today: todayStat, yesterday, daySessions, insights, categories: categoryTotals(data.entities) };
  }, [data, day, prev, next, settings.dailyFocusGoalMinutes, isToday]);

  const go = (d: number) => {
    window.history.replaceState(null, "", d === today ? "#/today" : `#/today?d=${d}`);
    setDay(d);
  };

  const s = derived?.today;
  const y = derived?.yesterday;
  const score = s?.score ?? null;
  const yScore = y?.score ?? null;
  const goal = settings.dailyFocusGoalMinutes * 60_000;
  const budget = settings.distractionBudgetMinutes * 60_000;
  const activeHours = s ? s.activeMs / HOUR : 0;

  return (
    <div className={cx("fade-frame", loading && data && "refreshing")}>
      <PageHeader
        title={relativeDayLabel(day)}
        subtitle={fmtDay(day)}
        actions={
          <div className="day-nav">
            <button className="icon-btn" aria-label="Previous day" onClick={() => go(prev)}>
              <ChevronLeft />
            </button>
            <button className="btn btn-secondary btn-sm" disabled={isToday} onClick={() => go(today)}>
              Today
            </button>
            <button className="icon-btn" aria-label="Next day" disabled={isToday} onClick={() => go(next)}>
              <ChevronRight />
            </button>
          </div>
        }
      />

      <div className="grid-hero">
        <div className="card hero-card">
          <div className="eyebrow">Productive time</div>
          <div className="hero-value">{fmtDuration(s?.productiveMs ?? 0)}</div>
          <div className="hero-meta">
            <Delta value={y && y.productiveMs > 0 && s ? (s.productiveMs - y.productiveMs) / y.productiveMs : null} suffix="vs. day before" />
          </div>
          <ProportionBar p={s?.productiveMs ?? 0} n={s?.neutralMs ?? 0} d={s?.distractingMs ?? 0} height={10} />
          <div className="legend" style={{ marginTop: 12 }}>
            {(["productive", "neutral", "distracting"] as const).map((k) => (
              <span key={k} className="legend-item">
                <span className="swatch" style={{ background: SERIES[k].color }} />
                {SERIES[k].name}
                <span className="faint tabular">{fmtDuration(s ? (k === "productive" ? s.productiveMs : k === "neutral" ? s.neutralMs : s.distractingMs) : 0)}</span>
              </span>
            ))}
          </div>
          <div className="score">
            <ScoreRing value={score} />
            <div>
              <div className="score-label">Productivity score</div>
              <div className="faint score-desc">
                Productive time counts fully, neutral time half.{" "}
                {score !== null && yScore !== null && (
                  <Delta value={(score - yScore) / 100} format={(v) => `${Math.round(v * 100)} pts`} />
                )}
              </div>
            </div>
          </div>
        </div>

        <Stat icon={<Timer />} label="Focus time" value={fmtDuration(s?.focusMs ?? 0)} foot={`${s?.completed ?? 0} of ${s?.sessions ?? 0} blocks completed`} meter={goal ? (s?.focusMs ?? 0) / goal : undefined} />
        <Stat icon={<Zap />} label="Active time" value={fmtDuration(s?.activeMs ?? 0)} foot={s && s.activeMs ? `First seen ${fmtTime(data!.spans[0]?.start ?? day)}` : "No activity yet"} />
        <Stat
          icon={<TriangleAlert />}
          label="Distracting"
          value={fmtDuration(s?.distractingMs ?? 0)}
          foot={budget ? ((s?.distractingMs ?? 0) <= budget ? `${fmtDuration(budget - (s?.distractingMs ?? 0))} left in budget` : `${fmtDuration((s?.distractingMs ?? 0) - budget)} over budget`) : "No budget set"}
          meter={budget ? (s?.distractingMs ?? 0) / budget : undefined}
          meterTone="distracting"
        />
        <Stat icon={<Shuffle />} label="App switches" value={String(s?.switches ?? 0)} foot={activeHours >= 0.5 ? `${Math.round((s?.switches ?? 0) / activeHours)} per active hour` : "Too early to tell"} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Timeline</div>
            <div className="card-sub">Hover to see what you were doing. Gaps are time away or idle.</div>
          </div>
          <div className="legend">
            <span className="legend-item"><span className="swatch" style={{ background: "var(--productive)" }} />Productive</span>
            <span className="legend-item"><span className="swatch" style={{ background: "var(--neutral)" }} />Neutral</span>
            <span className="legend-item"><span className="swatch" style={{ background: "var(--distracting)" }} />Distracting</span>
            <span className="legend-item"><span className="swatch focus-swatch" />Focus block</span>
          </div>
        </div>
        {data && data.spans.length ? (
          <DayTimeline day={day} spans={data.spans} sessions={derived?.daySessions ?? []} />
        ) : (
          <div className="empty">
            <strong>{isToday ? "Nothing tracked yet today" : "No activity recorded"}</strong>
            {isToday ? "Kairo is quietly watching which app is in front. Check back in a bit." : "Kairo wasn't running, or you were away."}
          </div>
        )}
      </div>

      <div className="grid-2-1">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Hour by hour</div>
              <div className="card-sub">Where the day's attention went</div>
            </div>
          </div>
          <StackedColumns
            caption="Time per hour by productivity"
            series={[SERIES.productive, SERIES.neutral, SERIES.distracting]}
            labelEvery={3}
            data={(derived?.hourly ?? []).map((h, i) => ({
              key: i,
              label: fmtHour(i),
              title: `${fmtHour(i)} – ${fmtHour((i + 1) % 24)}`,
              values: [h.productiveMs, h.neutralMs, h.distractingMs],
              note: h.switches ? `${h.switches} switches` : undefined,
            }))}
          />
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Top apps & sites</div>
              <div className="card-sub">{data?.entities.length ?? 0} used</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setView("apps")}>
              See all
            </button>
          </div>
          <BarList
            rows={(data?.entities ?? []).slice(0, 7).map((e) => ({
              key: `${e.kind}:${e.key}`,
              icon: <Monogram name={entityName(e.kind, e.key, e.name)} kind={e.kind} />,
              label: entityName(e.kind, e.key, e.name),
              value: e.ms,
              productivity: e.productivity,
            }))}
            empty={<div className="empty">No apps yet</div>}
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Categories</div>
          </div>
          <BarList
            rows={(derived?.categories ?? []).slice(0, 8).map((c) => ({
              key: c.category,
              label: categoryLabel(c.category),
              sub: PRODUCTIVITY_LABEL[(Math.sign(c.productivity) as -1 | 0 | 1)],
              value: c.ms,
              productivity: c.productivity,
            }))}
            empty={<div className="empty">No categories yet</div>}
          />
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Focus blocks</div>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {fmtDuration(s?.focusMs ?? 0)} total
            </span>
          </div>
          <SessionList sessions={(derived?.daySessions ?? []).filter((x) => x.kind === "focus")} />
        </div>
      </div>

      {derived && derived.insights.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Worth noticing</div>
          </div>
          <InsightList insights={derived.insights.slice(0, 4)} />
        </div>
      )}
    </div>
  );
}

function dayParam(): number {
  const m = window.location.hash.match(/[?&]d=(\d+)/);
  const today = startOfDay(Date.now());
  const d = m ? startOfDay(Number(m[1])) : today;
  return d > today ? today : d;
}

function Stat({
  icon,
  label,
  value,
  foot,
  meter,
  meterTone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  foot: string;
  meter?: number;
  meterTone?: "distracting";
}) {
  return (
    <div className="card stat">
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {meter !== undefined && (
        <div className={cx("meter", meterTone === "distracting" ? "meter-distracting" : meter >= 1 && "done")}>
          <span style={{ width: `${Math.min(1, meter) * 100}%` }} />
        </div>
      )}
      <div className="stat-foot">{foot}</div>
    </div>
  );
}

function ScoreRing({ value }: { value: number | null }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <div className="score-ring" aria-label={value === null ? "No score yet" : `Score ${value} out of 100`}>
      <svg width={56} height={56} viewBox="0 0 56 56">
        <circle cx={28} cy={28} r={r} className="score-track" />
        {value !== null && <circle cx={28} cy={28} r={r} className="score-fill" strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 28 28)" />}
      </svg>
      <span>{value ?? "–"}</span>
    </div>
  );
}

export function SessionList({ sessions }: { sessions: { id: number; start: number; actualMs: number; completed: boolean; intention: string; interruptions: number }[] }) {
  if (!sessions.length)
    return (
      <div className="empty">
        <strong>No focus blocks</strong>Start one from the Focus tab. They show up here with your intention.
      </div>
    );
  return (
    <ul className="sessions">
      {[...sessions].reverse().map((s) => (
        <li key={s.id}>
          <span className={cx("session-check", s.completed && "done")}>{s.completed ? <Check /> : null}</span>
          <div className="session-main">
            <div className="session-title">{s.intention || "Untitled focus block"}</div>
            <div className="faint session-meta">
              {fmtTime(s.start)} · {s.completed ? "Completed" : "Ended early"}
              {s.interruptions ? ` · ${s.interruptions} detour${s.interruptions > 1 ? "s" : ""}` : ""}
            </div>
          </div>
          <span className="session-dur tabular">{fmtDuration(s.actualMs)}</span>
        </li>
      ))}
    </ul>
  );
}
