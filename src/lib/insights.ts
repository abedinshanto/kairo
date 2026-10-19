// Rule-based insights computed entirely on device. Each rule looks for one
// pattern and explains it in plain language with a concrete next step.

import { byHourOfDay, pctChange, sumDays, type DayStat } from "./analytics";
import { categoryLabel, entityName } from "./categories";
import { fmtDuration, fmtHour, HOUR, MINUTE } from "./time";
import type { BucketTotals, EntityTotal, FocusSession } from "./types";

export type InsightTone = "positive" | "warning" | "neutral";
export type InsightIcon =
  | "trend-up" | "trend-down" | "sun" | "moon" | "alert" | "shuffle" | "target"
  | "check" | "calendar" | "message" | "shield" | "leak";

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: InsightIcon;
  title: string;
  body: string;
  /** Higher sorts first. */
  weight: number;
}

export interface InsightInput {
  days: DayStat[];
  prevDays: DayStat[];
  hourly: BucketTotals[];
  entities: EntityTotal[];
  prevEntities: EntityTotal[];
  sessions: FocusSession[];
  goalMs: number;
  periodLabel: string;
}

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const hourRange = (h: number, len = 2) => `${fmtHour(h)}–${fmtHour((h + len) % 24)}`;
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

export function generateInsights(input: InsightInput): Insight[] {
  const { days, prevDays, hourly, entities, prevEntities, sessions, goalMs, periodLabel } = input;
  const out: Insight[] = [];
  const now = sumDays(days);
  const before = sumDays(prevDays);
  if (now.activeMs < 30 * MINUTE) return out;
  const activeDays = Math.max(1, now.activeDays);

  // 1 — Productive time trend
  const avgNow = now.productiveMs / activeDays;
  const avgBefore = before.activeDays ? before.productiveMs / before.activeDays : 0;
  const trend = pctChange(avgNow, avgBefore);
  if (trend !== null && Math.abs(trend) >= 0.08) {
    out.push(
      trend > 0
        ? {
            id: "trend", tone: "positive", icon: "trend-up", weight: 70,
            title: `Productive time is up ${pct(trend)}`,
            body: `You're averaging ${fmtDuration(avgNow)} of productive work per active day, versus ${fmtDuration(avgBefore)} the period before. Keep the routine that's working.`,
          }
        : {
            id: "trend", tone: "warning", icon: "trend-down", weight: 80,
            title: `Productive time is down ${pct(trend)}`,
            body: `You averaged ${fmtDuration(avgNow)} per active day, down from ${fmtDuration(avgBefore)}. Look at the leaks below to see where the time went.`,
          },
    );
  }

  const hours = byHourOfDay(hourly);

  // 2 — Peak focus window
  let best = { hour: -1, ms: 0 };
  for (let h = 0; h < 24; h++) {
    const ms = hours[h].productiveMs + hours[(h + 1) % 24].productiveMs;
    if (ms > best.ms) best = { hour: h, ms };
  }
  if (best.hour >= 0 && now.productiveMs > HOUR) {
    const share = best.ms / now.productiveMs;
    out.push({
      id: "peak", tone: "neutral", icon: best.hour < 12 ? "sun" : "moon", weight: 60,
      title: `Your sharpest hours are ${hourRange(best.hour)}`,
      body: `${pct(share)} of your productive time lands in this window. Protect it: keep meetings and email elsewhere and start a focus block when it opens.`,
    });
  }

  // 3 — Distraction peak
  let worst = { hour: -1, ms: 0 };
  for (const h of hours) if (h.distractingMs > worst.ms) worst = { hour: h.hour, ms: h.distractingMs };
  if (worst.hour >= 0 && worst.ms / activeDays >= 8 * MINUTE) {
    out.push({
      id: "distraction-peak", tone: "warning", icon: "alert", weight: 75,
      title: `Distractions peak around ${fmtHour(worst.hour)}`,
      body: `That hour averages ${fmtDuration(worst.ms / activeDays)} on distracting apps and sites. Starting a focus block a few minutes before ${fmtHour(worst.hour)} can head it off.`,
    });
  }

  // 4 — Biggest leak
  const leaks = entities.filter((e) => e.productivity < 0);
  const top = leaks[0];
  if (top && top.ms >= 20 * MINUTE) {
    const prev = prevEntities.find((e) => e.key === top.key && e.kind === top.kind);
    const change = prev ? pctChange(top.ms, prev.ms) : null;
    const name = entityName(top.kind, top.key, top.name);
    const changeText =
      change === null ? "" : change > 0.05 ? ` That's ${pct(change)} more than the period before.` : change < -0.05 ? ` Down ${pct(change)} from the period before. Nice.` : "";
    out.push({
      id: "leak", tone: change !== null && change < -0.05 ? "positive" : "warning", icon: "leak", weight: 85,
      title: `${name} took ${fmtDuration(top.ms)} ${periodLabel}`,
      body: `It's your biggest time leak, about ${fmtDuration(top.ms / activeDays)} per active day.${changeText} Try a time limit, or keep it for breaks only.`,
    });
  }

  // 5 — Context switching
  const activeHours = now.activeMs / HOUR;
  if (activeHours >= 2) {
    const perHour = now.switches / activeHours;
    if (perHour >= 25) {
      out.push({
        id: "switching", tone: "warning", icon: "shuffle", weight: 65,
        title: `You switch apps ~${Math.round(perHour)} times an hour`,
        body: "Every switch costs refocusing time. Batch chat and email into a few set check-ins, and close tabs you don't need for the current task.",
      });
    } else if (perHour <= 12) {
      out.push({
        id: "switching", tone: "positive", icon: "shield", weight: 35,
        title: "Your attention is steady",
        body: `About ${Math.round(perHour)} app switches per hour. That's the kind of single-tasking deep work depends on.`,
      });
    }
  }

  // 6 — Session follow-through
  const focus = sessions.filter((s) => s.kind === "focus");
  if (focus.length >= 5) {
    const rate = focus.filter((s) => s.completed).length / focus.length;
    if (rate < 0.7) {
      out.push({
        id: "completion", tone: "warning", icon: "target", weight: 68,
        title: `You finish ${pct(rate)} of focus blocks`,
        body: "Blocks often end early. Try a shorter 15–20 minute block, or write a one-line intention before you start so you know when you're done.",
      });
    } else if (rate >= 0.85) {
      out.push({
        id: "completion", tone: "positive", icon: "check", weight: 40,
        title: `You finish ${pct(rate)} of focus blocks`,
        body: "Strong follow-through. If blocks feel easy, try 5 more minutes per block.",
      });
    }
    const interrupts = focus.reduce((a, s) => a + s.interruptions, 0) / focus.length;
    if (interrupts >= 1.5) {
      out.push({
        id: "interruptions", tone: "warning", icon: "alert", weight: 55,
        title: `About ${interrupts.toFixed(1)} detours per focus block`,
        body: "You often drift to distracting apps mid-block. Turn on Focus guard so Kairo nudges you back the moment it happens.",
      });
    }
  }

  // 7 — Goal consistency
  const eligible = days.filter((d) => d.activeMs >= 30 * MINUTE);
  if (goalMs > 0 && eligible.length >= 3) {
    const hits = eligible.filter((d) => d.focusMs >= goalMs).length;
    out.push({
      id: "goal", tone: hits / eligible.length >= 0.6 ? "positive" : "neutral", icon: "target", weight: 50,
      title: `Focus goal met on ${hits} of ${eligible.length} days`,
      body:
        hits / eligible.length >= 0.6
          ? `You're consistently getting to ${fmtDuration(goalMs)} of focused work. Consider raising the bar.`
          : `Reaching ${fmtDuration(goalMs)} of focus is the hard part. Schedule your first block before checking messages.`,
    });
  }

  // 8 — Best weekday
  if (days.length >= 14) {
    const sums = Array.from({ length: 7 }, () => ({ ms: 0, n: 0 }));
    for (const d of days) {
      if (d.activeMs < 30 * MINUTE) continue;
      const w = new Date(d.day).getDay();
      sums[w].ms += d.productiveMs;
      sums[w].n += 1;
    }
    const avgs = sums.map((s, w) => ({ w, avg: s.n ? s.ms / s.n : 0 }));
    const bestDay = avgs.reduce((a, b) => (b.avg > a.avg ? b : a));
    if (bestDay.avg > HOUR) {
      out.push({
        id: "weekday", tone: "neutral", icon: "calendar", weight: 30,
        title: `${WEEKDAYS[bestDay.w]} are your most productive days`,
        body: `You average ${fmtDuration(bestDay.avg)} of productive time on ${WEEKDAYS[bestDay.w]}. Save your hardest work for them.`,
      });
    }
  }

  // 9 — Late nights
  const lateNights = days.filter((d) => d.lateMs >= 15 * MINUTE).length;
  if (lateNights >= 2) {
    out.push({
      id: "late", tone: "warning", icon: "moon", weight: 45,
      title: `Late screen time on ${lateNights} nights`,
      body: "Using screens after 11 PM tends to cost you focus the next morning. Try a wind-down cut-off.",
    });
  }

  // 10 — Communication load
  const comms = entities.filter((e) => e.category === "communication" || e.category === "meetings");
  const commsMs = comms.reduce((a, e) => a + e.ms, 0);
  if (now.activeMs > 2 * HOUR && commsMs / now.activeMs >= 0.3) {
    out.push({
      id: "comms", tone: "neutral", icon: "message", weight: 42,
      title: `${categoryLabel("communication")} and meetings take ${pct(commsMs / now.activeMs)} of your time`,
      body: "That leaves little room for deep work. Try blocking a meeting-free morning, or answering messages at set times.",
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

export interface Persona {
  name: string;
  tagline: string;
  traits: { label: string; value: string }[];
  tips: string[];
}

export function focusPersona(days: DayStat[], hourly: BucketTotals[]): Persona | null {
  const total = sumDays(days);
  if (total.productiveMs < 2 * HOUR) return null;
  const hours = byHourOfDay(hourly);
  // Productive-time-weighted centre of the day.
  let wsum = 0;
  let w = 0;
  for (const h of hours) {
    wsum += h.hour * h.productiveMs;
    w += h.productiveMs;
  }
  const centre = w ? wsum / w : 12;
  const rhythm =
    centre < 11.5
      ? { word: "Early Bird", line: "You do your best work before lunch.", tip: "Start your hardest task before opening chat or email." }
      : centre < 15
        ? { word: "Midday", line: "Your energy peaks in the middle of the day.", tip: "Keep late mornings meeting-free; that's your prime time." }
        : centre < 19.5
          ? { word: "Afternoon", line: "You hit your stride as the day goes on.", tip: "Use mornings for admin and save afternoons for deep work." }
          : { word: "Night Owl", line: "Your best ideas show up after dark.", tip: "Protect your evening blocks, and keep a wind-down cut-off." };
  const perHour = total.switches / Math.max(1, total.activeMs / HOUR);
  const style =
    perHour < 15
      ? { word: "Deep Diver", line: "Long, uninterrupted stretches are your superpower.", tip: "Try 50-minute blocks; short ones may be cutting your flow short." }
      : perHour < 28
        ? { word: "Steady Builder", line: "You balance focus and coordination well.", tip: "Batch messages between blocks to keep that balance." }
        : { word: "Juggler", line: "You keep many plates spinning; protecting focus blocks pays off most.", tip: "Set an intention before each block and close what you don't need." };

  let best = 0;
  for (let h = 1; h < 24; h++) if (hours[h].productiveMs > hours[best].productiveMs) best = h;
  const activeDays = Math.max(1, total.activeDays);

  return {
    name: `${rhythm.word} ${style.word}`,
    tagline: `${rhythm.line} ${style.line}`,
    traits: [
      { label: "Peak hour", value: fmtHour(best) },
      { label: "Focus per day", value: fmtDuration(total.focusMs / activeDays) },
      { label: "Switches / hour", value: String(Math.round(perHour)) },
    ],
    tips: [rhythm.tip, style.tip],
  };
}
