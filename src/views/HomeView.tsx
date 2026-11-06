import {
  CalendarDays,
  Check,
  Download,
  Globe,
  Power,
  ScrollText,
  ChevronDown,
  Clock,
  Flag,
  Flame,
  Headphones,
  ListChecks,
  LoaderCircle,
  Maximize2,
  Mic,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Square,
  Timer,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { PRESET_ICONS } from "../components/soundIcons";
import { Buddy, type BuddyMood, type BuddyTone } from "../components/Buddy";
import { ProportionBar } from "../components/charts/Bars";
import { Avatar, PageTitle, PillTabs, TopBar, cx } from "../components/ui";
import { PRESETS, SOUNDS, soundEngine, type SoundId } from "../lib/audio/engine";
import { backend, isNative } from "../lib/backend";
import { entityName } from "../lib/categories";
import { confirmDialog } from "../lib/dialogs";
import { useMediaQuery, useNow, useQuery } from "../lib/hooks";
import { isMac, isMobileOS } from "../lib/platform";
import { finishOrSkip, remainingNow, useApp } from "../lib/store";
import { matchTask, parseSpokenTask, spokenTaskNumber } from "../lib/spoken";
import { addDays, DAY, dueInfo, fmtClock, fmtDuration, fmtTime, startOfDay } from "../lib/time";
import type { Phase, Task, TimerSnapshot } from "../lib/types";
import { useDictation } from "../lib/voice";
import "../styles/views/home.css";

const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short_break: "Short break", long_break: "Long break" };
const TONE: Record<Phase, BuddyTone> = { focus: "cloud", short_break: "cloud", long_break: "cloud" };

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
  // Switching mode mid-block ends the block, so ask first; a focus block that's
  // under way is finished (its time logged), never thrown away.
  const pickPhase = async (p: Phase) => {
    if (p === timer.phase) return;
    if (timer.startedAt !== null) {
      const focus = timer.phase === "focus";
      const ok = await confirmDialog(
        focus
          ? `The time so far is logged as a finished block, then you switch to ${PHASE_LABEL[p].toLowerCase()}.`
          : `End this ${PHASE_LABEL[timer.phase].toLowerCase()} early?`,
        { title: focus ? "Finish this focus block?" : "End break?", okLabel: focus ? "Finish & switch" : "End early" },
      );
      if (!ok) return;
      if (focus) {
        const next = await finishOrSkip();
        if (next?.phase === p) return;
      }
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

      <header className="home-head">
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
      </header>

      <SetupTip />

      {/* Two rows on a shared two-column grid: every card in a row starts and ends on the same lines. */}
      <div className="home-grid">
        <TimerCard />
        <div className="home-side">
          <TodayTiles />
          <SoundCard />
        </div>
        <UpNext />
        <ScreenTimeCard />
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

/** Open tasks in priority order: the first four are the timer's 1–4. */
function useOpenTasks(): Task[] {
  const { data } = useQuery(() => backend.tasksList(), []);
  return useMemo(() => (data ?? []).filter((t) => !t.done), [data]);
}

type Notice = "missed" | null;

function TimerCard({ deep = false }: { deep?: boolean }) {
  const timer = useApp((s) => s.timer)!;
  const skew = useApp((s) => s.clockSkew);
  const { timerAction, extend, setIntention } = useApp.getState();
  const tasks = useOpenTasks();
  const dictation = useDictation();
  const [notice, setNotice] = useState<Notice>(null);
  const voiceOn = dictation.available && timer.phase === "focus";
  // Before a block starts, the intention's caption sits beside the play button
  // (that corner is empty then), so a two-line focus never makes the card grow.
  const [captionSlot, setCaptionSlot] = useState<HTMLDivElement | null>(null);
  const idleFocus = timer.phase === "focus" && timer.startedAt === null;

  /** Focus on task n (1–4); picking the linked one again unlinks it. */
  const pick = (n: number) => {
    const task = tasks[n - 1];
    if (!task || timer.phase !== "focus") return;
    if (timer.taskId === task.id) void setIntention(timer.intention === task.title ? "" : timer.intention, null);
    else void setIntention(task.title, task.id);
  };

  /** Tap Kai: listen; tap again: done talking. */
  const talk = async () => {
    if (dictation.state === "listening") return dictation.stop();
    if (dictation.busy) return;
    setNotice(null);
    const text = await dictation.listen();
    if (text === null) return;
    if (!text) return setNotice("missed");
    const n = spokenTaskNumber(text);
    const task = n ? tasks[n - 1] : matchTask(text, tasks);
    if (task) return void setIntention(task.title, task.id);
    void setIntention(parseSpokenTask(text).title, null);
  };

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // 1–4 pick a task, V dictates, Escape stops listening (Home only, not while typing).
  const keys = useRef({ pick, talk, dictation });
  keys.current = { pick, talk, dictation };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = keys.current;
      if (/^[1-4]$/.test(e.key)) k.pick(Number(e.key));
      else if (e.key === "v" && k.dictation.available) void k.talk();
      else if (e.key === "Escape" && k.dictation.busy) k.dictation.cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const remaining = remainingNow(timer, skew);
  const progress = timer.durationMs > 0 ? Math.min(1, Math.max(0, 1 - remaining / timer.durationMs)) : 0;
  const running = timer.status === "running";
  const detours = timer.phase === "focus" ? timer.interruptions : 0;
  const elapsed = Math.max(0, timer.durationMs - remaining);

  return (
    <div className={cx("card hero timer-card", `phase-${timer.phase}`, deep && "is-deep")}>
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
          {voiceOn ? (
            <button
              type="button"
              ref={dictation.levelRef as Ref<HTMLButtonElement>}
              className={cx("buddy-voice", `is-${dictation.state}`)}
              aria-label={dictation.state === "listening" ? "Done talking" : "Tell Kai what you're focusing on"}
              title={dictation.state === "listening" ? "Done talking (or just pause)" : "Tap Kai and say what you're working on (V)"}
              aria-pressed={dictation.state === "listening"}
              onClick={() => void talk()}
            >
              <span className="voice-ring" aria-hidden />
              <span className="voice-ring two" aria-hidden />
              <Buddy mood={dictation.state === "listening" ? "listen" : dictation.state === "thinking" ? "think" : moodFor(timer)} tone={TONE[timer.phase]} size={deep ? 150 : 118} />
              <span className="voice-badge" aria-hidden>
                {dictation.state === "listening" ? <Square className="fill" /> : dictation.state === "thinking" ? <LoaderCircle className="spin" /> : <Mic />}
              </span>
            </button>
          ) : (
            <Buddy mood={moodFor(timer)} tone={TONE[timer.phase]} size={deep ? 150 : 118} />
          )}
        </div>
      </div>

      {timer.phase === "focus" ? (
        <Intention tasks={tasks} onPick={pick} voice={voiceOn ? dictation.state : null} notice={notice} captionSlot={idleFocus ? captionSlot : null} />
      ) : (
        <p className="timer-rest">Stand up, stretch, and look at something far away. Your next block will be sharper for it.</p>
      )}

      <div className="timer-controls">
        {idleFocus && <div className="timer-caption" ref={setCaptionSlot} aria-live="polite" />}
        {/* Reset, +5 and skip only matter once a block is under way; idle shows just time, intention and play. */}
        {timer.startedAt !== null && (
          <div className="timer-secondary">
            <button className="circle-btn glass" aria-label="Start over" title="Start over" onClick={() => void timerAction("stop")}>
              <RotateCcw />
            </button>
            <button className="btn btn-glass" onClick={() => void extend(5)}>
              <Plus /> 5 min
            </button>
            {timer.phase === "focus" ? (
              <button className="btn btn-glass" title={`Finish now and log ${fmtDuration(elapsed)} (S)`} onClick={() => void finishOrSkip()}>
                <Check /> Finish
              </button>
            ) : (
              <button className="circle-btn glass" aria-label="Skip break" title="Skip break (S)" onClick={() => void timerAction("skip")}>
                <SkipForward />
              </button>
            )}
          </div>
        )}
        <button className="circle-btn on-brand xl play" aria-label={running ? "Pause" : "Start"} title="Start / pause (Space)" onClick={() => void timerAction("toggle")}>
          {running ? <Pause className="fill" /> : <Play className="fill" />}
        </button>
      </div>
    </div>
  );
}

function Intention({
  tasks,
  onPick,
  voice,
  notice,
  captionSlot,
}: {
  tasks: Task[];
  onPick: (n: number) => void;
  voice: "idle" | "listening" | "thinking" | null;
  notice: Notice;
  /** Where the caption goes instead of under the intention (beside play, before a block starts). */
  captionSlot: HTMLElement | null;
}) {
  const timer = useApp((s) => s.timer)!;
  const setIntention = useApp((s) => s.setIntention);
  const [value, setValue] = useState(timer.intention);
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setValue(timer.intention), [timer.intention]);

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
  const top = tasks.slice(0, 4);
  const commit = () => {
    if (value === timer.intention) return;
    // Typing a task's name links that task (so the block counts toward it).
    const named = tasks.find((t) => t.title.trim().toLowerCase() === value.trim().toLowerCase());
    void setIntention(value, named?.id ?? timer.taskId);
  };
  const text = value.trim();
  // Focus on something that isn't a task yet? One tap makes it one.
  const canAdd = !!text && !linked && !tasks.some((t) => t.title.toLowerCase() === text.toLowerCase());
  const addAsTask = async () => {
    if (adding) return;
    setAdding(true);
    try {
      // "Call the gym tomorrow, one block": the title, its estimate and its day.
      const spoken = parseSpokenTask(text);
      const title = spoken.title || text;
      const id = await backend.taskCreate(title, spoken.estimate ?? 2, spoken.dueDay ?? null);
      await setIntention(title, id);
      useApp.getState().bumpData();
      const info = spoken.dueDay !== undefined ? dueInfo(spoken.dueDay) : null;
      const due = !info ? "" : info.tone === "today" || info.tone === "soon" ? `, due ${info.label.toLowerCase()}` : `, due ${info.label}`;
      useApp.getState().toast({ title: "Added to your tasks", body: `“${title}” is task 1${due}.`, tone: "success" });
    } catch (err) {
      useApp.getState().toast({ title: "Couldn't add the task", body: String(err), tone: "warning" });
    } finally {
      setAdding(false);
    }
  };

  // One line under the intention, most relevant first.
  let caption: ReactNode = null;
  if (voice === "listening")
    caption = (
      <span className="intention-caption live">
        <span className="live-dot" aria-hidden /> Listening… pause when you're done
      </span>
    );
  else if (voice === "thinking") caption = <span className="intention-caption">Writing it down…</span>;
  else if (notice === "missed") caption = <span className="intention-caption">Didn't catch that. Tap Kai to try again.</span>;
  else if (linked && text !== linked.title)
    caption = (
      <span className="intention-caption">
        <ListChecks aria-hidden />
        <span className="ellipsis">{linked.title}</span>
      </span>
    );
  else if (canAdd)
    caption = (
      <button type="button" className="intention-add" onClick={() => void addAsTask()} disabled={adding}>
        <Plus aria-hidden /> Add as task
      </button>
    );
  else if (voice === "idle" && !text) caption = <span className="intention-caption hint">Tap Kai and say what you're working on</span>;

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
        {top.length > 0 && (
          <div className="intention-tasks" role="group" aria-label="Focus on a task">
            {top.map((t, i) => (
              <button
                key={t.id}
                type="button"
                className={cx("task-num", linked?.id === t.id && "on")}
                aria-pressed={linked?.id === t.id}
                aria-label={`Task ${i + 1}: ${t.title}`}
                title={`${t.title} (${i + 1})`}
                onClick={() => onPick(i + 1)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
      {captionSlot ? (
        createPortal(caption, captionSlot)
      ) : (
        <div className="intention-foot" aria-live="polite">
          {caption}
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
    // The last seven days, oldest first: did each one reach the goal?
    const week = Array.from({ length: 7 }, (_, i) => (byDay.get(addDays(today, i - 6)) ?? 0) >= goalMin * 60_000);
    return { ms: byDay.get(today) ?? 0, blocks: todays.filter((s) => s.completed).length, streak, week };
  }, [data, today, goalMin]);
}

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });

/**
 * A ring around a number. `value` (0–1) draws progress from the top; `segments`
 * draws one arc per day instead (lit when that day's goal was met, today last).
 */
function TodayRing({ value, segments, label, children }: { value?: number; segments?: boolean[]; label: string; children: ReactNode }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  return (
    <div className="today-ring" role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" aria-hidden>
        <g transform="rotate(-90 60 60)">
          {segments ? (
            segments.map((hit, i) => {
              const slot = c / segments.length;
              // Round caps reach into the gap, so leave room for them.
              const arc = slot - 16;
              return (
                <circle
                  key={i}
                  className={cx("arc", hit ? "hit" : "miss", i === segments.length - 1 && "today")}
                  cx="60"
                  cy="60"
                  r={r}
                  strokeDasharray={`${arc} ${c - arc}`}
                  strokeDashoffset={-(i * slot + 8)}
                />
              );
            })
          ) : (
            <>
              <circle className="arc track" cx="60" cy="60" r={r} />
              {(value ?? 0) > 0 && (
                <circle className="arc fill" cx="60" cy="60" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value ?? 0))} />
              )}
            </>
          )}
        </g>
      </svg>
      <div className="today-ring-center">{children}</div>
    </div>
  );
}

function TodayTiles() {
  const goalMin = useApp((s) => s.settings.dailyFocusGoalMinutes);
  const { ms, blocks, streak, week } = useFocusToday();
  const goal = goalMin * 60_000;
  const share = goal ? Math.min(1, ms / goal) : 0;
  const hours = ms / 3_600_000;
  const met = week.filter(Boolean).length;
  const today = startOfDay(Date.now());
  const days = week.map((hit, i) => `${WEEKDAY.format(addDays(today, i - 6))} ${hit ? "met" : "missed"}`).join(", ");
  return (
    <div className="grid-2 today-tiles">
      <section className="card today-tile" aria-labelledby="today-focus">
        <header className="today-head">
          <span className="icon-tile round brand-solid">
            <Timer />
          </span>
          <span id="today-focus">Focused today</span>
        </header>
        <TodayRing value={share} label={`${fmtDuration(ms)} of your ${fmtDuration(goal)} goal`}>
          <span className="today-num tabular">
            {hours >= 1 ? hours.toFixed(1) : Math.round(ms / 60_000)}
            <small>{hours >= 1 ? "h" : "min"}</small>
          </span>
          <span className="today-of">of {fmtDuration(goal)}</span>
        </TodayRing>
        <footer className="today-foot">
          {ms >= goal ? "Goal reached. Lovely." : `${blocks} block${blocks === 1 ? "" : "s"} · ${Math.round(share * 100)}% done`}
        </footer>
      </section>
      <section className="card today-tile streak" aria-labelledby="today-streak">
        <header className="today-head">
          <span className="icon-tile round warn">
            <Flame />
          </span>
          <span id="today-streak">Goal streak</span>
        </header>
        <TodayRing segments={week} label={`Goal met on ${met} of the last 7 days: ${days}`}>
          <span className="today-num tabular">
            {streak}
            <small>{streak === 1 ? "day" : "days"}</small>
          </span>
          <span className="today-of">{met} of 7 days</span>
        </TodayRing>
        <footer className="today-foot">{streak ? "Keep the chain going" : `Hit ${fmtDuration(goal)} to start one`}</footer>
      </section>
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

interface Tip {
  id: string;
  icon: ReactNode;
  title: string;
  body: string;
  action: string;
  run: () => unknown;
}

/**
 * One suggestion at a time for installs that predate them: open at login (so the
 * whole day is tracked, not just while the window is open) and, on macOS, reading
 * which website the browser shows.
 */
function SetupTip() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const [atLogin, setAtLogin] = useState<boolean | null>(null);
  const desktop = isNative && !isMobileOS;
  useEffect(() => {
    if (desktop) backend.autostartEnabled().then(setAtLogin).catch(() => setAtLogin(null));
  }, [desktop]);
  const dismissed = settings.tipsDismissed ?? [];
  const openSummary = useApp((s) => s.openSummary);
  const today = startOfDay(Date.now());
  // Evenings: the day's summary, until it's opened or put off.
  const evening = Date.now() >= today + settings.dailySummaryMinutes * 60_000 && settings.summarySeenDay !== today;
  const summaryDue = settings.dailySummary && evening;
  // On the review day, the week takes the evening slot.
  const weekDue = settings.weeklyReview && evening && new Date(today).getDay() === settings.weeklyReviewDay;
  const newer = useApp((s) => s.update);
  let tip: Tip | null = null;
  if (newer && !dismissed.includes(`update-${newer.version}`)) {
    tip = {
      id: `update-${newer.version}`,
      icon: <Download />,
      title: `Kairo ${newer.version} is out`,
      body: "See what's new and download it from the releases page. Your data stays where it is.",
      action: "Get it",
      run: () => backend.updateOpen(),
    };
  } else if (weekDue) {
    tip = {
      id: "summary",
      icon: <CalendarDays />,
      title: "Your week, wrapped",
      body: "How the focus went, your best day, what pulled you away, and a moment to plan the next week.",
      action: "See the week",
      run: () => openSummary(undefined, true),
    };
  } else if (summaryDue) {
    tip = {
      id: "summary",
      icon: <ScrollText />,
      title: "Your day, wrapped",
      body: "See what you got done today, where the time went and what pulled you away.",
      action: "See summary",
      run: () => openSummary(),
    };
  } else if (desktop && atLogin === false && !dismissed.includes("login")) {
    tip = {
      id: "login",
      icon: <Power />,
      title: "Track your whole day",
      body: `Kairo only sees what you do while it's running. Open it at login and it starts quietly in the ${isMac ? "menu bar" : "tray"}.`,
      action: "Open at login",
      run: async () => {
        await backend.setAutostart(true);
        setAtLogin(await backend.autostartEnabled());
      },
    };
  } else if (desktop && isMac && settings.trackingEnabled && !settings.trackBrowserUrls && !dismissed.includes("sites")) {
    tip = {
      id: "sites",
      icon: <Globe />,
      title: "See websites, not just browsers",
      body: "Kairo can read the current tab in Safari, Chrome, Arc and others. macOS asks once per browser; only the site's domain is kept.",
      action: "Turn on",
      run: () => update({ trackBrowserUrls: true }),
    };
  }
  if (!tip) return null;
  const { id, icon, title, body, action, run } = tip;
  return (
    <div className="card tint home-tip" role="note">
      <span className="icon-tile round">{icon}</span>
      <div className="home-tip-text">
        <div className="home-tip-title">{title}</div>
        <div className="home-tip-body">{body}</div>
      </div>
      <div className="home-tip-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => update(id === "summary" ? { summarySeenDay: today } : { tipsDismissed: [...dismissed, id] })}>
          Not now
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => void run()}>
          {action}
        </button>
      </div>
    </div>
  );
}

/** Today's screen time at a glance: how much was tracked, how it split, and where most of it went. */
function ScreenTimeCard() {
  const setView = useApp((s) => s.setView);
  const tracking = useApp((s) => s.settings.trackingEnabled);
  const today = startOfDay(Date.now());
  const { data } = useQuery(async () => {
    const now = Date.now();
    const [[totals], entities] = await Promise.all([backend.bucketTotals([[today, now]]), backend.entityTotals(today, now)]);
    return { totals, top: entities.slice().sort((a, b) => b.ms - a.ms).slice(0, 3) };
  }, [today]);
  const t = data?.totals;
  const active = t ? t.productiveMs + t.neutralMs + t.distractingMs : 0;
  const share = active ? Math.round(((t?.productiveMs ?? 0) / active) * 100) : 0;
  return (
    <div className="card screen-card">
      <div className="card-head">
        <div>
          <div className="card-title">Screen time today</div>
          <div className="card-sub">{active ? `${share}% productive` : tracking ? "Nothing tracked yet" : "Tracking is off"}</div>
        </div>
        <button className="btn btn-ghost btn-sm card-link" onClick={() => setView("stats")}>
          Details
        </button>
      </div>
      <div className="screen-total big-number">
        <Dur ms={active} />
      </div>
      <ProportionBar p={t?.productiveMs ?? 0} n={t?.neutralMs ?? 0} d={t?.distractingMs ?? 0} height={8} />
      {data?.top.length ? (
        <ul className="list screen-top">
          {data.top.map((e) => {
            const name = entityName(e.kind, e.key, e.name);
            return (
              <li key={`${e.kind}:${e.key}`} className="list-row">
                <Avatar name={name} productivity={e.productivity} size={36} iconKey={e.kind === "app" ? e.key : undefined} siteKey={e.kind === "site" ? e.key : undefined} />
                <span className="list-main">
                  <span className="list-title">{name}</span>
                </span>
                <span className="list-trail">{fmtDuration(e.ms)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="screen-empty">{tracking ? "Apps and sites you use today show up here." : "Turn tracking on in Settings to see where your day goes."}</p>
      )}
    </div>
  );
}

/** A duration as big number + small units: "4h 12m" → 4<small>h</small> 12<small>m</small>. */
function Dur({ ms }: { ms: number }) {
  const m = Math.round(ms / 60_000);
  const h = Math.floor(m / 60);
  return h ? (
    <>
      {h}
      <small>h</small> {m % 60}
      <small>m</small>
    </>
  ) : (
    <>
      {m}
      <small>min</small>
    </>
  );
}

function UpNext() {
  const { data } = useQuery(() => backend.tasksList(), []);
  const timer = useApp((s) => s.timer)!;
  const setIntention = useApp((s) => s.setIntention);
  const setView = useApp((s) => s.setView);
  const tasks = (data ?? []).filter((t) => !t.done).slice(0, 4);
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
          {tasks.map((t, i) => (
            <li key={t.id} className={cx("list-row upnext", timer.taskId === t.id && "current")}>
              <button className="upnext-btn" onClick={() => void setIntention(t.title, t.id)} title={`Focus on this (${i + 1})`}>
                <span className="upnext-num" aria-hidden>
                  {i + 1}
                </span>
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
