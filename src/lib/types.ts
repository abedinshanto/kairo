// Mirrors the Rust models in src-tauri/src/models.rs (serde camelCase).

export type Phase = "focus" | "short_break" | "long_break";
export type TimerStatus = "idle" | "running" | "paused";
export type TimerAction = "start" | "pause" | "resume" | "toggle" | "skip" | "stop" | "finish";
export type Productivity = -1 | 0 | 1;
export type ThemePref = "system" | "dark" | "light";
export type ChimeId = "bell" | "soft" | "digital" | "none";

export interface SoundPrefs {
  levels: Record<string, number>;
  master: number;
  autoPlay: boolean;
  pauseOnBreak: boolean;
  chime: ChimeId;
  chimeVolume: number;
}

export interface Settings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  dailyFocusGoalMinutes: number;
  distractionBudgetMinutes: number;
  /** Daily minutes allowed per category ("social" → 30). */
  categoryLimits: Record<string, number>;
  trackingEnabled: boolean;
  idleThresholdSeconds: number;
  storeWindowTitles: boolean;
  trackBrowserUrls: boolean;
  excludedApps: string[];
  /** Domains never recorded (subdomains included). */
  excludedSites: string[];
  retentionDays: number;
  notificationsEnabled: boolean;
  nudgesEnabled: boolean;
  focusGuard: boolean;
  nudgeDistractionMinutes: number;
  nudgeBreakMinutes: number;
  dailySummary: boolean;
  /** Local time of day for the summary, in minutes after midnight. */
  dailySummaryMinutes: number;
  /** A look back at the week, on `weeklyReviewDay` (0 = Sunday) at the summary time. */
  weeklyReview: boolean;
  weeklyReviewDay: number;
  /** Weekly local backups of the database (the last 4 kept). */
  backups: boolean;
  /** Ask GitHub once a day whether a newer Kairo is out. */
  checkUpdates: boolean;
  showTimerInTray: boolean;
  hideDockIcon: boolean;
  globalShortcut: string;
  /** Opens quick capture from anywhere ("" = off). */
  captureShortcut: string;
  /** Ask a site for its icon when the browser hasn't saved one. */
  downloadSiteIcons: boolean;
  // UI-owned (stored in the core's `extra` map)
  theme?: ThemePref;
  onboarded?: boolean;
  /** What Kairo calls you in greetings (optional, stays on device). */
  name?: string;
  /** Home suggestions the user said "not now" to. */
  tipsDismissed?: string[];
  /** Local midnight of the last day whose summary was opened (hides Home's prompt). */
  summarySeenDay?: number;
  sound?: SoundPrefs;
}

export interface TimerSnapshot {
  phase: Phase;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  endsAt: number | null;
  startedAt: number | null;
  cycle: number;
  cycleLength: number;
  intention: string;
  taskId: number | null;
  interruptions: number;
  now: number;
}

export interface TimerCompleted {
  phase: Phase;
  next: Phase;
  autoStarted: boolean;
  actualMs: number;
  /** Finished by the user before the countdown ran out. */
  early: boolean;
}

export interface ActivitySpan {
  id: number;
  start: number;
  end: number;
  appId: string;
  appName: string;
  domain: string | null;
  title: string | null;
  category: string;
  productivity: Productivity;
  source: string;
}

export interface BucketTotals {
  from: number;
  to: number;
  productiveMs: number;
  neutralMs: number;
  distractingMs: number;
  switches: number;
}

export interface EntityTotal {
  key: string;
  kind: "app" | "site";
  name: string;
  appName: string;
  category: string;
  productivity: Productivity;
  ms: number;
  visits: number;
  lastSeen: number;
}

export interface FocusSession {
  id: number;
  kind: Phase;
  start: number;
  end: number;
  plannedMs: number;
  actualMs: number;
  completed: boolean;
  intention: string;
  taskId: number | null;
  interruptions: number;
}

export interface Task {
  id: number;
  title: string;
  estimate: number;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
  pomodoros: number;
  focusMs: number;
  /** Local midnight of the day it's due. */
  dueDay: number | null;
  notes: string | null;
  /** Soundscape preset to play while focusing on it. */
  sound: string | null;
}

export interface Rule {
  key: string;
  category: string;
  productivity: Productivity;
}

export interface CurrentActivity {
  appId: string;
  appName: string;
  domain: string | null;
  category: string;
  productivity: Productivity;
  since: number;
}

export interface TrackerStatus {
  supported: boolean;
  enabled: boolean;
  pausedUntil: number | null;
  platform: string;
  needsPermission: boolean;
  current: CurrentActivity | null;
}

export interface DataInfo {
  spans: number;
  sessions: number;
  firstActivity: number | null;
  dbPath: string;
  dbBytes: number;
}

export interface TaskPatch {
  title?: string;
  estimate?: number;
  done?: boolean;
  /** null clears it. */
  dueDay?: number | null;
  notes?: string | null;
  sound?: string | null;
}

/** A weekly copy of the database, kept on this device. */
export interface Backup {
  name: string;
  at: number;
  bytes: number;
}

/** A newer Kairo on GitHub (only known when update checks are on). */
export interface UpdateInfo {
  version: string;
  url: string;
}

/** What an import added (anything already here is skipped). */
export interface ImportCounts {
  activity: number;
  sessions: number;
  tasks: number;
  rules: number;
}

export type BackendEvent =
  | { type: "timer"; snapshot: TimerSnapshot }
  | { type: "completed"; completed: TimerCompleted }
  | { type: "current"; current: CurrentActivity | null }
  | { type: "tracker"; status: TrackerStatus }
  | { type: "settings"; settings: Settings }
  | { type: "data" }
  /** The core just stored a real icon for this app. */
  | { type: "icon"; key: string }
  /** The user tapped the end-of-day (or weekly) summary notification. */
  | { type: "summary"; week?: boolean }
  /** Dictation: listening (with the microphone level) or turning speech into text. */
  | { type: "voice"; state: VoiceState }
  | { type: "voice-level"; level: number }
  /** The daily check found a newer Kairo. */
  | { type: "update"; update: UpdateInfo }
  /** This (small) window was just shown. */
  | { type: "shown" }
  /** The capture shortcut was pressed again while the box was open. */
  | { type: "capture-again" }
  /** The main window was asked to show a view. */
  | { type: "open-view"; view: string };

export type VoiceState = "listening" | "thinking";

export interface Backend {
  kind: "native" | "demo";
  getSettings(): Promise<Settings>;
  updateSettings(settings: Settings): Promise<Settings>;

  timerGet(): Promise<TimerSnapshot>;
  timerAction(action: TimerAction): Promise<TimerSnapshot>;
  timerSetPhase(phase: Phase): Promise<TimerSnapshot>;
  timerExtend(minutes: number): Promise<TimerSnapshot>;
  timerSetIntention(intention: string, taskId: number | null): Promise<TimerSnapshot>;

  activitySpans(from: number, to: number): Promise<ActivitySpan[]>;
  bucketTotals(buckets: [number, number][]): Promise<BucketTotals[]>;
  entityTotals(from: number, to: number): Promise<EntityTotal[]>;
  focusSessions(from: number, to: number): Promise<FocusSession[]>;
  /** Real app icons as data URLs, by app key. Apps without one are left out. */
  appIcons(keys: string[]): Promise<Record<string, string>>;

  tasksList(): Promise<Task[]>;
  taskCreate(title: string, estimate: number, dueDay?: number | null): Promise<number>;
  taskUpdate(id: number, patch: TaskPatch): Promise<void>;
  taskDelete(id: number): Promise<void>;
  /** Priority order of tasks, highest first (task 1, 2, 3…). */
  tasksReorder(ids: number[]): Promise<void>;

  /** Log time Kairo couldn't see, with the category chosen for it. */
  spanAdd(entry: { start: number; end: number; name: string; category: string; productivity: Productivity }): Promise<number>;
  spanUpdate(id: number, start: number, end: number): Promise<void>;
  spanDelete(id: number): Promise<void>;
  /** Point a focus block at another task (or none). */
  sessionUpdate(id: number, taskId: number | null, intention: string): Promise<void>;
  sessionDelete(id: number): Promise<void>;

  /** Pick a Kairo JSON export and merge it into this device's data (null: cancelled). */
  importData(): Promise<ImportCounts | null>;
  backupsList(): Promise<Backup[]>;
  backupNow(): Promise<Backup>;
  /** Put a backup back; Kairo restarts with it. */
  backupRestore(name: string): Promise<void>;

  /** The newer release the last check found, if any. */
  updateStatus(): Promise<UpdateInfo | null>;
  /** Ask GitHub now (only offered when checks are on). */
  updateCheck(): Promise<UpdateInfo | null>;
  /** Open the releases page in the browser. */
  updateOpen(): Promise<void>;

  /** The panel or capture box hides itself. */
  windowHide(): Promise<void>;
  /** Bring up the main window (on a view), from the panel or capture box. */
  windowOpenMain(view?: string): Promise<void>;

  /** Forget an app's own time, or a site's, once (tracking carries on). */
  deleteHistory(kind: "app" | "site", key: string): Promise<void>;

  rulesList(): Promise<Rule[]>;
  ruleSet(rule: Rule): Promise<void>;
  ruleDelete(key: string): Promise<void>;

  trackerStatus(): Promise<TrackerStatus>;
  trackerPause(minutes: number | null): Promise<TrackerStatus>;
  usagePermissionRequest(): Promise<void>;
  usageSync(): Promise<number>;

  dataInfo(): Promise<DataInfo>;
  /** Ask where to save and write the export. Resolves to false when cancelled. */
  exportData(format: "json" | "csv"): Promise<boolean>;
  wipeData(): Promise<void>;

  autostartEnabled(): Promise<boolean | null>;
  setAutostart(enabled: boolean): Promise<void>;
  ensureNotificationPermission(): Promise<boolean>;

  /** On-device dictation (desktop): whether it can work here. */
  voiceAvailable(): Promise<boolean>;
  /** Listen for one utterance; resolves to its text ("" if nothing was said or it was cancelled). */
  voiceListen(): Promise<string>;
  /** Stop listening and transcribe what was said so far. */
  voiceStop(): Promise<void>;
  /** Stop listening and discard it. */
  voiceCancel(): Promise<void>;

  subscribe(listener: (event: BackendEvent) => void): () => void;
}
