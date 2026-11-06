// Browser preview backend: same API as the native core, backed by generated
// sample data and an in-memory timer. Nothing is persisted except UI prefs.

import { DEFAULT_SETTINGS, withDefaults } from "../defaults";
import { startOfDay } from "../time";
import type {
  ActivitySpan,
  Backend,
  Backup,
  BackendEvent,
  BucketTotals,
  CurrentActivity,
  EntityTotal,
  FocusSession,
  Productivity,
  Rule,
  Settings,
  Task,
  TimerSnapshot,
  TrackerStatus,
} from "../types";
import { generateSeed, SEED_TASKS, type SeedSpan } from "./seed";
import { TimerEngine, type Effects } from "./timerEngine";

const MAX_SPAN_MS = 3_600_000;
const PREFS_KEY = "kairo-demo-settings";

function loadPrefs(): Settings {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return withDefaults(JSON.parse(raw));
  } catch {
    /* storage unavailable: fall back to defaults */
  }
  return withDefaults({ ...DEFAULT_SETTINGS, onboarded: false });
}

function savePrefs(s: Settings) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 40));

/** Same rule as the core: the site itself or any subdomain of it. */
const siteExcluded = (domain: string, excluded: string[]) => excluded.some((ex) => domain === ex || domain.endsWith(`.${ex}`));

export function createDemoBackend(): Backend {
  let settings = loadPrefs();
  const seed = generateSeed(98);
  const spans: SeedSpan[] = seed.spans;
  let nextSpanId = 1;
  for (const s of spans) s.id = nextSpanId++;
  const sessions: FocusSession[] = seed.sessions;
  let nextSessionId = sessions.length + 1;
  const today = startOfDay(Date.now());
  // A couple of due dates, so Today and the badges have something to show.
  const SEED_DUE: Record<number, number> = { 1: today, 3: startOfDay(today + 36 * 3_600_000) };
  let tasks = SEED_TASKS.map((t) => ({ ...t, createdAt: Date.now() - 6 * 86_400_000, dueDay: (SEED_DUE[t.id] ?? null) as number | null }));
  let nextTaskId = tasks.length + 1;
  const rules = new Map<string, Rule>();
  let autostart = false;
  const timer = new TimerEngine(settings);
  const listeners = new Set<(e: BackendEvent) => void>();
  const backups: Backup[] = [7, 14, 21].map((days) => {
    const at = Date.now() - days * 86_400_000;
    return { name: `kairo-${new Date(at).toISOString().slice(0, 10)}.db`, at, bytes: 2_400_000 - days * 18_000 };
  });
  let pausedUntil: number | null = null;
  let current: CurrentActivity | null = null;

  const emit = (e: BackendEvent) => listeners.forEach((l) => l(e));
  const snap = () => timer.snapshot(Date.now(), settings);

  const effective = (s: SeedSpan): { category: string; productivity: Productivity } => {
    const rule = (s.domain ? rules.get(`site:${s.domain}`) : undefined) ?? (s.domain ? undefined : rules.get(`app:${s.appId}`));
    const { category, productivity } = rule ?? s;
    return { category, productivity };
  };

  /** Index of the first span that could overlap a range starting at `from`. */
  const firstIndex = (from: number) => {
    let lo = 0;
    let hi = spans.length;
    const target = from - MAX_SPAN_MS;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (spans[mid].start < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const overlapping = function* (from: number, to: number) {
    for (let i = firstIndex(from); i < spans.length && spans[i].start < to; i++) {
      const s = spans[i];
      if (s.end > from) yield s;
    }
  };

  const applyEffects = (fx: Effects) => {
    if (fx.record) {
      sessions.push({ id: nextSessionId++, ...fx.record });
      emit({ type: "data" });
    }
    if (fx.completed) emit({ type: "completed", completed: fx.completed });
  };

  const mutate = (f: (now: number) => Effects): TimerSnapshot => {
    const fx = f(Date.now());
    applyEffects(fx);
    const s = snap();
    emit({ type: "timer", snapshot: s });
    return s;
  };

  setInterval(() => {
    if (timer.status === "running" && Date.now() >= timer.endsAt) {
      mutate((now) => timer.complete(now, settings));
    }
  }, 250);

  // Simulated live tracking so "Now" and today's charts move in the preview.
  const LIVE: Omit<SeedSpan, "start" | "end" | "cont">[] = [
    { appId: "visual studio code", appName: "Visual Studio Code", domain: null, category: "development", productivity: 1, source: "desktop" },
    { appId: "figma", appName: "Figma", domain: null, category: "design", productivity: 1, source: "desktop" },
    { appId: "google chrome", appName: "Google Chrome", domain: "github.com", category: "development", productivity: 1, source: "desktop" },
    { appId: "slack", appName: "Slack", domain: null, category: "communication", productivity: 0, source: "desktop" },
    { appId: "notion", appName: "Notion", domain: null, category: "productivity", productivity: 1, source: "desktop" },
  ];
  let liveIndex = 0;
  const liveTick = () => {
    const now = Date.now();
    if (!settings.trackingEnabled || (pausedUntil && pausedUntil > now)) {
      if (current) {
        current = null;
        emit({ type: "current", current });
      }
      return;
    }
    const last = spans[spans.length - 1];
    const app = LIVE[liveIndex % LIVE.length];
    if (settings.excludedApps.includes(app.appId) || (app.domain && siteExcluded(app.domain, settings.excludedSites))) {
      if (current) {
        current = null;
        emit({ type: "current", current });
      }
      return;
    }
    const same = current && last && last.appId === app.appId && last.domain === app.domain && now - last.end < 60_000;
    if (same) {
      last.end = now;
    } else {
      const start = last && now - last.end < 60_000 ? last.end : now - 20_000;
      spans.push({ ...app, id: nextSpanId++, start, end: now, cont: false });
      const eff = effective(spans[spans.length - 1]);
      current = { appId: app.appId, appName: app.appName, domain: app.domain, ...eff, since: start };
      emit({ type: "current", current });
    }
  };
  liveTick();
  setInterval(liveTick, 15_000);
  setInterval(() => {
    liveIndex++;
    liveTick();
  }, 75_000);

  const trackerStatus = (): TrackerStatus => ({
    supported: true,
    enabled: settings.trackingEnabled,
    pausedUntil: pausedUntil && pausedUntil > Date.now() ? pausedUntil : null,
    platform: "demo",
    needsPermission: false,
    current,
  });

  /** Like the core: time logged or moved into a window replaces what was there. */
  const makeRoom = (start: number, end: number, keep?: number) => {
    for (let i = spans.length - 1; i >= 0; i--) {
      const s = spans[i];
      if (s.id === keep || s.end <= start || s.start >= end) continue;
      if (s.start >= start && s.end <= end) spans.splice(i, 1);
      else if (s.start < start && s.end > end) {
        insertSpan({ ...s, id: nextSpanId++, start: end, cont: true });
        s.end = start;
      } else if (s.start < start) s.end = start;
      else s.start = end;
    }
    spans.sort((a, b) => a.start - b.start);
  };

  /** Keeps `spans` sorted by start, which the range lookups rely on. */
  const insertSpan = (s: SeedSpan) => {
    let i = spans.length;
    while (i > 0 && spans[i - 1].start > s.start) i--;
    spans.splice(i, 0, s);
  };

  const toSpan = (s: SeedSpan, i: number, from: number, to: number): ActivitySpan => ({
    id: s.id ?? -i,
    start: Math.max(s.start, from),
    end: Math.min(s.end, to),
    appId: s.appId,
    appName: s.appName,
    domain: s.domain,
    title: null,
    source: s.source,
    ...effective(s),
  });

  const taskStats = (): Task[] =>
    tasks
      .map((t) => {
        const mine = sessions.filter((s) => s.kind === "focus" && s.taskId === t.id);
        return {
          ...t,
          pomodoros: mine.filter((s) => s.completed).length,
          focusMs: mine.reduce((a, s) => a + s.actualMs, 0),
        };
      })
      // Open tasks keep their priority order (the array's); done ones newest first.
      .sort((a, b) => Number(a.done) - Number(b.done) || (a.done ? (b.completedAt ?? 0) - (a.completedAt ?? 0) : 0));

  // Dictation in the preview: Kai "hears" a sample phrase, so the flow can be tried.
  const SAMPLE_SPEECH = ["Polish the pricing page copy", "Review pull requests", "Plan next week's sprint, two blocks", "Reply to design feedback"];
  let speechIndex = 0;
  let voice: { phrase: string; finish: (text: string) => void } | null = null;

  return {
    kind: "demo",
    getSettings: () => delay(settings),
    async updateSettings(next) {
      const before = settings;
      settings = withDefaults(next);
      for (const app of settings.excludedApps) {
        if (!before.excludedApps.includes(app)) {
          for (let i = spans.length - 1; i >= 0; i--) if (spans[i].appId === app) spans.splice(i, 1);
        }
      }
      for (const site of settings.excludedSites) {
        if (!before.excludedSites.includes(site)) {
          for (let i = spans.length - 1; i >= 0; i--) {
            const d = spans[i].domain;
            if (d && siteExcluded(d, [site])) spans.splice(i, 1);
          }
        }
      }
      timer.applySettings(settings);
      savePrefs(settings);
      emit({ type: "settings", settings });
      emit({ type: "timer", snapshot: snap() });
      return settings;
    },

    timerGet: () => delay(snap()),
    timerAction: async (action) => mutate((now) => timer.act(action, now, settings)),
    timerSetPhase: async (phase) => mutate((now) => timer.setPhase(phase, now, settings)),
    timerExtend: async (minutes) =>
      mutate((now) => {
        timer.extend(minutes, now);
        return {};
      }),
    timerSetIntention: async (intention, taskId) =>
      mutate(() => {
        timer.intention = intention.slice(0, 200);
        timer.taskId = taskId;
        return {};
      }),

    async activitySpans(from, to) {
      return [...overlapping(from, to)].map((s, i) => toSpan(s, i, from, to));
    },
    async bucketTotals(buckets) {
      return buckets.map(([from, to]): BucketTotals => {
        const t: BucketTotals = { from, to, productiveMs: 0, neutralMs: 0, distractingMs: 0, switches: 0 };
        for (const s of overlapping(from, to)) {
          const ms = Math.min(s.end, to) - Math.max(s.start, from);
          const p = effective(s).productivity;
          if (p > 0) t.productiveMs += ms;
          else if (p < 0) t.distractingMs += ms;
          else t.neutralMs += ms;
          if (!s.cont && s.start >= from) t.switches++;
        }
        return t;
      });
    },
    // The preview runs in a browser, which can't see installed apps: monograms only.
    appIcons: async () => ({}),

    async entityTotals(from, to) {
      const map = new Map<string, EntityTotal>();
      for (const s of overlapping(from, to)) {
        const key = s.domain ?? s.appId;
        const kind = s.domain ? "site" : "app";
        const id = `${kind}:${key}`;
        const eff = effective(s);
        const e =
          map.get(id) ??
          ({
            key,
            kind,
            name: s.domain ?? s.appName,
            appName: s.appName,
            category: eff.category,
            productivity: eff.productivity,
            ms: 0,
            visits: 0,
            lastSeen: 0,
          } satisfies EntityTotal);
        e.ms += Math.min(s.end, to) - Math.max(s.start, from);
        e.visits += s.cont ? 0 : 1;
        e.lastSeen = Math.max(e.lastSeen, s.end);
        map.set(id, e);
      }
      return [...map.values()].sort((a, b) => b.ms - a.ms);
    },
    async focusSessions(from, to) {
      return sessions.filter((s) => s.start < to && s.end > from).sort((a, b) => a.start - b.start);
    },

    tasksList: async () => taskStats(),
    async taskCreate(title, estimate, dueDay) {
      const id = nextTaskId++;
      tasks.unshift({
        id,
        title: title.trim(),
        estimate,
        done: false,
        createdAt: Date.now(),
        completedAt: null,
        dueDay: dueDay ?? null,
        notes: null,
        sound: null,
      });
      return id;
    },
    async taskUpdate(id, patch) {
      const clean = (v: string | null | undefined) => (v == null ? null : v.trim() || null);
      tasks = tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.estimate !== undefined ? { estimate: patch.estimate } : {}),
              ...(patch.done !== undefined ? { done: patch.done, completedAt: patch.done ? Date.now() : null } : {}),
              ...(patch.dueDay !== undefined ? { dueDay: patch.dueDay } : {}),
              ...(patch.notes !== undefined ? { notes: clean(patch.notes)?.slice(0, 500) ?? null } : {}),
              ...(patch.sound !== undefined ? { sound: clean(patch.sound) } : {}),
            }
          : t,
      );
    },
    async taskDelete(id) {
      tasks = tasks.filter((t) => t.id !== id);
    },
    async tasksReorder(ids) {
      const byId = new Map(tasks.map((t) => [t.id, t]));
      const ordered = ids.map((id) => byId.get(id)).filter((t): t is (typeof tasks)[number] => !!t);
      tasks = [...ordered, ...tasks.filter((t) => !ids.includes(t.id))];
      emit({ type: "data" });
    },

    async deleteHistory(kind, key) {
      for (let i = spans.length - 1; i >= 0; i--) {
        const s = spans[i];
        if (kind === "site" ? s.domain === key : s.appId === key && !s.domain) spans.splice(i, 1);
      }
      emit({ type: "data" });
    },

    async spanAdd({ start, end, name, category, productivity }) {
      if (!(end > start)) throw new Error("The end has to be after the start");
      makeRoom(start, end);
      const id = nextSpanId++;
      insertSpan({ id, start, end, appId: `manual:${name.trim().toLowerCase()}`, appName: name.trim(), domain: null, category, productivity, source: "manual", cont: false });
      emit({ type: "data" });
      return id;
    },
    async spanUpdate(id, start, end) {
      if (!(end > start)) throw new Error("The end has to be after the start");
      const i = spans.findIndex((s) => s.id === id);
      if (i < 0) throw new Error("That entry is gone");
      makeRoom(start, end, id);
      const at = spans.findIndex((x) => x.id === id);
      const [s] = spans.splice(at, 1);
      insertSpan({ ...s, start, end });
      emit({ type: "data" });
    },
    async spanDelete(id) {
      const i = spans.findIndex((s) => s.id === id);
      if (i >= 0) spans.splice(i, 1);
      emit({ type: "data" });
    },
    async sessionUpdate(id, taskId, intention) {
      const s = sessions.find((x) => x.id === id);
      if (s) {
        s.taskId = taskId;
        s.intention = intention.trim().slice(0, 200);
      }
      emit({ type: "data" });
    },
    async sessionDelete(id) {
      const i = sessions.findIndex((x) => x.id === id);
      if (i >= 0) sessions.splice(i, 1);
      emit({ type: "data" });
    },

    importData: async () => {
      throw new Error("Importing works in the Kairo app; the browser preview only has sample data.");
    },
    backupsList: async () => [...backups].sort((a, b) => b.at - a.at),
    async backupNow() {
      const b = { name: `kairo-${new Date().toISOString().slice(0, 10)}.db`, at: Date.now(), bytes: spans.length * 160 };
      const same = backups.findIndex((x) => x.name === b.name);
      if (same >= 0) backups.splice(same, 1);
      backups.push(b);
      backups.sort((a, c) => c.at - a.at);
      backups.length = Math.min(backups.length, 4);
      return b;
    },
    backupRestore: async () => {
      throw new Error("Restoring works in the Kairo app; the browser preview only has sample data.");
    },

    // The preview opens the small windows as pages (#panel, #capture).
    async windowHide() {
      window.location.hash = "#/home";
      window.location.reload();
    },
    async windowOpenMain(view) {
      window.location.hash = `#/${view ?? "home"}`;
      window.location.reload();
    },

    // The preview never goes online; it's always "up to date".
    updateStatus: async () => null,
    updateCheck: async () => null,
    async updateOpen() {
      window.open("https://github.com/abedinshanto/kairo/releases/latest", "_blank", "noopener");
    },

    voiceAvailable: async () => true,
    voiceListen() {
      voice?.finish("");
      return new Promise<string>((resolve) => {
        const phrase = SAMPLE_SPEECH[speechIndex++ % SAMPLE_SPEECH.length];
        let t = 0;
        emit({ type: "voice", state: "listening" });
        const levels = window.setInterval(() => {
          t += 1;
          emit({ type: "voice-level", level: t > 34 ? 0.04 : 0.25 + 0.55 * Math.abs(Math.sin(t * 0.7)) * Math.random() });
        }, 50);
        const timer = window.setTimeout(() => finish(phrase), 2300);
        const finish = (text: string) => {
          window.clearInterval(levels);
          window.clearTimeout(timer);
          voice = null;
          if (!text) return resolve("");
          emit({ type: "voice", state: "thinking" });
          window.setTimeout(() => resolve(text), 450);
        };
        voice = { phrase, finish };
      });
    },
    async voiceStop() {
      // Stopping early keeps what was "heard".
      voice?.finish(voice.phrase);
    },
    async voiceCancel() {
      voice?.finish("");
    },

    rulesList: async () => [...rules.values()],
    async ruleSet(rule) {
      rules.set(rule.key, rule);
      emit({ type: "data" });
    },
    async ruleDelete(key) {
      rules.delete(key);
      emit({ type: "data" });
    },

    trackerStatus: async () => trackerStatus(),
    async trackerPause(minutes) {
      pausedUntil = minutes ? Date.now() + minutes * 60_000 : null;
      liveTick();
      const s = trackerStatus();
      emit({ type: "tracker", status: s });
      return s;
    },
    usagePermissionRequest: async () => {},
    usageSync: async () => 0,

    dataInfo: async () => ({
      spans: spans.length,
      sessions: sessions.length,
      firstActivity: spans[0]?.start ?? null,
      dbPath: "In-memory sample data (browser preview)",
      dbBytes: spans.length * 160,
    }),
    async exportData(format) {
      const body =
        format === "csv"
          ? ["start,end,app,website,category,productivity"]
              .concat(
                spans.map((s) => {
                  const e = effective(s);
                  return [new Date(s.start).toISOString(), new Date(s.end).toISOString(), s.appName, s.domain ?? "", e.category, e.productivity].join(",");
                }),
              )
              .join("\n")
          : JSON.stringify({ format: "kairo-export", version: 1, settings, tasks: taskStats(), sessions, activity: spans }, null, 0);
      const url = URL.createObjectURL(new Blob([body], { type: format === "csv" ? "text/csv" : "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `kairo-sample-export.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    },
    async wipeData() {
      spans.length = 0;
      sessions.length = 0;
      tasks = [];
      rules.clear();
      emit({ type: "data" });
    },

    // The preview shows the desktop app's "Open at login" row; it just remembers the choice.
    autostartEnabled: async () => autostart,
    async setAutostart(enabled) {
      autostart = enabled;
    },
    async ensureNotificationPermission() {
      if (!("Notification" in window)) return false;
      if (Notification.permission === "granted") return true;
      return (await Notification.requestPermission()) === "granted";
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
