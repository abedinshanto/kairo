import type { Settings, SoundPrefs } from "./types";

export const DEFAULT_SOUND: SoundPrefs = {
  levels: { brown: 0.55, rain: 0.3 },
  master: 0.7,
  autoPlay: false,
  pauseOnBreak: true,
  chime: "bell",
  chimeVolume: 0.6,
};

/** Same defaults as `Settings::default()` in the Rust core. */
export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  dailyFocusGoalMinutes: 240,
  distractionBudgetMinutes: 60,
  trackingEnabled: true,
  idleThresholdSeconds: 180,
  storeWindowTitles: false,
  trackBrowserUrls: false,
  excludedApps: [],
  retentionDays: 0,
  notificationsEnabled: true,
  nudgesEnabled: true,
  focusGuard: true,
  nudgeDistractionMinutes: 15,
  nudgeBreakMinutes: 90,
  showTimerInTray: true,
  hideDockIcon: false,
  globalShortcut: "CommandOrControl+Shift+Space",
  theme: "system",
  onboarded: false,
  sound: DEFAULT_SOUND,
};

export function withDefaults(s: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    sound: { ...DEFAULT_SOUND, ...(s.sound ?? {}), levels: { ...(s.sound?.levels ?? DEFAULT_SOUND.levels) } },
  };
}
