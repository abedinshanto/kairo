import { Check, Eye, EyeOff, Maximize2, Pause, Play, Plus, SkipForward } from "lucide-react";
import { useEffect } from "react";
import { Avatar, cx } from "../components/ui";
import { backend } from "../lib/backend";
import { entityName } from "../lib/categories";
import { useNow, useQuery } from "../lib/hooks";
import { finishOrSkip, remainingNow, useApp } from "../lib/store";
import { dueInfo, fmtClock, fmtDuration, startOfDay } from "../lib/time";
import type { Phase, Task } from "../lib/types";
import "../styles/small-windows.css";

const PHASE: Record<Phase, string> = { focus: "Focus", short_break: "Short break", long_break: "Long break" };

/** The menu bar panel: the timer, tasks 1–4 and today, a click away from any app. */
export function MenuPanel() {
  const timer = useApp((s) => s.timer)!;
  const skew = useApp((s) => s.clockSkew);
  const goalMin = useApp((s) => s.settings.dailyFocusGoalMinutes);
  const tracker = useApp((s) => s.tracker);
  const timerAction = useApp((s) => s.timerAction);
  const setIntention = useApp((s) => s.setIntention);
  const pauseTracking = useApp((s) => s.pauseTracking);
  const running = timer.status === "running";
  useNow(500, running);
  const remaining = remainingNow(timer, skew);
  const today = startOfDay(Date.now());

  const { data: tasks } = useQuery(() => backend.tasksList(), []);
  const top = (tasks ?? []).filter((t) => !t.done).slice(0, 4);
  const { data: day } = useQuery(async () => {
    const now = Date.now();
    const [[totals], sessions] = await Promise.all([backend.bucketTotals([[today, now]]), backend.focusSessions(today, now)]);
    return {
      active: totals.productiveMs + totals.neutralMs + totals.distractingMs,
      focus: sessions.filter((s) => s.kind === "focus").reduce((a, s) => a + s.actualMs, 0),
    };
  }, [today]);

  // Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && void backend.windowHide();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = async (t: Task) => {
    await setIntention(t.title, t.id);
    // From the panel, picking a task while nothing runs gets going right away.
    if (timer.status === "idle" && timer.phase === "focus") await timerAction("start");
  };

  const goal = goalMin * 60_000;
  const focusMs = (day?.focus ?? 0) + (timer.phase === "focus" && timer.startedAt !== null ? Math.max(0, timer.durationMs - remaining) : 0);
  const ratio = goal ? Math.min(1, focusMs / goal) : 0;
  const current = tracker?.current ?? null;
  const paused = !!tracker?.pausedUntil && tracker.pausedUntil > Date.now();
  const progress = timer.durationMs ? 1 - remaining / timer.durationMs : 0;
  const started = timer.startedAt !== null;
  const r = 15;
  const c = 2 * Math.PI * r;

  return (
    <div className="mini panel" data-phase={timer.phase}>
      <header className="panel-timer">
        <div className="panel-timer-top">
          <span className="panel-phase">
            <span className={cx("panel-dot", running ? "on" : started ? "paused" : "idle")} aria-hidden />
            {PHASE[timer.phase]}
            {timer.status === "paused" && " · paused"}
          </span>
          <button className="circle-btn sm glass" aria-label="Open Kairo" title="Open Kairo" onClick={() => void backend.windowOpenMain()}>
            <Maximize2 />
          </button>
        </div>
        <div className="panel-clock tabular">{fmtClock(remaining)}</div>
        <div className="panel-bar" aria-hidden>
          <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
        <p className="panel-intention" title={timer.intention}>
          {timer.intention.trim() || (timer.phase === "focus" ? "No focus set. Pick a task below." : "Time to rest your eyes.")}
        </p>
        <div className="panel-controls">
          <button className="btn btn-on-brand panel-main" onClick={() => void timerAction("toggle")}>
            {running ? <Pause className="fill" /> : <Play className="fill" />}
            {running ? "Pause" : started ? "Resume" : `Start ${timer.phase === "focus" ? "focus" : "break"}`}
          </button>
          <button
            className="circle-btn glass"
            aria-label={timer.phase === "focus" && started ? "Finish and log this block" : "Skip ahead"}
            title={timer.phase === "focus" && started ? "Finish and log this block" : "Skip ahead"}
            onClick={() => void finishOrSkip()}
          >
            {timer.phase === "focus" && started ? <Check /> : <SkipForward />}
          </button>
        </div>
      </header>

      <section className="panel-section" aria-labelledby="panel-tasks">
        <div className="panel-head">
          <h2 id="panel-tasks">Up next</h2>
          <button className="panel-link" onClick={() => void backend.windowOpenMain("tasks")}>
            <Plus /> Add
          </button>
        </div>
        {top.length ? (
          <ul className="panel-tasks">
            {top.map((t, i) => {
              const linked = timer.taskId === t.id;
              const due = t.dueDay !== null ? dueInfo(t.dueDay) : null;
              return (
                <li key={t.id}>
                  <button className={cx("panel-task", linked && "on")} title={linked ? "In focus" : "Focus on this"} onClick={() => void pick(t)}>
                    <span className="panel-num">{i + 1}</span>
                    <span className="panel-task-title">{t.title}</span>
                    {due && <span className={cx("panel-due", `is-${due.tone}`)}>{due.label}</span>}
                    {linked && <span className="panel-live" aria-label="In focus" />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="panel-empty">No open tasks. Add one with quick capture or in Kairo.</p>
        )}
      </section>

      <section className="panel-section panel-today" aria-label="Today">
        <svg className="panel-ring" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r={r} className="track" />
          <circle cx="18" cy="18" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} />
        </svg>
        <div className="panel-today-text">
          <strong>{fmtDuration(focusMs)} focused</strong>
          <span>{goal ? `of ${fmtDuration(goal)} · ` : ""}{fmtDuration(day?.active ?? 0)} on screen</span>
        </div>
      </section>

      <section className="panel-section panel-now" aria-label="Now">
        {paused ? (
          <span className="panel-now-text">Tracking paused</span>
        ) : current ? (
          <>
            <Avatar
              name={entityName(current.domain ? "site" : "app", current.domain ?? current.appId, current.appName)}
              productivity={current.productivity}
              size={28}
              iconKey={current.domain ? undefined : current.appId}
              siteKey={current.domain ?? undefined}
            />
            <span className="panel-now-text">
              {entityName(current.domain ? "site" : "app", current.domain ?? current.appId, current.appName)}
              <small> · {fmtDuration(Date.now() - current.since)}</small>
            </span>
          </>
        ) : (
          <span className="panel-now-text">{tracker?.enabled === false ? "Tracking is off" : "Nothing in front yet"}</span>
        )}
        {tracker?.supported && tracker.enabled && (
          <button className="panel-link" onClick={() => void pauseTracking(paused ? null : 60)} title={paused ? "Resume tracking" : "Pause tracking for an hour"}>
            {paused ? <Eye /> : <EyeOff />} {paused ? "Resume" : "Pause 1h"}
          </button>
        )}
      </section>

    </div>
  );
}
