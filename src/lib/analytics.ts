// Pure, on-device aggregation helpers shared by the views and the insights engine.

import type { BucketTotals, EntityTotal, FocusSession } from "./types";
import { MINUTE } from "./time";

export interface DayStat {
  day: number;
  productiveMs: number;
  neutralMs: number;
  distractingMs: number;
  activeMs: number;
  switches: number;
  focusMs: number;
  sessions: number;
  completed: number;
  score: number | null;
  /** Active minutes after 23:00 or before 04:00 — set when hourly data is available. */
  lateMs: number;
}

/** 0–100: productive time counts fully, neutral time half, distracting time not at all. */
export function productivityScore(p: number, n: number, d: number): number | null {
  const total = p + n + d;
  if (total < 5 * MINUTE) return null;
  return Math.round((100 * (p + 0.5 * n)) / total);
}

export function focusOnly(sessions: FocusSession[]) {
  return sessions.filter((s) => s.kind === "focus");
}

export function buildDayStats(
  days: [number, number][],
  totals: BucketTotals[],
  sessions: FocusSession[],
  hourly?: BucketTotals[],
): DayStat[] {
  const focus = focusOnly(sessions);
  return days.map(([from, to], i) => {
    const t = totals[i];
    const mine = focus.filter((s) => s.start >= from && s.start < to);
    const lateMs = hourly
      ? hourly
          .filter((h) => h.from >= from && h.from < to)
          .filter((h) => {
            const hr = new Date(h.from).getHours();
            return hr >= 23 || hr < 4;
          })
          .reduce((a, h) => a + h.productiveMs + h.neutralMs + h.distractingMs, 0)
      : 0;
    return {
      day: from,
      productiveMs: t.productiveMs,
      neutralMs: t.neutralMs,
      distractingMs: t.distractingMs,
      activeMs: t.productiveMs + t.neutralMs + t.distractingMs,
      switches: t.switches,
      focusMs: mine.reduce((a, s) => a + s.actualMs, 0),
      sessions: mine.length,
      completed: mine.filter((s) => s.completed).length,
      score: productivityScore(t.productiveMs, t.neutralMs, t.distractingMs),
      lateMs,
    };
  });
}

export function sumDays(days: DayStat[]) {
  const s = days.reduce(
    (a, d) => ({
      productiveMs: a.productiveMs + d.productiveMs,
      neutralMs: a.neutralMs + d.neutralMs,
      distractingMs: a.distractingMs + d.distractingMs,
      activeMs: a.activeMs + d.activeMs,
      switches: a.switches + d.switches,
      focusMs: a.focusMs + d.focusMs,
      sessions: a.sessions + d.sessions,
      completed: a.completed + d.completed,
    }),
    { productiveMs: 0, neutralMs: 0, distractingMs: 0, activeMs: 0, switches: 0, focusMs: 0, sessions: 0, completed: 0 },
  );
  const activeDays = days.filter((d) => d.activeMs >= 10 * MINUTE).length;
  return { ...s, activeDays, score: productivityScore(s.productiveMs, s.neutralMs, s.distractingMs) };
}

/** Consecutive days (ending today or yesterday) that met the focus goal. */
export function goalStreak(days: DayStat[], goalMs: number): number {
  if (goalMs <= 0) return 0;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const hit = days[i].focusMs >= goalMs;
    if (hit) streak++;
    else if (i === days.length - 1) continue; // today may still be in progress
    else break;
  }
  return streak;
}

export interface CategoryTotal {
  category: string;
  productivity: number;
  ms: number;
}

export function categoryTotals(entities: EntityTotal[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const e of entities) {
    const c = map.get(e.category) ?? { category: e.category, productivity: e.productivity, ms: 0 };
    c.ms += e.ms;
    map.set(e.category, c);
  }
  return [...map.values()].sort((a, b) => b.ms - a.ms);
}

/** weekday (0 = Monday) × hour matrix of averaged totals. */
export interface RhythmCell {
  weekday: number;
  hour: number;
  productiveMs: number;
  distractingMs: number;
  activeMs: number;
  samples: number;
}

export function rhythmMatrix(hourly: BucketTotals[]): RhythmCell[][] {
  const grid: RhythmCell[][] = Array.from({ length: 7 }, (_, weekday) =>
    Array.from({ length: 24 }, (_, hour) => ({ weekday, hour, productiveMs: 0, distractingMs: 0, activeMs: 0, samples: 0 })),
  );
  for (const h of hourly) {
    const d = new Date(h.from);
    const cell = grid[(d.getDay() + 6) % 7][d.getHours()];
    cell.productiveMs += h.productiveMs;
    cell.distractingMs += h.distractingMs;
    cell.activeMs += h.productiveMs + h.neutralMs + h.distractingMs;
    cell.samples += 1;
  }
  for (const row of grid)
    for (const c of row)
      if (c.samples > 0) {
        c.productiveMs /= c.samples;
        c.distractingMs /= c.samples;
        c.activeMs /= c.samples;
      }
  return grid;
}

/** Sum by hour of day across all days in the range. */
export function byHourOfDay(hourly: BucketTotals[]) {
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, productiveMs: 0, neutralMs: 0, distractingMs: 0, switches: 0 }));
  for (const h of hourly) {
    const o = out[new Date(h.from).getHours()];
    o.productiveMs += h.productiveMs;
    o.neutralMs += h.neutralMs;
    o.distractingMs += h.distractingMs;
    o.switches += h.switches;
  }
  return out;
}

export function pctChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return (now - before) / before;
}
