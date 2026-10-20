import { Clock, Flag, Flame, Headphones, Maximize2, Minimize2, Pause, Play, Plus, RotateCcw, SkipForward, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Buddy, type BuddyMood, type BuddyTone } from "../components/Buddy";
import { PageTitle, PillTabs, TopBar, cx } from "../components/ui";
import { PRESETS, SOUNDS, soundEngine, type SoundId } from "../lib/audio/engine";
import { backend, isNative } from "../lib/backend";
import { entityName } from "../lib/categories";
import { useNow, useQuery } from "../lib/hooks";
import { remainingNow, useApp } from "../lib/store";
import { addDays, DAY, fmtClock, fmtDuration, fmtTime, startOfDay } from "../lib/time";
import type { Phase, TimerSnapshot } from "../lib/types";
import "../styles/views/home.css";

const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short_break: "Short break", long_break: "Long break" };
const TONE: Record<Phase, BuddyTone> = { focus: "cloud", short_break: "cloud", long_break: "cloud" };

function moodFor(t: TimerSnapshot): BuddyMood {
  if (t.status === "paused") return "paused";
  if (t.phase !== "focus") return t.status === "running" ? "break" : "happy";
  return t.status === "running" ? "focus" : "idle";
}

function greeting(t: TimerSnapshot, name: string): [string, string] {
  const who = name.trim() ? `Hi ${name.trim()},` : "Hi there,";
  if (t.status === "paused") return ["Paused,", "pick it up when you're ready."];
  if (t.phase !== "focus") return t.status === "running" ? ["Nice work,", "take a breather."] : ["Break time,", "you earned it."];
  if (t.status === "running") return ["Deep work,", "you're in the zone."];
  return [who, "ready to focus?"];
}

export function HomeView() {
  const timer = useApp((s) => s.timer)!;
  const skew = useApp((s) => s.clockSkew);
  const deep = useApp((s) => s.deepFocus);
  const settings = useApp((s) => s.settings);
  const tracker = useApp((s) => s.tracker);
  const playing = useApp((s) => s.soundPlaying);
  const { setPhase, setDeepFocus } = useApp.getState();
  const running = timer.status === "running";
  useNow(250, running);
  const remaining = remainingNow(timer, skew);

  useEffect(() => {
    document.title = timer.status === "idle" ? "Kairo" : `${fmtClock(remaining)} · ${PHASE_LABEL[timer.phase]}`;
  }, [remaining, timer.status, timer.phase]);

  const [strong, dim] = greeting(timer, settings.name ?? "");
  const current = tracker?.current;
  const status = !tracker?.supported
    ? "Focus timer"
    : tracker.pausedUntil
      ? "Tracking paused"
      : current
        ? `Now · ${entityName(current.domain ? "site" : "app", current.domain ?? current.appId, current.appName)}`
        : isNative
          ? "Tracking privately"
          : "Preview";

  if (deep) {
    return (
      <div className="home-deep">
        <button className="circle-btn glass-dark deep-exit" aria-label="Exit deep focus" title="Exit (Esc)" onClick={() => setDeepFocus(false)}>
          <Minimize2 />
        </button>
        <TimerCard deep />
      </div>
    );
  }

  return (
    <div className="home">
      <TopBar
        left={
          <>
            <span className="buddy-avatar">
              <Buddy mood={moodFor(timer)} size={46} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="who-name">{settings.name?.trim() || "Kairo"}</div>
              <div className="who-sub">{status}</div>
            </div>
          </>
        }
        right={
          <>
            <button
              className={cx("circle-btn", playing && "brand")}
              aria-label={playing ? "Pause soundscape" : "Play soundscape"}
              title="Soundscape"
              onClick={() => void soundEngine.toggle()}
              disabled={!soundEngine.hasMix}
            >
              <Headphones />
            </button>
            <button className="circle-btn" aria-label="Deep focus mode" title="Deep focus (F)" onClick={() => setDeepFocus(true)}>
              <Maximize2 />
            </button>
          </>
        }
      />

      <div className="home-grid">
        <section className="home-main">
          <PageTitle strong={strong} dim={dim} />
          <div className="home-tabs">
            <PillTabs<Phase>
              label="Timer mode"
              value={timer.phase}
              onChange={(p) => void setPhase(p)}
              options={[
                { value: "focus", label: "Focus", count: settings.focusMinutes },
                { value: "short_break", label: "Short break", count: settings.shortBreakMinutes },
                { value: "long_break", label: "Long break", count: settings.longBreakMinutes },
              ]}
            />
          </div>
          <TimerCard />
        </section>

        <aside className="home-side">
          <TodayTiles />
          <SoundCard />
          <UpNext />
        </aside>
      </div>
    </div>
  );
}

function TimerCard({ deep = false }: { deep?: boolean }) {
  const timer = useApp((s) => s.timer)!;
  const skew = useApp((s) => s.clockSkew);
  const goalMin = useApp((s) => s.settings.dailyFocusGoalMinutes);
  const { timerAction, extend } = useApp.getState();
  const remaining = remainingNow(timer, skew);
  const progress = timer.durationMs > 0 ? Math.min(1, Math.max(0, 1 - remaining / timer.durationMs)) : 0;
  const running = timer.status === "running";
  const focusToday = useFocusToday();
  const goalPct = goalMin ? Math.min(100, Math.round((focusToday.ms / (goalMin * 60_000)) * 100)) : 0;

  return (
    <div className={cx("stacked", `phase-${timer.phase}`, deep && "is-deep")}>
      <div className={cx("card hero timer-card", `phase-${timer.phase}`)}>
        <div className="timer-top">
          <span className="chip on-brand">
            {timer.phase === "focus" ? `Session ${Math.min(timer.cycle + 1, timer.cycleLength)} of ${timer.cycleLength}` : PHASE_LABEL[timer.phase]}
          </span>
          <span className="chip on-brand">
            <Clock />
            {running ? `Ends ${fmtTime(Date.now() + remaining)}` : timer.status === "paused" ? "Paused" : `${Math.round(timer.durationMs / 60_000)} min`}
          </span>
        </div>

        <div className="timer-body">
          <div className="timer-text">
            {timer.phase === "focus" && (
              <span className={cx("badge white", timer.interruptions > 0 && "warn")}>
                <Flag />
                {timer.interruptions > 0
                  ? `${timer.interruptions} detour${timer.interruptions > 1 ? "s" : ""} this block`
                  : `${goalPct}% of today's goal`}
              </span>
            )}
            <div className="timer-digits tabular" aria-live="off">
              {fmtClock(remaining)}
            </div>
            <div className="timer-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Block progress">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
          <div className="timer-buddy">
            <Buddy mood={moodFor(timer)} tone={TONE[timer.phase]} size={deep ? 150 : 118} />
          </div>
        </div>

        {timer.phase === "focus" ? <Intention /> : <p className="timer-rest">Stand up, stretch, and look at something far away. Your next block will be sharper for it.</p>}

        <div className="timer-controls">
          <div className="timer-secondary">
            <button className="circle-btn glass" aria-label="Reset" title="Reset" disabled={timer.startedAt === null} onClick={() => void timerAction("stop")}>
              <RotateCcw />
            </button>
            <button className="btn btn-glass" onClick={() => void extend(5)}>
              <Plus /> 5 min
            </button>
            <button className="circle-btn glass" aria-label="Skip to next phase" title="Skip (S)" onClick={() => void timerAction("skip")}>
              <SkipForward />
            </button>
          </div>
          <button className="circle-btn on-brand xl play" aria-label={running ? "Pause" : "Start"} title="Start / pause (Space)" onClick={() => void timerAction("toggle")}>
            {running ? <Pause className="fill" /> : <Play className="fill" />}
          </button>
        </div>
      </div>
    </div>
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

  const commit = () => {
    if (value !== timer.intention) void setIntention(value, timer.taskId);
  };

  return (
    <div className="intention">
      <textarea
        className="intention-input"
        rows={1}
        placeholder="What are you focusing on?"
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value.replace(/\n/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLTextAreaElement).blur();
          }
        }}
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
          <option value="">Link a task</option>
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

function useFocusToday() {
  const goalMin = useApp((s) => s.settings.dailyFocusGoalMinutes);
  const today = startOfDay(Date.now());
  const { data } = useQuery(() => backend.focusSessions(addDays(today, -60), Date.now() + DAY), [today]);
  return useMemo(() => {
    const focus = (data ?? []).filter((s) => s.kind === "focus");
    const byDay = new Map<number, number>();
    for (const s of focus) byDay.set(startOfDay(s.start), (byDay.get(startOfDay(s.start)) ?? 0) + s.actualMs);
    let streak = 0;
    for (let d = today, i = 0; i < 366; d = addDays(d, -1), i++) {
      if ((byDay.get(d) ?? 0) >= goalMin * 60_000) streak++;
      else if (d !== today) break;
    }
    const todays = focus.filter((s) => s.start >= today);
    return { ms: byDay.get(today) ?? 0, blocks: todays.filter((s) => s.completed).length, streak };
  }, [data, today, goalMin]);
}

function TodayTiles() {
  const goalMin = useApp((s) => s.settings.dailyFocusGoalMinutes);
  const { ms, blocks, streak } = useFocusToday();
  const goal = goalMin * 60_000;
  const hours = ms / 3_600_000;
  return (
    <div className="grid-2">
      <div className="card tint tile">
        <span className="icon-tile round brand-solid">
          <Timer />
        </span>
        <div className="big-number">
          {hours >= 1 ? hours.toFixed(1) : Math.round(ms / 60_000)}
          <small>{hours >= 1 ? "hours" : "min"}</small>
        </div>
        <div className="tile-label">Focused today</div>
        <div className={cx("meter", ms >= goal && "done")}>
          <span style={{ width: `${goal ? Math.min(100, (ms / goal) * 100) : 0}%` }} />
        </div>
        <div className="tile-foot">
          {blocks} block{blocks === 1 ? "" : "s"} · goal {fmtDuration(goal)}
        </div>
      </div>
      <div className="card tile">
        <span className="icon-tile round warn">
          <Flame />
        </span>
        <div className="big-number">
          {streak}
          <small>{streak === 1 ? "day" : "days"}</small>
        </div>
        <div className="tile-label">Goal streak</div>
        <div className="tile-foot">{streak ? "Keep the chain going" : `Hit ${fmtDuration(goal)} to start one`}</div>
      </div>
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
    <div className="card">
      <div className="sound-row">
        <span className={cx("art", `art-${preset?.id ?? "custom"}`)} style={{ width: 60, height: 60 }} aria-hidden />
        <button className="sound-meta" onClick={() => setView("sounds")}>
          <span className="label">{playing ? "Now playing" : "Soundscape"}</span>
          <span className="card-title">{preset?.name ?? (active.length ? "Custom mix" : "Pick a sound")}</span>
        </button>
        <button className={cx("circle-btn", playing ? "brand" : "soft")} aria-label={playing ? "Pause soundscape" : "Play soundscape"} disabled={!active.length} onClick={() => void soundEngine.toggle()}>
          {playing ? <Pause className="fill" /> : <Play className="fill" />}
        </button>
      </div>
      <div className="pills sm fade-end home-presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={cx("pill", preset?.id === p.id && "active")}
            onClick={() => {
              updateSound({ levels: p.levels as Record<SoundId, number> });
              if (!soundEngine.playing) void soundEngine.play();
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function UpNext() {
  const { data } = useQuery(() => backend.tasksList(), []);
  const timer = useApp((s) => s.timer)!;
  const setIntention = useApp((s) => s.setIntention);
  const setView = useApp((s) => s.setView);
  const tasks = (data ?? []).filter((t) => !t.done).slice(0, 3);
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 6 }}>
        <div className="card-title">Up next</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setView("tasks")}>
          All tasks
        </button>
      </div>
      {tasks.length ? (
        <ul className="list">
          {tasks.map((t) => (
            <li key={t.id} className={cx("list-row upnext", timer.taskId === t.id && "current")}>
              <button className="upnext-btn" onClick={() => void setIntention(t.title, t.id)} title="Focus on this">
                <span className="upnext-dot" aria-hidden />
                <span className="list-main">
                  <span className="list-title">{t.title}</span>
                  <span className="list-sub">{t.pomodoros <= t.estimate ? `${t.pomodoros} of ${t.estimate} blocks` : `${t.pomodoros} blocks done`}</span>
                </span>
                {timer.taskId === t.id ? <span className="badge brand">In focus</span> : <Play className="upnext-play" />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <strong>Nothing planned</strong>
          Add a task and link your focus blocks to it.
        </div>
      )}
    </div>
  );
}
