// Mirrors the Rust models in src-tauri/src/models.rs (serde camelCase).

export type Phase = "focus" | "short_break" | "long_break";
export type TimerStatus = "idle" | "running" | "paused";
export type TimerAction = "start" | "pause" | "resume" | "toggle" | "skip" | "stop";
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
  trackingEnabled: boolean;
  idleThresholdSeconds: number;
  storeWindowTitles: boolean;
  trackBrowserUrls: boolean;
  excludedApps: string[];
  retentionDays: number;
  notificationsEnabled: boolean;
  nudgesEnabled: boolean;
  focusGuard: boolean;
  nudgeDistractionMinutes: number;
  nudgeBreakMinutes: number;
  showTimerInTray: boolean;
  hideDockIcon: boolean;
  globalShortcut: string;
  // UI-owned (stored in the core's `extra` map)
  theme?: ThemePref;
  onboarded?: boolean;
  /** What Kairo calls you in greetings (optional, stays on device). */
  name?: string;
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
}

export type BackendEvent =
  | { type: "timer"; snapshot: TimerSnapshot }
  | { type: "completed"; completed: TimerCompleted }
  | { type: "current"; current: CurrentActivity | null }
  | { type: "tracker"; status: TrackerStatus }
  | { type: "settings"; settings: Settings }
  | { type: "data" };

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

  tasksList(): Promise<Task[]>;
  taskCreate(title: string, estimate: number): Promise<number>;
  taskUpdate(id: number, patch: TaskPatch): Promise<void>;
  taskDelete(id: number): Promise<void>;

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

  subscribe(listener: (event: BackendEvent) => void): () => void;
}
