import {
  CalendarDays,
  Check,
  Coffee,
  Infinity as InfinityIcon,
  Download,
  Flame,
  Globe,
  Headphones,
  ListChecks,
  LoaderCircle,
  Maximize2,
  Mic,
  Minimize2,
  Pause,
  Play,
  Plus,
  Power,
  RotateCcw,
  ScrollText,
  SkipForward,
  Square,
  Wind,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { Buddy, type BuddyMood, type BuddyTone } from "../components/Buddy";
import { ProportionBar } from "../components/charts/Bars";
import { PRESET_ICONS } from "../components/soundIcons";
import { Avatar, Equalizer, PillTabs, TopBar, cx } from "../components/ui";
import { PRESETS, presetFor, SOUNDS, soundEngine, type SoundId } from "../lib/audio/engine";
import { backend, isNative } from "../lib/backend";
import { entityName } from "../lib/categories";
import { confirmDialog } from "../lib/dialogs";
import { useMediaQuery, useNow, useQuery } from "../lib/hooks";
import { isMac, isMobileOS } from "../lib/platform";
import { matchTask, parseSpokenTask, spokenTaskNumber } from "../lib/spoken";
import { finishOrSkip, remainingNow, useApp } from "../lib/store";
import { earnedBreakMs } from "../lib/backend/timerEngine";
import { addDays, DAY, dueInfo, fmtClock, fmtDuration, fmtTime, startOfDay } from "../lib/time";
import type { Phase, Task, TimerSnapshot } from "../lib/types";
import { useDictation } from "../lib/voice";
import "../styles/views/home.css";

const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short_break: "Short break", long_break: "Long break" };
const TONE: Record<Phase, BuddyTone> = { focus: "leaf", short_break: "sky", long_break: "lilac" };

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

function timeOfDay(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The page title and its one line: who, and what the timer is up to. */
function greeting(t: TimerSnapshot, name: string): [string, string] {
  const who = name.trim() ? `${timeOfDay()}, ${name.trim()}` : timeOfDay();
  if (t.status === "paused") return [who, "Paused. Take your time."];
  if (t.phase !== "focus") return [who, t.status === "running" ? "On a break. Breathe out." : "Nice work. Time for a break."];
  if (t.status === "running") return [who, "In the zone."];
  return [who, "Ready when you are."];
}

export function HomeView() {
  const timer = useApp((s) => s.timer)!;
  const deep = useApp((s) => s.deepFocus);
  const settings = useApp((s) => s.settings);
  // Phones get short mode labels so all three pills fit without scrolling.
  const narrow = useMediaQuery("(max-width: 520px)");
  const { setPhase, setDeepFocus } = useApp.getState();

  const [title, sub] = greeting(timer, settings.name ?? "");

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
      <div className={cx("home-deep", `phase-${timer.phase}`)}>
        <button className="circle-btn glass deep-exit" aria-label="Exit deep focus" title="Exit (Esc)" onClick={() => setDeepFocus(false)}>
          <Minimize2 />
        </button>
        <TimerCard deep />
      </div>
    );
  }

  return (
    <div className={cx("home", `phase-${timer.phase}`)}>
      <TopBar
        title={title}
        sub={sub}
        right={
          <>
            <NowChip />
            <button className="circle-btn" aria-label="Deep focus mode" title="Deep focus (F)" onClick={() => setDeepFocus(true)}>
              <Maximize2 />
            </button>
          </>
        }
      />

      <div className="home-tabs">
        <PillTabs<Phase>
          label="Timer mode"
          value={timer.phase}
          onChange={(p) => void pickPhase(p)}
          options={[
            {
              value: "focus",
              label: "Focus",
              count: settings.flowMode ? (
                <>
                  <span aria-hidden>∞</span>
                  <span className="sr-only">flow</span>
                </>
              ) : (
                minutes(settings.focusMinutes)
              ),
            },
            { value: "short_break", label: narrow ? "Short" : "Short break", count: minutes(settings.shortBreakMinutes) },
            { value: "long_break", label: narrow ? "Long" : "Long break", count: minutes(settings.longBreakMinutes) },
          ]}
        />
      </div>

      <SetupTip />

      {/* Two rows on a shared two-column grid: every card in a row starts and ends on the same lines. */}
      <div className="home-grid">
        <TimerCard />
        <div className="home-side">
          <TodayCard />
          <SoundCard />
        </div>
        <UpNext />
        <ScreenTimeCard />
      </div>
    </div>
  );
}

/** What's in front right now, as a small chip (or a nudge when tracking needs attention). */
function NowChip() {
  const tracker = useApp((s) => s.tracker);
  const trackingEnabled = useApp((s) => s.settings.trackingEnabled);
  const timer = useApp((s) => s.timer)!;
  const setView = useApp((s) => s.setView);
  useNow(30_000);
  if (!tracker?.supported || !trackingEnabled) return null;
  if (tracker.needsPermission) {
    return (
      <button className="now-chip attention" onClick={() => setView("settings")}>
        Allow usage access
      </button>
    );
  }
  if (tracker.pausedUntil) {
    return (
      <span className="now-chip" title={`Tracking is paused until ${fmtTime(tracker.pausedUntil)}`}>
        <span className="now-dot paused" aria-hidden />
        Paused until {fmtTime(tracker.pausedUntil)}
      </span>
    );
  }
  const current = tracker.current;
  if (!current) return null;
  const name = entityName(current.domain ? "site" : "app", current.domain ?? current.appId, current.appName);
  const offTrack = current.productivity < 0 && timer.phase === "focus" && timer.status === "running";
  return (
    <span className={cx("now-chip", offTrack && "off-track")} title={offTrack ? "A distracting app, mid-block" : `Now: ${name}`}>
      <Avatar name={name} productivity={current.productivity} size={24} iconKey={current.domain ? undefined : current.appId} siteKey={current.domain ?? undefined} />
      <span className="now-name">{name}</span>
    </span>
  );
}

function SessionDots({ timer }: { timer: TimerSnapshot }) {
  const total = Math.max(1, timer.cycleLength);
  const done = Math.min(timer.cycle, total);
  const current = timer.phase === "focus" ? Math.min(timer.cycle, total - 1) : -1;
  const label = timer.phase === "focus" ? `Block ${current + 1} of ${total}` : `${done} of ${total} blocks done`;
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

/** How a block felt, in Kai's faces. */
const RATINGS: { value: number; label: string; mood: BuddyMood }[] = [
  { value: 1, label: "Scattered", mood: "paused" },
  { value: 2, label: "Okay", mood: "idle" },
  { value: 3, label: "Deep", mood: "happy" },
];

/** Right after a block: one tap for how it felt (it shows up in Stats). */
function CheckIn() {
  const rate = useApp((s) => s.rateCheckIn);
  return (
    <div className="checkin">
      <p className="checkin-q" id="checkin-q">
        How did that block feel?
      </p>
      <div className="checkin-options" role="group" aria-labelledby="checkin-q">
        {RATINGS.map((r) => (
          <button key={r.value} type="button" className="checkin-opt" onClick={() => void rate(r.value)}>
            <Buddy mood={r.mood} size={40} still />
            <span>{r.label}</span>
          </button>
        ))}
        <button type="button" className="circle-btn sm glass checkin-skip" aria-label="Skip" title="Skip" onClick={() => void rate(null)}>
          <X />
        </button>
      </div>
    </div>
  );
}

/** Breathe with Kai: 4 seconds in, 6 out (six breaths a minute), for a minute. */
const BREATH = { in: 4000, out: 6000, cycles: 6 };
type Breath = { phase: "in" | "out" | "done"; cycle: number } | null;

function useBreathing(active: boolean) {
  const [breath, setBreath] = useState<Breath>(null);
  useEffect(() => {
    if (!breath) return;
    const next: Breath =
      breath.phase === "in"
        ? { phase: "out", cycle: breath.cycle }
        : breath.phase === "out"
          ? breath.cycle + 1 < BREATH.cycles
            ? { phase: "in", cycle: breath.cycle + 1 }
            : { phase: "done", cycle: breath.cycle }
          : null;
    const wait = breath.phase === "in" ? BREATH.in : breath.phase === "out" ? BREATH.out : 2400;
    const t = window.setTimeout(() => setBreath(next), wait);
    return () => window.clearTimeout(t);
  }, [breath]);
  // The break ended (or was skipped): stop.
  useEffect(() => {
    if (!active) setBreath(null);
  }, [active]);
  return {
    breath,
    start: () => setBreath({ phase: "in", cycle: 0 }),
    stop: () => setBreath(null),
  };
}

function TimerCard({ deep = false }: { deep?: boolean }) {
  const timer = useApp((s) => s.timer)!;
  const skew = useApp((s) => s.clockSkew);
  // Only the timer ticks: the rest of Home doesn't re-render every 250 ms.
  useNow(250, timer.status === "running");
  const remaining = remainingNow(timer, skew);
  const elapsed = Math.max(0, timer.durationMs - remaining);
  // Flow blocks count up; everything else counts down.
  const flow = timer.flow && timer.phase === "focus";
  const shown = flow ? elapsed : remaining;
  useEffect(() => {
    document.title = timer.status === "idle" ? "Kairo" : `${fmtClock(shown)} · ${flow ? "Flow" : PHASE_LABEL[timer.phase]}`;
  }, [shown, flow, timer.status, timer.phase]);
  useEffect(() => () => void (document.title = "Kairo"), []);
  const { timerAction, extend, setIntention, updateSettings } = useApp.getState();
  const flowMode = useApp((s) => s.settings.flowMode);
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
  const progress = timer.durationMs > 0 ? Math.min(1, Math.max(0, 1 - remaining / timer.durationMs)) : 0;
  const running = timer.status === "running";
  const detours = timer.phase === "focus" ? timer.interruptions : 0;
  const earned = Math.round(earnedBreakMs(elapsed) / 60_000);
  const onBreak = timer.phase !== "focus";
  const checkIn = useApp((s) => s.checkIn);
  const { breath, start: breathe, stop: stopBreathing } = useBreathing(onBreak);
  const mood: BuddyMood =
    dictation.state === "listening"
      ? "listen"
      : dictation.state === "thinking"
        ? "think"
        : breath
          ? breath.phase === "done"
            ? "happy"
            : "calm"
          : moodFor(timer);
  const kaiSize = deep ? 184 : 150;

  return (
    <div
      className={cx("card hero timer-card", `phase-${timer.phase}`, `is-${timer.status}`, deep && "is-deep", breath && "is-breathing")}
      data-breath={breath?.phase}
    >
      <div className="timer-top">
        <SessionDots timer={timer} />
        <div className="timer-top-end">
          {detours > 0 && (
            <span className="chip on-brand detours" title="Times you switched to a distracting app during this block">
              {detours} detour{detours > 1 ? "s" : ""}
            </span>
          )}
          {idleFocus && (
            <button
              type="button"
              className={cx("chip on-brand flow-toggle", flowMode && "on")}
              aria-pressed={flowMode}
              title={flowMode ? "Flow: counts up, and you earn your break (a fifth of the time). Tap for a countdown." : "Count up instead, and earn your break"}
              onClick={() => updateSettings({ flowMode: !flowMode })}
            >
              <InfinityIcon /> Flow
            </button>
          )}
          {timer.status !== "idle" &&
            (flow ? (
              <span className="chip on-brand">{running ? <span className="live-dot" aria-hidden /> : null}{running ? "Flow" : "Paused"}</span>
            ) : (
              <span className="chip on-brand">{running ? `Ends ${fmtTime(Date.now() + remaining)}` : "Paused"}</span>
            ))}
        </div>
      </div>

      <div className="timer-body">
        <div className="timer-text">
          <div className="timer-digits tabular" aria-live="off">
            {fmtClock(shown)}
          </div>
          {flow ? (
            <div className={cx("timer-progress is-flow", running && "is-moving")} aria-hidden />
          ) : (
            <div className="timer-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Block progress">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          )}
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
              <Buddy mood={mood} tone={TONE[timer.phase]} size={kaiSize} />
              <span className="voice-badge" aria-hidden>
                {dictation.state === "listening" ? <Square className="fill" /> : dictation.state === "thinking" ? <LoaderCircle className="spin" /> : <Mic />}
              </span>
            </button>
          ) : (
            <Buddy mood={mood} tone={TONE[timer.phase]} size={kaiSize} />
          )}
        </div>
      </div>

      {timer.phase === "focus" ? (
        <Intention tasks={tasks} onPick={pick} voice={voiceOn ? dictation.state : null} notice={notice} captionSlot={idleFocus ? captionSlot : null} />
      ) : (
        <div className="timer-rest" aria-live="polite">
          {checkIn !== null && !breath ? (
            <CheckIn />
          ) : breath ? (
            <div className="breath">
              <span className="breath-word" key={`${breath.phase}${breath.cycle}`}>
                {breath.phase === "in" ? "Breathe in" : breath.phase === "out" ? "Breathe out" : "Nice."}
              </span>
              <span className="breath-dots" aria-hidden>
                {Array.from({ length: BREATH.cycles }, (_, i) => (
                  <i key={i} className={cx(i < breath.cycle && "done", i === breath.cycle && breath.phase !== "done" && "now")} />
                ))}
              </span>
            </div>
          ) : (
            <>
              <p>Stretch, sip some water, look far away.</p>
              <button type="button" className="btn btn-glass btn-sm breath-start" onClick={breathe}>
                <Wind /> Breathe with Kai
              </button>
            </>
          )}
        </div>
      )}

      <div className="timer-controls">
        {idleFocus && <div className="timer-caption" ref={setCaptionSlot} aria-live="polite" />}
        {/* Reset, +5 and finish only matter once a block is under way. */}
        {timer.startedAt !== null && (
          <div className="timer-secondary">
            <button className="circle-btn glass" aria-label="Start over" title="Start over" onClick={() => void timerAction("stop")}>
              <RotateCcw />
            </button>
            {!flow && !breath && (
              <button className="btn btn-glass" title="Add 5 minutes" onClick={() => void extend(5)}>
                <Plus /> 5 min
              </button>
            )}
            {flow ? (
              <button className="btn btn-glass" title={`Log ${fmtDuration(elapsed)} and take a ${earned}-minute break (S)`} onClick={() => void finishOrSkip()}>
                <Coffee /> Break · {earned}m
              </button>
            ) : timer.phase === "focus" ? (
              <button className="btn btn-glass" title={`Finish now and log ${fmtDuration(elapsed)} (S)`} onClick={() => void finishOrSkip()}>
                <Check /> Finish
              </button>
            ) : (
              <>
                {breath && breath.phase !== "done" && (
                  <button className="btn btn-glass" onClick={stopBreathing}>
                    Stop
                  </button>
                )}
                <button className="circle-btn glass" aria-label="Skip break" title="Skip break (S)" onClick={() => void timerAction("skip")}>
                  <SkipForward />
                </button>
              </>
            )}
          </div>
        )}
        <button className={cx("circle-btn on-brand xl play", running && "is-running")} aria-label={running ? "Pause" : "Start"} title="Start / pause (Space)" onClick={() => void timerAction("toggle")}>
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
    // A different focus than the linked task's: it no longer counts toward that task.
    const keep = linked && value.trim() === "" ? null : timer.taskId;
    void setIntention(value, named?.id ?? keep);
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
      useApp.getState().toast({ title: "Added to your tasks", body: `“${title}”${due}.`, tone: "success" });
    } catch (err) {
      useApp.getState().toast({ title: "Couldn't add the task", body: String(err), tone: "warning" });
    } finally {
      setAdding(false);
    }
  };

  // One short line under the intention, only when there's something to say.
  let caption: ReactNode = null;
  if (voice === "listening")
    caption = (
      <span className="intention-caption live">
        <span className="live-dot" aria-hidden /> Listening…
      </span>
    );
  else if (voice === "thinking") caption = <span className="intention-caption">Writing it down…</span>;
  else if (notice === "missed") caption = <span className="intention-caption">Didn't catch that. Try again?</span>;
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
            } else if (e.key === "Escape") {
              setValue(timer.intention);
              requestAnimationFrame(() => input.current?.blur());
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

const WEEKDAY_LETTER = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "long" });

/** Today's focus against the goal (a ring), and the last seven days as dots. */
function TodayCard() {
  const goalMin = useApp((s) => s.settings.dailyFocusGoalMinutes);
  const setView = useApp((s) => s.setView);
  const { ms, blocks, streak, week } = useFocusToday();
  const goal = goalMin * 60_000;
  const share = goal ? Math.min(1, ms / goal) : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  const today = startOfDay(Date.now());
  const met = ms >= goal && goal > 0;
  return (
    <section className="card today-card" aria-labelledby="today-title">
      <button type="button" className="today-ring" onClick={() => setView("stats")} aria-label={`${fmtDuration(ms)} focused of your ${fmtDuration(goal)} goal. Open stats`}>
        <svg viewBox="0 0 120 120" aria-hidden>
          <circle className="track" cx="60" cy="60" r={r} />
          <circle className={cx("fill", met && "met")} cx="60" cy="60" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - share)} transform="rotate(-90 60 60)" />
        </svg>
        <span className="today-ring-center">
          <span className="today-num tabular">{ms >= 3_600_000 ? (ms / 3_600_000).toFixed(1) : Math.round(ms / 60_000)}</span>
          <span className="today-unit">{ms >= 3_600_000 ? "hours" : "min"}</span>
        </span>
      </button>
      <div className="today-text">
        <h2 className="card-title" id="today-title">
          {met ? "Goal reached" : "Today"}
        </h2>
        <p className="today-sub">
          {blocks} block{blocks === 1 ? "" : "s"} · goal {fmtDuration(goal)}
        </p>
        <div className="today-week" role="img" aria-label={`Goal met on ${week.filter(Boolean).length} of the last 7 days`}>
          {week.map((hit, i) => {
            const day = addDays(today, i - 6);
            return (
              <span key={i} className={cx("today-day", hit && "hit", i === 6 && "now")} title={`${WEEKDAY.format(day)}: ${hit ? "goal met" : "not yet"}`}>
                <span className="today-dot" />
                <span className="today-letter" aria-hidden>
                  {WEEKDAY_LETTER.format(day)}
                </span>
              </span>
            );
          })}
        </div>
        {streak > 1 && (
          <span className="badge warn today-streak">
            <Flame /> {streak} days
          </span>
        )}
      </div>
    </section>
  );
}

function SoundCard() {
  const playing = useApp((s) => s.soundPlaying);
  const sound = useApp((s) => s.settings.sound!);
  const updateSound = useApp((s) => s.updateSound);
  const setView = useApp((s) => s.setView);
  const active = SOUNDS.filter((s) => (sound.levels[s.id] ?? 0) > 0);
  const preset = presetFor(sound.levels);
  const name = preset?.name ?? (active.length ? "Your mix" : "Pick a sound");
  return (
    <div className={cx("card sound-card", playing && "is-playing")}>
      <button className={cx("art sound-art", `art-${preset?.id ?? "custom"}`)} aria-label="Open soundscapes" title="Soundscapes" onClick={() => setView("sounds")}>
        {playing ? <Equalizer /> : preset ? PRESET_ICONS[preset.id] : <Headphones />}
      </button>
      <div className="sound-meta">
        <label className="sound-pick" title="Change soundscape">
          <span className="card-title">{name}</span>
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
        <span className="sound-sub">{active.length ? active.map((s) => s.label).join(" · ") : "Nothing selected"}</span>
      </div>
      <button className={cx("circle-btn", playing ? "ink" : "soft")} aria-label={playing ? "Pause soundscape" : "Play soundscape"} disabled={!active.length} onClick={() => void soundEngine.toggle()}>
        {playing ? <Pause className="fill" /> : <Play className="fill" />}
      </button>
    </div>
  );
}

interface Tip {
  id: string;
  icon: ReactNode;
  title: string;
  action: string;
  run: () => unknown;
}

/**
 * One suggestion at a time: a new version, the day's (or week's) summary in
 * the evening, opening at login (so the whole day is tracked) and, on macOS,
 * reading which website the browser shows.
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
    tip = { id: `update-${newer.version}`, icon: <Download />, title: `Kairo ${newer.version} is out`, action: "Get it", run: () => backend.updateOpen() };
  } else if (weekDue) {
    tip = { id: "summary", icon: <CalendarDays />, title: "Your week, wrapped", action: "Open", run: () => openSummary(undefined, true) };
  } else if (summaryDue) {
    tip = { id: "summary", icon: <ScrollText />, title: "Your day, wrapped", action: "Open", run: () => openSummary() };
  } else if (desktop && atLogin === false && !dismissed.includes("login")) {
    tip = {
      id: "login",
      icon: <Power />,
      title: `Open at login to track your whole day`,
      action: "Turn on",
      run: async () => {
        await backend.setAutostart(true);
        setAtLogin(await backend.autostartEnabled());
      },
    };
  } else if (desktop && isMac && settings.trackingEnabled && !settings.trackBrowserUrls && !dismissed.includes("sites")) {
    tip = { id: "sites", icon: <Globe />, title: "See websites, not just browsers", action: "Turn on", run: () => update({ trackBrowserUrls: true }) };
  }
  if (!tip) return null;
  const { id, icon, title, action, run } = tip;
  return (
    <div className="home-tip" role="note">
      <span className="home-tip-icon">{icon}</span>
      <span className="home-tip-title">{title}</span>
      <button className="btn btn-primary btn-sm" onClick={() => void run()}>
        {action}
      </button>
      <button
        className="circle-btn sm ghost home-tip-close"
        aria-label="Not now"
        title="Not now"
        onClick={() => update(id === "summary" ? { summarySeenDay: today } : { tipsDismissed: [...dismissed, id] })}
      >
        <X />
      </button>
    </div>
  );
}

/** Today's screen time at a glance: how much, how it split, and where most of it went. */
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
    <section className="card screen-card" aria-labelledby="screen-title">
      <div className="card-head">
        <h2 className="card-title" id="screen-title">
          Screen time
        </h2>
        <button className="btn btn-ghost btn-sm card-link" onClick={() => setView("stats")}>
          Details
        </button>
      </div>
      <div className="screen-figure">
        <span className="big-number">
          <Dur ms={active} />
        </span>
        {active >= 60_000 && <span className="badge brand">{share}% productive</span>}
      </div>
      <ProportionBar p={t?.productiveMs ?? 0} n={t?.neutralMs ?? 0} d={t?.distractingMs ?? 0} height={8} />
      {data?.top.length ? (
        <ul className="list screen-top">
          {data.top.map((e) => {
            const name = entityName(e.kind, e.key, e.name);
            return (
              <li key={`${e.kind}:${e.key}`} className="list-row">
                <Avatar name={name} productivity={e.productivity} size={34} iconKey={e.kind === "app" ? e.key : undefined} siteKey={e.kind === "site" ? e.key : undefined} />
                <span className="list-main">
                  <span className="list-title">{name}</span>
                </span>
                <span className="list-trail">{fmtDuration(e.ms)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="screen-empty">{tracking ? "Your apps and sites show up here." : "Tracking is off."}</p>
      )}
    </section>
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
      {ms > 0 && m === 0 ? "<1" : m}
      <small>min</small>
    </>
  );
}

function UpNext() {
  const tasks = useOpenTasks().slice(0, 4);
  const timer = useApp((s) => s.timer)!;
  const setIntention = useApp((s) => s.setIntention);
  const setView = useApp((s) => s.setView);
  const focusing = timer.phase === "focus";
  return (
    <section className="card upnext-card" aria-labelledby="upnext-title">
      <div className="card-head">
        <h2 className="card-title" id="upnext-title">
          Up next
        </h2>
        <button className="btn btn-ghost btn-sm card-link" onClick={() => setView("tasks")}>
          All tasks
        </button>
      </div>
      {tasks.length ? (
        <ul className="list">
          {tasks.map((t, i) => {
            const current = timer.taskId === t.id;
            const share = t.estimate ? Math.min(1, t.pomodoros / t.estimate) : 0;
            return (
              <li key={t.id} className={cx("upnext", current && "current")}>
                <button
                  className="upnext-btn"
                  disabled={!focusing}
                  onClick={() => void setIntention(t.title, t.id)}
                  title={focusing ? `Focus on this (${i + 1})` : "Pick a task when the break is over"}
                >
                  <span className="upnext-num" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="list-main">
                    <span className="list-title">{t.title}</span>
                  </span>
                  <span className="upnext-progress" title={`${t.pomodoros} of ${t.estimate} blocks`}>
                    <span className="upnext-bar" aria-hidden>
                      <span style={{ width: `${share * 100}%` }} />
                    </span>
                    <span className="upnext-count tabular">
                      {t.pomodoros}/{t.estimate}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="upnext-empty">
          <Buddy mood="idle" size={64} />
          <button className="btn btn-soft btn-sm" onClick={() => setView("tasks")}>
            <Plus /> Plan a task
          </button>
        </div>
      )}
    </section>
  );
}
