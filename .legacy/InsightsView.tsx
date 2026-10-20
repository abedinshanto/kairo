import { Check, Download, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { BarList } from "../components/charts/Bars";
import { SERIES } from "../components/charts/common";
import { Heatmap } from "../components/charts/Heatmap";
import { StackedColumns } from "../components/charts/StackedColumns";
import { InsightList } from "../components/InsightList";
import { PageHeader } from "../components/PageHeader";
import { Delta, Monogram, Segmented, cx } from "../components/ui";
import { buildDayStats, goalStreak, pctChange, rhythmMatrix, sumDays } from "../lib/analytics";
import { backend } from "../lib/backend";
import { categoryLabel, entityName } from "../lib/categories";
import { useQuery } from "../lib/hooks";
import { focusPersona, generateInsights, type Persona } from "../lib/insights";
import { exportPersonaCard } from "../lib/shareCard";
import { useApp } from "../lib/store";
import { addDays, dayBuckets, fmtDuration, fmtShortDay, fmtWeekday, HOUR, startOfDay } from "../lib/time";

type Range = 7 | 30 | 90;

export function InsightsView() {
  const [range, setRange] = useState<Range>(7);
  const goalMin = useApp((s) => s.settings.dailyFocusGoalMinutes);
  const today = startOfDay(Date.now());
  const first = addDays(today, -(range - 1));
  const prevFirst = addDays(first, -range);
  const end = addDays(today, 1);

  const { data, loading } = useQuery(async () => {
    const days = dayBuckets(first, range);
    const prevDays = dayBuckets(prevFirst, range);
    const hours: [number, number][] = days.flatMap(([from]) =>
      Array.from({ length: 24 }, (_, h) => {
        const a = new Date(from);
        a.setHours(h, 0, 0, 0);
        const b = new Date(from);
        b.setHours(h + 1, 0, 0, 0);
        return [a.getTime(), b.getTime()] as [number, number];
      }),
    );
    const [totals, prevTotals, hourly, sessions, prevSessions, entities, prevEntities] = await Promise.all([
      backend.bucketTotals(days),
      backend.bucketTotals(prevDays),
      backend.bucketTotals(hours),
      backend.focusSessions(first, end),
      backend.focusSessions(prevFirst, first),
      backend.entityTotals(first, end),
      backend.entityTotals(prevFirst, first),
    ]);
    return { days, prevDays, totals, prevTotals, hourly, sessions, prevSessions, entities, prevEntities };
  }, [range, today]);

  const d = useMemo(() => {
    if (!data) return null;
    const days = buildDayStats(data.days, data.totals, data.sessions, data.hourly);
    const prevDays = buildDayStats(data.prevDays, data.prevTotals, data.prevSessions);
    const now = sumDays(days);
    const before = sumDays(prevDays);
    const goalMs = goalMin * 60_000;
    const insights = generateInsights({
      days,
      prevDays,
      hourly: data.hourly,
      entities: data.entities,
      prevEntities: data.prevEntities,
      sessions: data.sessions,
      goalMs,
      periodLabel: range === 7 ? "this week" : `in ${range} days`,
    });
    const persona = focusPersona(days, data.hourly);
    const focus = data.sessions.filter((s) => s.kind === "focus");
    return {
      days,
      now,
      before,
      insights,
      persona,
      grid: rhythmMatrix(data.hourly),
      completion: focus.length ? focus.filter((s) => s.completed).length / focus.length : null,
      prevCompletion: (() => {
        const pf = data.prevSessions.filter((s) => s.kind === "focus");
        return pf.length ? pf.filter((s) => s.completed).length / pf.length : null;
      })(),
      streak: goalStreak(days, goalMs),
      leaks: data.entities.filter((e) => e.productivity < 0).slice(0, 6),
    };
  }, [data, goalMin, range]);

  const perDay = (ms: number, n: number) => (n ? ms / n : 0);
  const avgNow = d ? perDay(d.now.productiveMs, d.now.activeDays) : 0;
  const avgBefore = d ? perDay(d.before.productiveMs, d.before.activeDays) : 0;
  const labelEvery = range === 7 ? 1 : range === 30 ? 5 : 14;

  return (
    <div className={cx("fade-frame", loading && data && "refreshing")}>
      <PageHeader
        title="Insights"
        subtitle={`${fmtShortDay(first)} – ${fmtShortDay(today)} · compared with the ${range} days before`}
        actions={
          <Segmented<Range>
            label="Date range"
            value={range}
            onChange={setRange}
            options={[
              { value: 7, label: "7 days" },
              { value: 30, label: "30 days" },
              { value: 90, label: "90 days" },
            ]}
          />
        }
      />

      <div className="grid-kpis">
        <div className="card hero-card compact">
          <div className="eyebrow">Avg. productive time / day</div>
          <div className="hero-value">{fmtDuration(avgNow)}</div>
          <Delta value={pctChange(avgNow, avgBefore)} suffix="vs. previous period" />
        </div>
        <Kpi label="Focus time" value={fmtDuration(d?.now.focusMs ?? 0)} delta={pctChange(d?.now.focusMs ?? 0, d?.before.focusMs ?? 0)} />
        <Kpi
          label="Productivity score"
          value={d?.now.score === null || !d ? "–" : String(d.now.score)}
          delta={d && d.now.score !== null && d.before.score !== null ? (d.now.score - d.before.score) / 100 : null}
          format={(v) => `${Math.round(v * 100)} pts`}
        />
        <Kpi
          label="Blocks completed"
          value={d?.completion === null || !d ? "–" : `${Math.round(d.completion * 100)}%`}
          delta={d && d.completion !== null && d.prevCompletion !== null ? d.completion - d.prevCompletion : null}
          format={(v) => `${Math.round(v * 100)} pts`}
          foot={`${d?.now.completed ?? 0} of ${d?.now.sessions ?? 0} blocks`}
        />
        <Kpi label="Goal streak" value={`${d?.streak ?? 0} day${d?.streak === 1 ? "" : "s"}`} foot={`Goal: ${fmtDuration(goalMin * 60_000)} focus`} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Daily breakdown</div>
            <div className="card-sub">Active time per day, split by productivity</div>
          </div>
          <div className="legend">
            {(["productive", "neutral", "distracting"] as const).map((k) => (
              <span key={k} className="legend-item">
                <span className="swatch" style={{ background: SERIES[k].color }} />
                {SERIES[k].name}
              </span>
            ))}
          </div>
        </div>
        <StackedColumns
          caption="Daily active time by productivity"
          height={240}
          labelEvery={labelEvery}
          series={[SERIES.productive, SERIES.neutral, SERIES.distracting]}
          data={(d?.days ?? []).map((x) => ({
            key: x.day,
            label: range === 7 ? fmtWeekday(x.day) : fmtShortDay(x.day),
            title: `${fmtWeekday(x.day)}, ${fmtShortDay(x.day)}`,
            values: [x.productiveMs, x.neutralMs, x.distractingMs],
            note: x.score !== null ? `score ${x.score}` : undefined,
          }))}
        />
      </div>

      <div className="grid-2-1">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Focus rhythm</div>
              <div className="card-sub">Average productive time by weekday and hour</div>
            </div>
          </div>
          {d && <Heatmap grid={d.grid} caption="Average productive time per weekday and hour" />}
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Focus per day</div>
              <div className="card-sub">Completed and partial focus blocks</div>
            </div>
          </div>
          <StackedColumns
            caption="Focus time per day against the daily goal"
            height={200}
            labelEvery={range === 7 ? 1 : range === 30 ? 7 : 21}
            series={[{ name: "Focus", color: "var(--phase-focus)" }]}
            reference={goalMin ? { value: goalMin * 60_000, label: `Goal ${fmtDuration(goalMin * 60_000)}` } : undefined}
            data={(d?.days ?? []).map((x) => ({
              key: x.day,
              label: range === 7 ? fmtWeekday(x.day).slice(0, 2) : fmtShortDay(x.day),
              title: `${fmtWeekday(x.day)}, ${fmtShortDay(x.day)}`,
              values: [x.focusMs],
              note: `${x.completed} of ${x.sessions} completed`,
            }))}
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Where time leaks</div>
              <div className="card-sub">Your most distracting apps and sites</div>
            </div>
          </div>
          <BarList
            rows={(d?.leaks ?? []).map((e) => {
              const prev = data?.prevEntities.find((p) => p.key === e.key && p.kind === e.kind);
              return {
                key: `${e.kind}:${e.key}`,
                icon: <Monogram name={entityName(e.kind, e.key, e.name)} kind={e.kind} />,
                label: entityName(e.kind, e.key, e.name),
                sub: `${categoryLabel(e.category)} · ${fmtDuration(e.ms / Math.max(1, d?.now.activeDays ?? 1))} per active day`,
                value: e.ms,
                productivity: e.productivity,
                trailing: <Delta value={prev ? pctChange(e.ms, prev.ms) : null} goodWhenUp={false} />,
              };
            })}
            empty={
              <div className="empty">
                <strong>No leaks</strong>Nothing distracting recorded in this period.
              </div>
            }
          />
        </div>
        <PersonaCard persona={d?.persona ?? null} range={range} activeHours={(d?.now.activeMs ?? 0) / HOUR} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Patterns & suggestions</div>
            <div className="card-sub">Worked out on this device from your own history</div>
          </div>
        </div>
        {d && d.insights.length ? (
          <InsightList insights={d.insights} columns />
        ) : (
          <div className="empty">
            <Sparkles />
            <strong>Not enough history yet</strong>A few days of tracking and Kairo will start spotting patterns.
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, delta, foot, format }: { label: string; value: string; delta?: number | null; foot?: string; format?: (v: number) => string }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{delta !== undefined ? <Delta value={delta} format={format} /> : foot}</div>
      {delta !== undefined && foot && <div className="stat-foot faint">{foot}</div>}
    </div>
  );
}

function PersonaCard({ persona, range, activeHours }: { persona: Persona | null; range: Range; activeHours: number }) {
  const toast = useApp((s) => s.toast);
  return (
    <div className="card persona">
      <div className="persona-glow" />
      <div className="card-head">
        <div>
          <div className="eyebrow">Your focus persona</div>
          <div className="card-sub">Based on the last {range} days</div>
        </div>
        {persona && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              const ok = await exportPersonaCard(persona, range, activeHours);
              if (ok) toast({ title: "Card saved", body: "Share it wherever you like. It's an image, with no data attached.", tone: "success" });
            }}
          >
            <Download /> Save card
          </button>
        )}
      </div>
      {persona ? (
        <>
          <div className="persona-name">{persona.name}</div>
          <p className="persona-tagline">{persona.tagline}</p>
          <div className="persona-traits">
            {persona.traits.map((t) => (
              <div key={t.label}>
                <div className="persona-trait-value">{t.value}</div>
                <div className="faint persona-trait-label">{t.label}</div>
              </div>
            ))}
          </div>
          <div className="persona-tips">
            <div className="eyebrow">Make the most of it</div>
            <ul>
              {persona.tips.map((t) => (
                <li key={t}>
                  <Check />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="empty">
          <strong>Still getting to know you</strong>Your persona appears after a couple of hours of productive work.
        </div>
      )}
    </div>
  );
}
