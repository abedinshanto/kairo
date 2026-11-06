import { create } from "zustand";
import { PRESETS, soundEngine, type SoundId } from "./audio/engine";
import { backend } from "./backend";
import { DEFAULT_SETTINGS, withDefaults } from "./defaults";
import { iconChanged } from "./icons";
import { fmtDuration, startOfDay } from "./time";
import type { Phase, Settings, SoundPrefs, TimerAction, TimerSnapshot, TrackerStatus, UpdateInfo } from "./types";
import { isMainWindow } from "./windowRole";

export type View = "home" | "stats" | "sounds" | "tasks" | "settings" | "apps" | "summary";
export const VIEWS: View[] = ["home", "stats", "sounds", "tasks", "settings", "apps", "summary"];
/** Views reachable from the bottom navigation, in order (⌘1…⌘5). */
export const TAB_VIEWS: View[] = ["home", "stats", "sounds", "tasks", "settings"];

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: "default" | "success" | "warning";
}

interface State {
  ready: boolean;
  view: View;
  settings: Settings;
  timer: TimerSnapshot | null;
  /** Local clock minus core clock, so countdowns match the core exactly. */
  clockSkew: number;
  tracker: TrackerStatus | null;
  dataVersion: number;
  toasts: Toast[];
  soundPlaying: boolean;
  /** Bumped when a link changes the current screen's options (e.g. #/stats?r=7 on Stats), so it re-reads them. */
  routeKey: number;
  /** A newer Kairo, when update checks are on and found one. */
  update: UpdateInfo | null;
  /** When the soundscape stops by itself: a time, the end of this focus block, or never. */
  soundStop: number | "block" | null;
  deepFocus: boolean;
  /** The day the summary view shows (local midnight); null = today. */
  summaryDay: number | null;
  /** The summary shows the week ending on `summaryDay` instead of the day. */
  summaryWeek: boolean;

  init(): Promise<void>;
  openSummary(day?: number, week?: boolean): void;
  setView(v: View): void;
  setDeepFocus(on: boolean): void;
  updateSettings(patch: Partial<Settings>): void;
  updateSound(patch: Partial<SoundPrefs>): void;
  /** Stop the soundscape in `minutes`, at the end of the focus block, or never. */
  setSoundStop(when: number | "block" | null): void;
  timerAction(a: TimerAction): Promise<TimerSnapshot>;
  setPhase(p: Phase): Promise<void>;
  extend(minutes: number): Promise<void>;
  setIntention(intention: string, taskId: number | null): Promise<void>;
  pauseTracking(minutes: number | null): Promise<void>;
  refreshTracker(): Promise<void>;
  bumpData(): void;
  toast(t: Omit<Toast, "id">): void;
  dismissToast(id: number): void;
}

let persistTimer: number | undefined;
/**
 * Local changes the core hasn't confirmed yet. While there are any, the core's
 * echoes of earlier saves are stale and ignored (they'd snap a slider being
 * dragged back to where it was a moment ago).
 */
let unsavedChanges = false;
let saveSeq = 0;
let toastId = 1;

const viewFromHash = (): View | null => {
  const h = window.location.hash.replace(/^#\/?/, "").split("?")[0] as View;
  return VIEWS.includes(h) ? h : null;
};

export const useApp = create<State>((set, get) => ({
  ready: false,
  view: viewFromHash() ?? "home",
  settings: DEFAULT_SETTINGS,
  timer: null,
  clockSkew: 0,
  tracker: null,
  dataVersion: 0,
  toasts: [],
  soundPlaying: false,
  routeKey: 0,
  update: null,
  soundStop: null,
  deepFocus: false,
  summaryDay: null,
  summaryWeek: false,

  async init() {
    const [settings, timer, tracker] = await Promise.all([
      backend.getSettings(),
      backend.timerGet(),
      backend.trackerStatus(),
    ]);
    const s = withDefaults(settings);
    soundEngine.setLevels(s.sound!.levels as Partial<Record<SoundId, number>>);
    soundEngine.setMaster(s.sound!.master);
    set({ settings: s, timer, clockSkew: Date.now() - timer.now, tracker, ready: true });

    soundEngine.subscribe(() => {
      set({ soundPlaying: soundEngine.playing });
      // Played or stopped by hand: that wins over what a break would bring back.
      if (!autoSound) pausedForBreak = false;
      if (!soundEngine.playing && get().soundStop !== null) get().setSoundStop(null);
    });

    backend.subscribe((e) => {
      switch (e.type) {
        case "timer":
          if (isMainWindow) onTimer(get().timer, e.snapshot);
          set({ timer: e.snapshot, clockSkew: Date.now() - e.snapshot.now });
          break;
        case "completed": {
          // The panel and capture box see this too; only the main window chimes and toasts.
          if (!isMainWindow) break;
          const sound = get().settings.sound!;
          void soundEngine.chime(sound.chime, sound.chimeVolume, e.completed.next === "focus");
          // Fires before the new timer state, so `timer` still describes the block that ended.
          const ended = get().timer;
          const what = ended?.intention.trim() ? ` on “${ended.intention.trim()}”` : "";
          const breakNote = e.completed.autoStarted ? "Your break has started." : "Time for a break.";
          get().toast(
            e.completed.phase !== "focus"
              ? { title: "Break's over", body: e.completed.autoStarted ? "Next focus block started." : "Ready when you are.", tone: "default" }
              : e.completed.early
                ? { title: "Block finished", body: `${fmtDuration(e.completed.actualMs)}${what} logged. ${breakNote}`, tone: "success" }
                : { title: "Focus block complete", body: e.completed.autoStarted ? "Your break has started. Step away for a moment." : "Time for a break.", tone: "success" },
          );
          get().bumpData();
          break;
        }
        case "current":
          set((st) => ({ tracker: st.tracker ? { ...st.tracker, current: e.current } : st.tracker }));
          break;
        case "tracker":
          set({ tracker: e.status });
          break;
        case "settings":
          if (!unsavedChanges) set({ settings: withDefaults(e.settings) });
          break;
        case "data":
          get().bumpData();
          break;
        case "icon":
          iconChanged(e.key);
          break;
        case "summary":
          if (isMainWindow) get().openSummary(undefined, e.week);
          break;
        case "open-view":
          if (isMainWindow && VIEWS.includes(e.view as View)) get().setView(e.view as View);
          break;
        case "shown":
          get().bumpData();
          void get().refreshTracker();
          break;
        case "update":
          set({ update: e.update });
          break;
      }
    });

    backend
      .updateStatus()
      .then((update) => update && set({ update }))
      .catch(() => {});

    // Live views refresh periodically; mobile pulls OS usage when foregrounded.
    window.setInterval(() => get().bumpData(), 60_000);
    const syncUsage = () =>
      backend
        .usageSync()
        .then((n) => n > 0 && get().bumpData())
        .catch(() => {});
    if (isMainWindow) void syncUsage();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void syncUsage();
        void get().refreshTracker();
        get().bumpData();
      }
    });
    window.addEventListener("hashchange", () => {
      const v = viewFromHash();
      if (!v) return;
      // Same screen, other options: it starts over from the link.
      if (v === get().view) set((st) => ({ routeKey: st.routeKey + 1 }));
      else set({ view: v });
    });
  },

  setView(view) {
    if (window.location.hash !== `#/${view}`) window.history.replaceState(null, "", `#/${view}`);
    set({ view, deepFocus: false });
  },

  openSummary(day, week) {
    set({ summaryDay: day ?? null, summaryWeek: !!week });
    get().setView("summary");
    get().updateSettings({ summarySeenDay: startOfDay(day ?? Date.now()) });
  },

  setDeepFocus(deepFocus) {
    set({ deepFocus });
  },

  updateSettings(patch) {
    const next = withDefaults({ ...get().settings, ...patch });
    set({ settings: next });
    unsavedChanges = true;
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = undefined;
      const mine = ++saveSeq;
      backend
        .updateSettings(next)
        .then((saved) => {
          // The latest save, with nothing newer waiting: take the core's version (it may clamp values).
          if (mine === saveSeq && persistTimer === undefined) {
            unsavedChanges = false;
            set({ settings: withDefaults(saved) });
          }
        })
        .catch((err) => {
          if (mine === saveSeq && persistTimer === undefined) unsavedChanges = false;
          get().toast({ title: "Couldn't save settings", body: String(err), tone: "warning" });
        });
    }, 350);
  },

  updateSound(patch) {
    const sound = { ...get().settings.sound!, ...patch };
    if (patch.levels) soundEngine.setLevels(patch.levels as Partial<Record<SoundId, number>>);
    if (patch.master !== undefined) soundEngine.setMaster(patch.master);
    get().updateSettings({ sound });
  },

  setSoundStop(when) {
    window.clearTimeout(soundStopTimer);
    if (typeof when === "number") {
      const at = Date.now() + when * 60_000;
      soundStopTimer = window.setTimeout(() => {
        set({ soundStop: null });
        if (soundEngine.playing) soundEngine.pause();
      }, at - Date.now());
      set({ soundStop: at });
    } else {
      set({ soundStop: when });
    }
  },

  async timerAction(a) {
    if (a === "start" || a === "toggle" || a === "resume") void backend.ensureNotificationPermission().catch(() => {});
    const timer = await backend.timerAction(a);
    if (isMainWindow) onTimer(get().timer, timer);
    set({ timer, clockSkew: Date.now() - timer.now });
    return timer;
  },
  async setPhase(p) {
    const timer = await backend.timerSetPhase(p);
    set({ timer, clockSkew: Date.now() - timer.now });
  },
  async extend(minutes) {
    const timer = await backend.timerExtend(minutes);
    set({ timer, clockSkew: Date.now() - timer.now });
  },
  async setIntention(intention, taskId) {
    const timer = await backend.timerSetIntention(intention, taskId);
    set({ timer });
  },

  async pauseTracking(minutes) {
    set({ tracker: await backend.trackerPause(minutes) });
  },
  async refreshTracker() {
    set({ tracker: await backend.trackerStatus() });
  },

  bumpData() {
    set((s) => ({ dataVersion: s.dataVersion + 1 }));
  },

  toast(t) {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, ...t }] }));
    window.setTimeout(() => get().dismissToast(id), 5200);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** The mix was faded out for a break, so it comes back when focus resumes. */
let pausedForBreak = false;
/** Set while the timer (not the user) starts or stops the sound. */
let autoSound = false;
let soundStopTimer: number | undefined;

const autoPause = () => {
  autoSound = true;
  soundEngine.pause();
  autoSound = false;
};

/** Couple the soundscape to the timer: auto-play on focus, fade out on breaks. */
function onTimer(prev: TimerSnapshot | null, next: TimerSnapshot) {
  const { settings, soundStop, setSoundStop } = useApp.getState();
  const sound = settings.sound;
  if (!sound) return;
  const startedFocus = next.phase === "focus" && next.status === "running" && !(prev?.phase === "focus" && prev.status === "running");
  // A new block, not one coming back from a pause.
  const freshBlock = startedFocus && (prev?.phase !== "focus" || prev.startedAt !== next.startedAt);
  const leftFocus = prev?.phase === "focus" && prev.startedAt !== null && (next.phase !== "focus" || next.startedAt === null);
  const enteredBreak = next.phase !== "focus" && prev?.phase === "focus";
  if (startedFocus) {
    const resume = (sound.autoPlay || pausedForBreak) && soundEngine.hasMix && !soundEngine.playing;
    pausedForBreak = false;
    if (freshBlock && next.taskId !== null) void playTaskSound(next.taskId, resume);
    else if (resume) void soundEngine.play();
  }
  if (leftFocus && soundStop === "block") {
    setSoundStop(null);
    if (soundEngine.playing) autoPause();
  }
  if (enteredBreak && sound.pauseOnBreak && soundEngine.playing) {
    autoPause();
    pausedForBreak = true;
  }
}

/** A task can bring its own sound to its focus blocks: a preset, or silence. */
async function playTaskSound(taskId: number, resume: boolean) {
  let sound: string | null = null;
  try {
    sound = (await backend.tasksList()).find((t) => t.id === taskId)?.sound ?? null;
  } catch {
    /* no task list: just carry on */
  }
  const preset = PRESETS.find((p) => p.id === sound);
  if (sound === "off") {
    if (soundEngine.playing) autoPause();
    return;
  }
  if (preset) {
    useApp.getState().updateSound({ levels: preset.levels as Record<string, number> });
    if (!soundEngine.playing) void soundEngine.play();
    return;
  }
  if (resume) void soundEngine.play();
}

/**
 * The S key: finish a running focus block (its time is logged as a finished
 * block and the break begins), or skip ahead from a break or an untouched block.
 */
export async function finishOrSkip(): Promise<TimerSnapshot | undefined> {
  const { timer: t, clockSkew, timerAction, toast } = useApp.getState();
  if (!t) return;
  if (t.phase !== "focus" || t.startedAt === null) return timerAction("skip");
  if (t.durationMs - remainingNow(t, clockSkew) < MIN_LOGGED_MS) {
    toast({ title: "Started over", body: "Blocks under a minute aren't logged.", tone: "default" });
  }
  return timerAction("finish");
}

/** The core doesn't log focus blocks shorter than this (timer.rs MIN_RECORDED_MS). */
const MIN_LOGGED_MS = 60_000;

/** Remaining time for a snapshot at the current instant. */
export function remainingNow(t: TimerSnapshot, skew: number): number {
  if (t.status !== "running" || t.endsAt === null) return t.remainingMs;
  return Math.max(0, t.endsAt - (Date.now() - skew));
}
