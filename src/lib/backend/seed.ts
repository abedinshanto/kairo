// Deterministic sample data for the browser preview (no native tracker there).

import type { FocusSession, Productivity, Task } from "../types";

export interface SeedSpan {
  start: number;
  end: number;
  appId: string;
  appName: string;
  domain: string | null;
  category: string;
  productivity: Productivity;
  source: string;
  cont: boolean;
}

interface SeedApp {
  appId: string;
  appName: string;
  domain?: string;
  category: string;
  productivity: Productivity;
  /** Typical stay, in minutes. */
  len: [number, number];
  source?: string;
}

const chrome = (domain: string, category: string, productivity: Productivity, len: [number, number]): SeedApp => ({
  appId: "google chrome",
  appName: "Google Chrome",
  domain,
  category,
  productivity,
  len,
});

const DEEP: SeedApp[] = [
  { appId: "visual studio code", appName: "Visual Studio Code", category: "development", productivity: 1, len: [6, 28] },
  { appId: "visual studio code", appName: "Visual Studio Code", category: "development", productivity: 1, len: [8, 30] },
  { appId: "figma", appName: "Figma", category: "design", productivity: 1, len: [6, 24] },
  { appId: "terminal", appName: "Terminal", category: "development", productivity: 1, len: [2, 9] },
  chrome("github.com", "development", 1, [2, 12]),
  chrome("docs.google.com", "writing", 1, [6, 22]),
  { appId: "notion", appName: "Notion", category: "productivity", productivity: 1, len: [3, 14] },
  chrome("claude.ai", "productivity", 1, [2, 9]),
  chrome("stackoverflow.com", "development", 1, [1, 5]),
  { appId: "linear", appName: "Linear", category: "productivity", productivity: 1, len: [2, 7] },
];

const COMMS: SeedApp[] = [
  { appId: "slack", appName: "Slack", category: "communication", productivity: 0, len: [1, 7] },
  { appId: "slack", appName: "Slack", category: "communication", productivity: 0, len: [1, 4] },
  chrome("mail.google.com", "communication", 0, [1, 6]),
  { appId: "calendar", appName: "Calendar", category: "productivity", productivity: 1, len: [0.5, 2] },
  { appId: "finder", appName: "Finder", category: "utilities", productivity: 0, len: [0.3, 2] },
  { appId: "google chrome", appName: "Google Chrome", category: "browsing", productivity: 0, len: [1, 4] },
];

const MEETING: SeedApp = { appId: "zoom.us", appName: "zoom.us", category: "meetings", productivity: 0, len: [25, 50] };

const DISTRACT: SeedApp[] = [
  chrome("youtube.com", "entertainment", -1, [3, 16]),
  chrome("x.com", "social", -1, [1, 8]),
  chrome("reddit.com", "social", -1, [2, 11]),
  chrome("news.ycombinator.com", "news", -1, [2, 9]),
  { appId: "spotify", appName: "Spotify", category: "entertainment", productivity: -1, len: [1, 3] },
  chrome("amazon.com", "shopping", -1, [2, 7]),
];

const EVENING: SeedApp[] = [
  chrome("youtube.com", "entertainment", -1, [6, 30]),
  chrome("netflix.com", "entertainment", -1, [20, 55]),
  { appId: "com.instagram.android", appName: "Instagram", category: "social", productivity: -1, len: [3, 15], source: "android" },
  chrome("x.com", "social", -1, [2, 12]),
  { appId: "kindle", appName: "Kindle", category: "learning", productivity: 1, len: [10, 30] },
  { appId: "com.duolingo", appName: "Duolingo", category: "learning", productivity: 1, len: [4, 10], source: "android" },
];

const INTENTIONS = [
  "Ship onboarding redesign",
  "Write Q4 planning doc",
  "Review pull requests",
  "Refactor sync engine",
  "Prepare investor update",
  "Design settings screen",
];

export const SEED_TASKS: Omit<Task, "pomodoros" | "focusMs">[] = [
  { id: 1, title: "Ship onboarding redesign", estimate: 6, done: false, createdAt: 0, completedAt: null },
  { id: 2, title: "Write Q4 planning doc", estimate: 5, done: false, createdAt: 0, completedAt: null },
  { id: 3, title: "Review pull requests", estimate: 6, done: false, createdAt: 0, completedAt: null },
  { id: 4, title: "Refactor sync engine", estimate: 8, done: false, createdAt: 0, completedAt: null },
  { id: 5, title: "Prepare investor update", estimate: 2, done: true, createdAt: 0, completedAt: 0 },
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN = 60_000;

export function generateSeed(days: number, now = Date.now()) {
  const spans: SeedSpan[] = [];
  const sessions: FocusSession[] = [];
  let sessionId = 1;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(today);
    day.setDate(today.getDate() - d);
    const dayStart = day.getTime();
    const r = rng(dayStart / 86_400_000 + 7);
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const between = (a: number, b: number) => a + r() * (b - a);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    // Older days were a little more scattered — gives the trend charts a story.
    const drift = d / days;
    const at = (h: number) => dayStart + h * 3_600_000;

    let t = 0;
    const push = (app: SeedApp, minutes: number) => {
      const start = t;
      const end = Math.min(t + minutes * MIN, now);
      if (end - start < 20_000) return;
      spans.push({
        start,
        end,
        appId: app.appId,
        appName: app.appName,
        domain: app.domain ?? null,
        category: app.category,
        productivity: app.productivity,
        source: app.source ?? "desktop",
        cont: false,
      });
      t = end;
    };
    const stay = (app: SeedApp, scale = 1) => between(app.len[0], app.len[1]) * scale;

    const work = (from: number, to: number, distractBase: number) => {
      t = Math.max(t, from);
      while (t < to && t < now) {
        const hour = new Date(t).getHours();
        const slump = hour >= 14 && hour < 16 ? 0.12 : hour === 11 ? 0.05 : 0;
        const pDistract = distractBase + slump + drift * 0.16;
        const roll = r();
        if (!weekend && r() < 0.04 && hour >= 10 && hour < 17) {
          push(MEETING, stay(MEETING));
        } else if (roll < 0.5) {
          // A deep-work stretch, often wrapped in a focus session.
          const stretchStart = t;
          const target = between(18, 55);
          const withSession = r() < 0.62;
          while (t - stretchStart < target * MIN && t < to && t < now) {
            if (r() < (withSession ? 0.04 : 0.12)) push(pick(COMMS), between(0.5, 2.5));
            else if (r() < (withSession ? 0.015 : pDistract * 0.4)) push(pick(DISTRACT), between(1, 4));
            else {
              const app = pick(DEEP);
              push(app, stay(app, 0.8));
            }
          }
          if (withSession) {
            const actual = Math.min(t - stretchStart, 25 * MIN);
            if (actual >= 5 * MIN) {
              const completed = actual >= 25 * MIN - 1 && r() > 0.08;
              const intention = pick(INTENTIONS);
              sessions.push({
                id: sessionId++,
                kind: "focus",
                start: stretchStart,
                end: stretchStart + actual,
                plannedMs: 25 * MIN,
                actualMs: completed ? 25 * MIN : actual,
                completed,
                intention,
                taskId: d < 2 ? (INTENTIONS.indexOf(intention) % 4) + 1 : null,
                interruptions: Math.floor(r() * (completed ? 2 : 4)),
              });
              if (completed && t < now) {
                const breakLen = 5 * MIN;
                sessions.push({
                  id: sessionId++,
                  kind: "short_break",
                  start: stretchStart + actual,
                  end: stretchStart + actual + breakLen,
                  plannedMs: breakLen,
                  actualMs: breakLen,
                  completed: true,
                  intention: "",
                  taskId: null,
                  interruptions: 0,
                });
              }
            }
          }
        } else {
          const app = pick(roll < 0.5 + pDistract ? DISTRACT : COMMS);
          push(app, stay(app));
        }
        if (r() < 0.12) t += between(2, 12) * MIN; // coffee, a chat, away from keys
      }
    };

    if (!weekend) {
      work(at(between(8.6, 9.5)), at(between(12.2, 12.7)), 0.13);
      t += between(40, 70) * MIN; // lunch
      work(t, at(between(17.5, 18.8)), 0.17);
    } else if (r() < 0.6) {
      work(at(between(10, 11)), at(between(12.5, 14)), 0.28);
    }
    if (r() < 0.75) {
      t = Math.max(t, at(between(20.3, 21.2)));
      const until = at(between(22.4, 23.7));
      while (t < until && t < now) {
        const app = pick(EVENING);
        push(app, stay(app));
        if (r() < 0.2) t += between(5, 25) * MIN;
      }
    }
  }

  // Mark consecutive same-app spans as continuations so "switches" stay honest.
  for (let i = 1; i < spans.length; i++) {
    const a = spans[i - 1];
    const b = spans[i];
    if (a.appId === b.appId && a.domain === b.domain && b.start - a.end < 15_000) b.cont = true;
  }
  return { spans, sessions };
}
