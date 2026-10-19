// TypeScript twin of src-tauri/src/timer.rs, used only by the browser preview.

import type {
  FocusSession,
  Phase,
  Settings,
  TimerAction,
  TimerCompleted,
  TimerSnapshot,
  TimerStatus,
} from "../types";

const MIN_RECORDED_MS = 60_000;
const MAX_DURATION_MS = 4 * 3_600_000;

export type SessionRecord = Omit<FocusSession, "id">;

export interface Effects {
  record?: SessionRecord;
  completed?: TimerCompleted;
}

const minutesFor = (phase: Phase, s: Settings) =>
  (phase === "focus" ? s.focusMinutes : phase === "short_break" ? s.shortBreakMinutes : s.longBreakMinutes) * 60_000;

export class TimerEngine {
  phase: Phase = "focus";
  status: TimerStatus = "idle";
  durationMs: number;
  remainingMs: number;
  endsAt = 0;
  startedAt: number | null = null;
  cycle = 0;
  intention = "";
  taskId: number | null = null;
  interruptions = 0;

  constructor(settings: Settings) {
    this.durationMs = minutesFor("focus", settings);
    this.remainingMs = this.durationMs;
  }

  remaining(now: number) {
    return this.status === "running" ? Math.max(0, this.endsAt - now) : this.remainingMs;
  }

  snapshot(now: number, s: Settings): TimerSnapshot {
    return {
      phase: this.phase,
      status: this.status,
      durationMs: this.durationMs,
      remainingMs: this.remaining(now),
      endsAt: this.status === "running" ? this.endsAt : null,
      startedAt: this.startedAt,
      cycle: this.cycle,
      cycleLength: s.longBreakEvery,
      intention: this.intention,
      taskId: this.taskId,
      interruptions: this.interruptions,
      now,
    };
  }

  private enter(phase: Phase, s: Settings) {
    this.phase = phase;
    this.status = "idle";
    this.durationMs = minutesFor(phase, s);
    this.remainingMs = this.durationMs;
    this.startedAt = null;
    this.interruptions = 0;
  }

  private run(now: number) {
    this.startedAt ??= now;
    this.endsAt = now + this.remainingMs;
    this.status = "running";
  }

  private abandon(now: number): SessionRecord | undefined {
    if (this.startedAt === null) return undefined;
    const actual = this.durationMs - this.remaining(now);
    if (this.phase !== "focus" || actual < MIN_RECORDED_MS) return undefined;
    return {
      kind: this.phase,
      start: this.startedAt,
      end: now,
      plannedMs: this.durationMs,
      actualMs: actual,
      completed: false,
      intention: this.intention,
      taskId: this.taskId,
      interruptions: this.interruptions,
    };
  }

  complete(now: number, s: Settings): Effects {
    const finished = this.phase;
    const record: SessionRecord = {
      kind: finished,
      start: this.startedAt ?? this.endsAt - this.durationMs,
      end: this.endsAt,
      plannedMs: this.durationMs,
      actualMs: this.durationMs,
      completed: true,
      intention: this.intention,
      taskId: this.taskId,
      interruptions: this.interruptions,
    };
    let next: Phase;
    let auto: boolean;
    if (finished === "focus") {
      this.cycle += 1;
      next = this.cycle >= s.longBreakEvery ? "long_break" : "short_break";
      auto = s.autoStartBreaks;
    } else {
      if (finished === "long_break") this.cycle = 0;
      next = "focus";
      auto = s.autoStartFocus;
    }
    this.enter(next, s);
    if (auto) this.run(now);
    return {
      record,
      completed: { phase: finished, next, autoStarted: auto, actualMs: record.actualMs },
    };
  }

  act(action: TimerAction, now: number, s: Settings): Effects {
    const fx: Effects = {};
    const starts = action === "start" || action === "toggle" || action === "resume";
    if (starts && this.status !== "running") {
      this.run(now);
    } else if ((action === "pause" || action === "toggle") && this.status === "running") {
      this.remainingMs = this.remaining(now);
      this.status = "paused";
    } else if (action === "skip") {
      fx.record = this.abandon(now);
      let next: Phase = "focus";
      if (this.phase === "focus") next = "short_break";
      else if (this.phase === "long_break") this.cycle = 0;
      this.enter(next, s);
    } else if (action === "stop") {
      fx.record = this.abandon(now);
      this.enter(this.phase, s);
    }
    return fx;
  }

  setPhase(phase: Phase, now: number, s: Settings): Effects {
    const fx: Effects = { record: this.abandon(now) };
    if (phase === "focus" && this.phase === "long_break") this.cycle = 0;
    this.enter(phase, s);
    return fx;
  }

  extend(minutes: number, now: number) {
    const requested = Math.max(-60, Math.min(60, minutes)) * 60_000;
    const remaining = this.remaining(now);
    const delta = Math.min(Math.max(requested, -(remaining - 1000)), MAX_DURATION_MS - this.durationMs);
    this.durationMs += delta;
    if (this.status === "running") this.endsAt += delta;
    else this.remainingMs += delta;
  }

  applySettings(s: Settings) {
    if (this.status === "idle" && this.startedAt === null) this.enter(this.phase, s);
  }
}
