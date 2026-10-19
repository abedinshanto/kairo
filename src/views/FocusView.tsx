import {
  AudioLines,
  Flame,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Target,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TimerRing } from "../components/charts/TimerRing";
import { Monogram, Segmented, cx } from "../components/ui";
import { PRESETS, SOUNDS, soundEngine, type SoundId } from "../lib/audio/engine";
import { backend, isNative } from "../lib/backend";
import { categoryLabel, entityName, PRODUCTIVITY_LABEL } from "../lib/categories";
import { useNow, useQuery } from "../lib/hooks";
import { remainingNow, useApp } from "../lib/store";
import { addDays, DAY, fmtClock, fmtDay, fmtDuration, fmtTime, greeting, startOfDay } from "../lib/time";
import type { Phase } from "../lib/types";
import { useSize } from "../components/charts/common";

const PHASES: { value: Phase; label: string }[] = [
  { value: "focus", label: "Focus" },
  { value: "short_break", label: "Short break" },
  { value: "long_break", label: "Long break" },
];

export function FocusView() {
  const timer = useApp((s) => s.timer)!;
  const skew = useApp((s) => s.clockSkew);
  const deep = useApp((s) => s.deepFocus);
  const { timerAction, setPhase, extend, setDeepFocus } = useApp.getState();
  const running = timer.status === "running";
  useNow(250, running);
  const remaining = remainingNow(timer, skew);
  const progress = timer.durationMs > 0 ? 1 - remaining / timer.durationMs : 0;
  const [stageRef, stage] = useSize<HTMLDivElement>();
  const ringSize = Math.max(220, Math.min(deep ? 460 : 360, stage.width - 32, (stage.height || 800) - 260));

  useEffect(() => {
    const label = timer.status === "idle" ? "Kairo" : `${fmtClock(remaining)} · ${PHASES.find((p) => p.value === timer.phase)?.label}`;
    document.title = label;
  }, [remaining, timer.status, timer.phase]);

  const sub =
    timer.status === "running"
      ? `Ends at ${fmtTime(Date.now() + remaining)}`
      : timer.status === "paused"
        ? "Paused. Press Space to resume"
        : timer.phase === "focus"
          ? `Session ${Math.min(timer.cycle + 1, timer.cycleLength)} of ${timer.cycleLength}`
          : "Step away from the screen";

  return (
    <div className={cx("focus-layout", deep && "is-deep")}>
      <section className="focus-stage" ref={stageRef}>
        <header className="focus-top" data-tauri-drag-region>
          <div data-tauri-drag-region>
            <div className="eyebrow">{greeting()}</div>
            <div className="focus-date">{fmtDay(Date.now())}</div>
          </div>
          <div className="focus-top-actions">
            <Segmented label="Timer mode" options={PHASES} value={timer.phase} onChange={(p) => void setPhase(p)} size="sm" />
            <button className="icon-btn" aria-label={deep ? "Exit deep focus" : "Deep focus mode"} title={deep ? "Exit deep focus (F)" : "Deep focus (F)"} onClick={() => setDeepFocus(!deep)}>
              {deep ? <Minimize2 /> : <Maximize2 />}
            </button>
          </div>
        </header>

        <div className="focus-center">
          <TimerRing progress={progress} phase={timer.phase} status={timer.status} size={ringSize}>
            <span className="ring-phase">{timer.status === "paused" ? "Paused" : PHASES.find((p) => p.value === timer.phase)?.label}</span>
            <span className="ring-time tabular" style={{ fontSize: Math.round(ringSize * 0.215) }}>
              {fmtClock(remaining)}
            </span>
            <span className="ring-sub">{sub}</span>
          </TimerRing>

          <Intention />

          <div className="controls">
            <button className="ctrl" aria-label="Reset" title="Reset" onClick={() => void timerAction("stop")} disabled={timer.startedAt === null}>
              <RotateCcw />
            </button>
            <button className={cx("ctrl-main", `phase-${timer.phase}`)} aria-label={running ? "Pause" : "Start"} onClick={() => void timerAction("toggle")}>
              {running ? <Pause /> : <Play />}
            </button>
            <button className="ctrl" aria-label="Skip to next phase" title="Skip (S)" onClick={() => void timerAction("skip")}>
              <SkipForward />
            </button>
          </div>

          <div className="focus-meta">
            <button className="chip" onClick={() => void extend(5)}>
              <Plus /> 5 min
            </button>
            <CycleDots cycle={timer.cycle} length={timer.cycleLength} phase={timer.phase} />
            {timer.phase === "focus" && timer.interruptions > 0 && (
              <span className="chip warn" title="Times you switched to a distracting app during this block">
                <TriangleAlert /> {timer.interruptions} detour{timer.interruptions > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {!deep && (
            <p className="focus-hint faint">
              <span className="kbd">Space</span> start / pause · <span className="kbd">S</span> skip · <span className="kbd">F</span> deep focus
            </p>
          )}
        </div>
      </section>

      {!deep && (
        <aside className="focus-side">
          <TodayCard />
          <NowCard />
          <SoundCard />
          <UpNextCard />
        </aside>
      )}
    </div>
  );
}

function CycleDots({ cycle, length, phase }: { cycle: number; length: number; phase: Phase }) {
  return (
    <span className="cycle" title={`${cycle} of ${length} focus blocks before a long break`}>
      {Array.from({ length }, (_, i) => (
        <span key={i} className={cx("cycle-dot", i < cycle && "done", i === cycle && phase === "focus" && "current")} />
      ))}
    </span>
  );
}

function Intention() {
  const timer = useApp((s) => s.timer)!;
  const setIntention = useApp((s) => s.setIntention);
  const version = useApp((s) => s.dataVersion);
  const [value, setValue] = useState(timer.intention);
  const [tasks, setTasks] = useState<{ id: number; title: string }[]>([]);
  useEffect(() => setValue(timer.intention), [timer.intention]);
  useEffect(() => {
    backend.tasksList().then((t) => setTasks(t.filter((x) => !x.done)));
  }, [version]);

  if (timer.phase !== "focus") return <div className="intention-spacer" />;
  const commit = (taskId = timer.taskId) => {
    if (value !== timer.intention || taskId !== timer.taskId) void setIntention(value, taskId);
  };
  return (
    <div className="intention">
      <Target className="intention-icon" />
      <input
        className="intention-input"
        placeholder="What will you focus on?"
        value={value}
        maxLength={200}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        aria-label="Focus intention"
      />
      {tasks.length > 0 && (
        <select
          className="intention-task"
          aria-label="Link a task"
          value={timer.taskId ?? ""}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            const task = tasks.find((t) => t.id === id);
            const next = !value && task ? task.title : value;
            setValue(next);
            void setIntention(next, id);
          }}
        >
          <option value="">No task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function TodayCard() {
  const goalMin = useApp((s) => s.settings.dailyFocusGoalMinutes);
  const today = startOfDay(Date.now());
  const { data } = useQuery(() => backend.focusSessions(addDays(today, -60), Date.now() + DAY), [today]);
  const stats = useMemo(() => {
    const focus = (data ?? []).filter((s) => s.kind === "focus");
    const todays = focus.filter((s) => s.start >= today);
    const byDay = new Map<number, number>();
    for (const s of focus) byDay.set(startOfDay(s.start), (byDay.get(startOfDay(s.start)) ?? 0) + s.actualMs);
    let streak = 0;
    for (let d = today; ; d = addDays(d, -1)) {
      const ms = byDay.get(d) ?? 0;
      if (ms >= goalMin * 60_000) streak++;
      else if (d !== today) break;
      if (streak > 365) break;
    }
    return {
      ms: todays.reduce((a, s) => a + s.actualMs, 0),
      done: todays.filter((s) => s.completed).length,
      streak,
    };
  }, [data, today, goalMin]);
  const goal = goalMin * 60_000;
  const pct = goal ? Math.min(1, stats.ms / goal) : 0;
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Today's focus</div>
          <div className="card-sub">Goal {fmtDuration(goal)}</div>
        </div>
        {stats.streak > 0 && (
          <span className="badge accent" title="Consecutive days you met your focus goal">
            <Flame /> {stats.streak}-day streak
          </span>
        )}
      </div>
      <div className="today-figure">
        <span className="today-value">{fmtDuration(stats.ms)}</span>
        <span className="faint">{Math.round(pct * 100)}% of goal</span>
      </div>
      <div className={cx("meter", pct >= 1 && "done")} style={{ marginTop: 10 }}>
        <span style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="today-row">
        <span>
          <strong>{stats.done}</strong> blocks completed
        </span>
      </div>
    </div>
  );
}

function NowCard() {
  const tracker = useApp((s) => s.tracker);
  const timer = useApp((s) => s.timer)!;
  const now = useNow(30_000);
  const current = tracker?.current;
  if (!tracker?.supported) return null;
  const offTrack = current && current.productivity < 0 && timer.phase === "focus" && timer.status === "running";
  return (
    <div className={cx("card now-card", offTrack && "off-track")}>
      <div className="card-head" style={{ marginBottom: 12 }}>
        <div className="card-title">Right now</div>
        <span className="eyebrow live">
          <span className={cx("live-dot", current && "on")} /> {isNative ? "Live" : "Sample"}
        </span>
      </div>
      {current ? (
        <div className="now-row">
          <Monogram name={entityName(current.domain ? "site" : "app", current.domain ?? current.appId, current.appName)} kind={current.domain ? "site" : "app"} productivity={current.productivity} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="now-name">{entityName(current.domain ? "site" : "app", current.domain ?? current.appId, current.appName)}</div>
            <div className="faint now-meta">
              {categoryLabel(current.category)} · {PRODUCTIVITY_LABEL[current.productivity]} · {fmtDuration(now - current.since)}
            </div>
          </div>
        </div>
      ) : (
        <div className="faint" style={{ fontSize: 13 }}>
          {tracker.pausedUntil ? `Tracking paused until ${fmtTime(tracker.pausedUntil)}` : tracker.needsPermission ? "Grant usage access in Settings to see app time." : "Nothing in focus. You're away or idle."}
        </div>
      )}
      {offTrack && <div className="off-track-note">This is a distracting app. Your focus block is still running.</div>}
    </div>
  );
}

function SoundCard() {
  const playing = useApp((s) => s.soundPlaying);
  const sound = useApp((s) => s.settings.sound!);
  const updateSound = useApp((s) => s.updateSound);
  const setView = useApp((s) => s.setView);
  const active = SOUNDS.filter((s) => (sound.levels[s.id] ?? 0) > 0);
  const preset = PRESETS.find((p) => {
    const keys = Object.keys(p.levels);
    return keys.length === active.length && keys.every((k) => (sound.levels[k] ?? 0) > 0);
  });
  return (
    <div className="card sound-card">
      <div className="card-head" style={{ marginBottom: 12 }}>
        <div>
          <div className="card-title">Soundscape</div>
          <div className="card-sub">{preset ? preset.name : active.length ? active.map((s) => s.label).join(" · ") : "Nothing selected"}</div>
        </div>
        <button
          className={cx("sound-play", playing && "on")}
          aria-label={playing ? "Pause soundscape" : "Play soundscape"}
          disabled={!active.length}
          onClick={() => void soundEngine.toggle()}
        >
          {playing ? <Pause /> : <Play />}
        </button>
      </div>
      <div className="preset-chips">
        {PRESETS.slice(0, 4).map((p) => (
          <button
            key={p.id}
            className={cx("chip", preset?.id === p.id && "active")}
            onClick={() => {
              updateSound({ levels: p.levels as Record<SoundId, number> });
              if (!soundEngine.playing) void soundEngine.play();
            }}
          >
            {p.name}
          </button>
        ))}
        <button className="chip ghost" onClick={() => setView("sounds")}>
          <AudioLines /> Mixer
        </button>
      </div>
    </div>
  );
}

function UpNextCard() {
  const { data } = useQuery(() => backend.tasksList(), []);
  const timer = useApp((s) => s.timer)!;
  const setIntention = useApp((s) => s.setIntention);
  const setView = useApp((s) => s.setView);
  const tasks = (data ?? []).filter((t) => !t.done).slice(0, 4);
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 10 }}>
        <div className="card-title">Up next</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setView("tasks")}>
          All tasks
        </button>
      </div>
      {tasks.length ? (
        <ul className="mini-tasks">
          {tasks.map((t) => (
            <li key={t.id} className={cx(timer.taskId === t.id && "current")}>
              <button className="mini-task" onClick={() => void setIntention(t.title, t.id)} title="Focus on this task">
                <span className="mini-task-title">{t.title}</span>
                <span className="pomos" aria-label={`${t.pomodoros} of ${t.estimate} blocks`}>
                  {Array.from({ length: Math.min(t.estimate, 8) }, (_, i) => (
                    <span key={i} className={cx("pomo", i < t.pomodoros && "done")} />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="faint" style={{ fontSize: 13 }}>
          No open tasks. Add one to link your focus blocks to real work.
        </div>
      )}
    </div>
  );
}
