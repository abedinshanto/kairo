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
/** A flow block has no set end; after this long it wraps up by itself. */
export const FLOW_CAP_MS = 3 * 3_600_000;

/** The break a flow block earns: a fifth of the time focused, 1–30 minutes. */
export const earnedBreakMs = (focusedMs: number) => Math.min(30, Math.max(1, Math.round(focusedMs / 5 / 60_000))) * 60_000;

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
  /** This focus block counts up (flow mode was on when it began). */
  flow = false;

  constructor(settings: Settings) {
    this.durationMs = 0;
    this.remainingMs = 0;
    this.enter("focus", settings);
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
      flow: this.flow,
      now,
    };
  }

  private enter(phase: Phase, s: Settings) {
    this.phase = phase;
    this.status = "idle";
    this.flow = phase === "focus" && s.flowMode;
    this.durationMs = this.flow ? FLOW_CAP_MS : minutesFor(phase, s);
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
    return this.wrapUp(this.startedAt ?? this.endsAt - this.durationMs, this.endsAt, this.durationMs, false, now, s);
  }

  /** End a focus block now and count it as done; on a break, move on to focus. */
  private finish(now: number, s: Settings): Effects {
    if (this.phase !== "focus") return this.act("skip", now, s);
    if (this.startedAt === null) return {};
    const actual = Math.max(0, this.durationMs - this.remaining(now));
    if (actual < MIN_RECORDED_MS) {
      this.enter("focus", s);
      return {};
    }
    return this.wrapUp(this.startedAt, now, actual, true, now, s);
  }

  private wrapUp(start: number, end: number, actual: number, early: boolean, now: number, s: Settings): Effects {
    const finished = this.phase;
    const record: SessionRecord = {
      kind: finished,
      start,
      end,
      plannedMs: this.durationMs,
      actualMs: actual,
      completed: true,
      intention: this.intention,
      taskId: this.taskId,
      interruptions: this.interruptions,
    };
    const flowed = this.flow;
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
    if (flowed && finished === "focus") {
      // Flow: the break is earned, never shorter than a long break's setting when one is due.
      const earned = earnedBreakMs(actual);
      this.durationMs = next === "long_break" ? Math.max(earned, this.durationMs) : earned;
      this.remainingMs = this.durationMs;
    }
    if (auto) this.run(now);
    return {
      record,
      completed: { phase: finished, next, autoStarted: auto, actualMs: actual, early },
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
    } else if (action === "finish") {
      return this.finish(now, s);
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
    // A flow block has no end to move.
    if (this.flow) return;
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
