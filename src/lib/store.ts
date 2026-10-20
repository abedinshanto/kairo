import { create } from "zustand";
import { soundEngine, type SoundId } from "./audio/engine";
import { backend } from "./backend";
import { DEFAULT_SETTINGS, withDefaults } from "./defaults";
import type { Phase, Settings, SoundPrefs, TimerAction, TimerSnapshot, TrackerStatus } from "./types";

export type View = "home" | "stats" | "sounds" | "tasks" | "settings" | "apps";
export const VIEWS: View[] = ["home", "stats", "sounds", "tasks", "settings", "apps"];
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
  deepFocus: boolean;

  init(): Promise<void>;
  setView(v: View): void;
  setDeepFocus(on: boolean): void;
  updateSettings(patch: Partial<Settings>): void;
  updateSound(patch: Partial<SoundPrefs>): void;
  timerAction(a: TimerAction): Promise<void>;
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
  deepFocus: false,

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

    soundEngine.subscribe(() => set({ soundPlaying: soundEngine.playing }));

    backend.subscribe((e) => {
      switch (e.type) {
        case "timer":
          onTimer(get().timer, e.snapshot);
          set({ timer: e.snapshot, clockSkew: Date.now() - e.snapshot.now });
          break;
        case "completed": {
          const sound = get().settings.sound!;
          void soundEngine.chime(sound.chime, sound.chimeVolume, e.completed.next === "focus");
          get().toast(
            e.completed.phase === "focus"
              ? { title: "Focus block complete", body: e.completed.autoStarted ? "Your break has started. Step away for a moment." : "Time for a break.", tone: "success" }
              : { title: "Break's over", body: e.completed.autoStarted ? "Next focus block started." : "Ready when you are.", tone: "default" },
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
          set({ settings: withDefaults(e.settings) });
          break;
        case "data":
          get().bumpData();
          break;
      }
    });

    // Live views refresh periodically; mobile pulls OS usage when foregrounded.
    window.setInterval(() => get().bumpData(), 60_000);
    const syncUsage = () =>
      backend
        .usageSync()
        .then((n) => n > 0 && get().bumpData())
        .catch(() => {});
    void syncUsage();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void syncUsage();
        void get().refreshTracker();
        get().bumpData();
      }
    });
    window.addEventListener("hashchange", () => {
      const v = viewFromHash();
      if (v && v !== get().view) set({ view: v });
    });
  },

  setView(view) {
    if (window.location.hash !== `#/${view}`) window.history.replaceState(null, "", `#/${view}`);
    set({ view, deepFocus: false });
  },

  setDeepFocus(deepFocus) {
    set({ deepFocus });
  },

  updateSettings(patch) {
    const next = withDefaults({ ...get().settings, ...patch });
    set({ settings: next });
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      backend.updateSettings(next).catch((err) => get().toast({ title: "Couldn't save settings", body: String(err), tone: "warning" }));
    }, 350);
  },

  updateSound(patch) {
    const sound = { ...get().settings.sound!, ...patch };
    if (patch.levels) soundEngine.setLevels(patch.levels as Partial<Record<SoundId, number>>);
    if (patch.master !== undefined) soundEngine.setMaster(patch.master);
    get().updateSettings({ sound });
  },

  async timerAction(a) {
    if (a === "start" || a === "toggle" || a === "resume") void backend.ensureNotificationPermission().catch(() => {});
    const timer = await backend.timerAction(a);
    onTimer(get().timer, timer);
    set({ timer, clockSkew: Date.now() - timer.now });
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

/** Couple the soundscape to the timer: auto-play on focus, fade out on breaks. */
function onTimer(prev: TimerSnapshot | null, next: TimerSnapshot) {
  const sound = useApp.getState().settings.sound;
  if (!sound) return;
  const startedFocus = next.phase === "focus" && next.status === "running" && !(prev?.phase === "focus" && prev.status === "running");
  const enteredBreak = next.phase !== "focus" && prev?.phase === "focus";
  if (startedFocus && sound.autoPlay && soundEngine.hasMix && !soundEngine.playing) void soundEngine.play();
  if (enteredBreak && sound.pauseOnBreak && soundEngine.playing) soundEngine.pause();
}

/** Remaining time for a snapshot at the current instant. */
export function remainingNow(t: TimerSnapshot, skew: number): number {
  if (t.status !== "running" || t.endsAt === null) return t.remainingMs;
  return Math.max(0, t.endsAt - (Date.now() - skew));
}
