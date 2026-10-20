import {
  Brain,
  ChevronDown,
  Clock,
  CloudMoonRain,
  Flag,
  Flame,
  Headphones,
  Link2,
  ListChecks,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Sparkles,
  Timer,
  Trees,
  Waves,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Buddy, type BuddyMood, type BuddyTone } from "../components/Buddy";
import { PageTitle, PillTabs, TopBar, cx } from "../components/ui";
import { PRESETS, SOUNDS, soundEngine, type SoundId } from "../lib/audio/engine";
import { backend, isNative } from "../lib/backend";
import { entityName } from "../lib/categories";
import { confirmDialog } from "../lib/dialogs";
import { useMediaQuery, useNow, useQuery } from "../lib/hooks";
import { remainingNow, skipPhase, useApp } from "../lib/store";
import { addDays, DAY, fmtClock, fmtDuration, fmtTime, startOfDay } from "../lib/time";
import type { Phase, TimerSnapshot } from "../lib/types";
import "../styles/views/home.css";

const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short_break: "Short break", long_break: "Long break" };
const TONE: Record<Phase, BuddyTone> = { focus: "cloud", short_break: "cloud", long_break: "cloud" };

const PRESET_ICONS: Record<string, ReactNode> = {
  "deep-work": <Brain />,
  "rainy-night": <CloudMoonRain />,
  "ocean-calm": <Waves />,
  forest: <Trees />,
  campfire: <Flame />,
  flow: <Sparkles />,
};

/** A phase duration for the pill tabs: "25m" on screen, "25 minutes" to screen readers. */
function minutes(n: number) {
  return (
    <>
      <span aria-hidden>{n}m</span>
      <span className="sr-only">{n} minutes</span>
    </>
  );
}

function moodFor(t: TimerSnapshot): BuddyMood {
  if (t.status === "paused") return "paused";
  if (t.phase !== "focus") return t.status === "running" ? "break" : "happy";
  return t.status === "running" ? "focus" : "idle";
}

function greeting(t: TimerSnapshot, name: string): [string, string] {
  const who = name.trim() ? `Hi ${name.trim()},` : "Hi there,";
  // Every state fits one line at phone width, so the hero doesn't jump when the timer starts or pauses.
  if (t.status === "paused") return ["Paused,", "take your time."];
  if (t.phase !== "focus") return t.status === "running" ? ["On a break,", "breathe out."] : ["Nice work,", "take a break."];
  if (t.status === "running") return ["In the zone,", "keep going."];
  return [who, "ready to focus?"];
}

export function HomeView() {
  const timer = useApp((s) => s.timer)!;
  const skew = useApp((s) => s.clockSkew);
  const deep = useApp((s) => s.deepFocus);
  const settings = useApp((s) => s.settings);
  const tracker = useApp((s) => s.tracker);
  // Phones get short mode labels so all three pills fit without scrolling.
  const narrow = useMediaQuery("(max-width: 420px)");
  const { setPhase, setDeepFocus, setView } = useApp.getState();
  const running = timer.status === "running";
  useNow(250, running);
  const remaining = remainingNow(timer, skew);

  useEffect(() => {
    document.title = timer.status === "idle" ? "Kairo" : `${fmtClock(remaining)} · ${PHASE_LABEL[timer.phase]}`;
  }, [remaining, timer.status, timer.phase]);

  const [strong, dim] = greeting(timer, settings.name ?? "");
  const current = tracker?.current;
  const currentName = current ? entityName(current.domain ? "site" : "app", current.domain ?? current.appId, current.appName) : "";
  const offTrack = !!current && current.productivity < 0 && timer.phase === "focus" && running;
  const status: ReactNode = !tracker?.supported ? (
    "Focus timer"
  ) : !settings.trackingEnabled ? (
    "Tracking off"
  ) : tracker.needsPermission ? (
    <button className="who-link" onClick={() => setView("settings")}>
      Allow usage access
    </button>
  ) : tracker.pausedUntil ? (
    <span title={`Tracking is paused until ${fmtTime(tracker.pausedUntil)}`}>Private until {fmtTime(tracker.pausedUntil)}</span>
  ) : current ? (
    `${offTrack ? "Off track" : "Now"} · ${currentName}`
  ) : isNative ? (
    "Tracking privately"
  ) : (
    "Preview"
  );

  // Switching phase mid-block ends the block, so a stray tap on a pill must not lose it silently.
  const pickPhase = async (p: Phase) => {
    if (p === timer.phase) return;
    if (timer.startedAt !== null) {
      const ok = await confirmDialog(
        timer.phase === "focus" ? `End this focus block early and switch to ${PHASE_LABEL[p].toLowerCase()}?` : `End this ${PHASE_LABEL[timer.phase].toLowerCase()} early?`,
        { title: timer.phase === "focus" ? "End focus block?" : "End break?", okLabel: "End early" },
      );
      if (!ok) return;
    }
    void setPhase(p);
  };

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
    <div className={cx("home", `phase-${timer.phase}`)}>
      <TopBar
        left={
          <>
            <span className="buddy-avatar">
              <Buddy mood={moodFor(timer)} size={46} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="who-name">{settings.name?.trim() || "Kairo"}</div>
              <div className={cx("who-sub", offTrack && "off-track")} title={offTrack ? "This is a distracting app. Your focus block is still running." : undefined}>
                {status}
              </div>
            </div>
          </>
        }
        right={
          <button className="circle-btn" aria-label="Deep focus mode" title="Deep focus (F)" onClick={() => setDeepFocus(true)}>
            <Maximize2 />
          </button>
        }
      />

      <div className="home-grid">
        <section className="home-main">
          <PageTitle strong={strong} dim={dim} />
          <div className="home-tabs">
            <PillTabs<Phase>
              label="Timer mode"
              value={timer.phase}
              onChange={(p) => void pickPhase(p)}
              options={[
                { value: "focus", label: "Focus", count: minutes(settings.focusMinutes) },
                { value: "short_break", label: narrow ? "Short" : "Short break", count: minutes(settings.shortBreakMinutes) },
                { value: "long_break", label: narrow ? "Long" : "Long break", count: minutes(settings.longBreakMinutes) },
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

function SessionDots({ timer }: { timer: TimerSnapshot }) {
  const total = Math.max(1, timer.cycleLength);
  const done = Math.min(timer.cycle, total);
  const current = timer.phase === "focus" ? Math.min(timer.cycle, total - 1) : -1;
  const label = timer.phase === "focus" ? `Session ${current + 1} of ${total}` : `${done} of ${total} sessions done`;
  return (
    <div className="session-dots" role="img" aria-label={label} title={label}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx(i === current ? "current" : i < done && "done")} />
      ))}
    </div>
  );
}

function TimerCard({ deep = false }: { deep?: boolean }) {
  const timer = useApp((s) => s.timer)!;
  const skew = useApp((s) => s.clockSkew);
  const { timerAction, extend } = useApp.getState();
  const remaining = remainingNow(timer, skew);
  const progress = timer.durationMs > 0 ? Math.min(1, Math.max(0, 1 - remaining / timer.durationMs)) : 0;
  const running = timer.status === "running";
  const detours = timer.phase === "focus" ? timer.interruptions : 0;

  return (
    <div className={cx("stacked", `phase-${timer.phase}`, deep && "is-deep")}>
      <div className={cx("card hero timer-card", `phase-${timer.phase}`)}>
        <div className="timer-top">
          <SessionDots timer={timer} />
          <div className="timer-top-end">
            {detours > 0 && (
              <span className="badge white warn" title="Times you switched to a distracting app during this block">
                <Flag />
                {detours} detour{detours > 1 ? "s" : ""}
              </span>
            )}
            {timer.status !== "idle" && (
              <span className="chip on-brand">
                <Clock />
                {running ? `Ends ${fmtTime(Date.now() + remaining)}` : "Paused"}
              </span>
            )}
          </div>
        </div>

        <div className="timer-body">
          <div className="timer-text">
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
          {/* Reset, +5 and skip only matter once a block is under way; idle shows just time, intention and play. */}
          {timer.startedAt !== null && (
            <div className="timer-secondary">
              <button className="circle-btn glass" aria-label="Reset" title="Reset" onClick={() => void timerAction("stop")}>
                <RotateCcw />
              </button>
              <button className="btn btn-glass" onClick={() => void extend(5)}>
                <Plus /> 5 min
              </button>
              <button className="circle-btn glass" aria-label="Skip to next phase" title="Skip (S)" onClick={() => void skipPhase()}>
                <SkipForward />
              </button>
            </div>
          )}
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
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setValue(timer.intention), [timer.intention]);
  useEffect(() => {
    backend.tasksList().then((t) => setTasks(t.filter((x) => !x.done)));
  }, [version]);

  // Grow with the text. `field-sizing: content` does this in Chromium only; WebKit (macOS, iOS, Linux) needs JS.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [value]);

  const linked = tasks.find((t) => t.id === timer.taskId);
  const commit = () => {
    if (value !== timer.intention) void setIntention(value, timer.taskId);
  };

  return (
    <div className="intention">
      <div className="intention-row">
        <textarea
          ref={input}
          className="intention-input"
          rows={1}
          placeholder="What's your focus?"
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
        {(tasks.length > 0 || linked) && (
          <label className={cx("intention-link", linked && "on")} title={linked ? `Linked to ${linked.title}` : "Link a task"}>
            {linked ? <ListChecks aria-hidden /> : <Link2 aria-hidden />}
            <select
              aria-label={linked ? `Linked task: ${linked.title}` : "Link a task"}
              value={linked ? String(linked.id) : ""}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                const task = tasks.find((t) => t.id === id);
                // Take the task's title when the intention is empty or was just the previous task's title.
                const next = task && (!value.trim() || value === linked?.title) ? task.title : value;
                setValue(next);
                void setIntention(next, id);
              }}
            >
              <option value="">{linked ? "Unlink task" : "No task"}</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {linked && value.trim() !== linked.title && (
        <div className="intention-linked">
          <ListChecks aria-hidden />
          <span>{linked.title}</span>
        </div>
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
  const name = preset?.name ?? (active.length ? "Custom mix" : "Pick a sound");
  const sounds = active.length ? active.map((s) => s.label).join(" · ") : "Nothing selected";
  return (
    <div className="card sound-card">
      <button className={cx("art sound-art", `art-${preset?.id ?? "custom"}`)} aria-label="Open soundscapes" title="Open soundscapes" onClick={() => setView("sounds")}>
        {preset ? PRESET_ICONS[preset.id] : <Headphones />}
      </button>
      <div className="sound-meta">
        <label className="sound-pick" title="Change soundscape">
          <span className="card-title">{name}</span>
          <ChevronDown aria-hidden />
          <select
            aria-label={`Soundscape: ${name}`}
            value={preset?.id ?? ""}
            onChange={(e) => {
              if (e.target.value === "mixer") return setView("sounds");
              const p = PRESETS.find((x) => x.id === e.target.value);
              if (!p) return;
              updateSound({ levels: p.levels as Record<SoundId, number> });
              if (!soundEngine.playing) void soundEngine.play();
            }}
          >
            {!preset && (
              <option value="" disabled>
                {name}
              </option>
            )}
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="mixer">Mix your own…</option>
          </select>
        </label>
        <span className="sound-sub">{playing ? `Playing · ${sounds}` : sounds}</span>
      </div>
      <button className={cx("circle-btn", playing ? "brand" : "soft")} aria-label={playing ? "Pause soundscape" : "Play soundscape"} disabled={!active.length} onClick={() => void soundEngine.toggle()}>
        {playing ? <Pause className="fill" /> : <Play className="fill" />}
      </button>
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
        <button className="btn btn-ghost btn-sm card-link" onClick={() => setView("tasks")}>
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
