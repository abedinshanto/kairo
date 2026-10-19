import {
  Activity,
  AppWindow,
  AudioLines,
  Ellipsis,
  ListChecks,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Toasts, cx } from "./components/ui";
import { isNative } from "./lib/backend";
import { useMediaQuery, useNow } from "./lib/hooks";
import { isMac } from "./lib/platform";
import { remainingNow, useApp, type View } from "./lib/store";
import { fmtClock } from "./lib/time";
import { AppsView } from "./views/AppsView";
import { FocusView } from "./views/FocusView";
import { InsightsView } from "./views/InsightsView";
import { MoreView } from "./views/MoreView";
import { Onboarding } from "./views/Onboarding";
import { SettingsView } from "./views/SettingsView";
import { SoundsView } from "./views/SoundsView";
import { TasksView } from "./views/TasksView";
import { TodayView } from "./views/TodayView";

const NAV: { view: View; label: string; icon: ReactNode }[] = [
  { view: "focus", label: "Focus", icon: <Timer /> },
  { view: "today", label: "Today", icon: <Activity /> },
  { view: "insights", label: "Insights", icon: <Sparkles /> },
  { view: "apps", label: "Apps & Sites", icon: <AppWindow /> },
  { view: "tasks", label: "Tasks", icon: <ListChecks /> },
  { view: "sounds", label: "Sounds", icon: <AudioLines /> },
];

const TABS: { view: View; label: string; icon: ReactNode }[] = [
  { view: "focus", label: "Focus", icon: <Timer /> },
  { view: "today", label: "Today", icon: <Activity /> },
  { view: "insights", label: "Insights", icon: <Sparkles /> },
  { view: "sounds", label: "Sounds", icon: <AudioLines /> },
  { view: "more", label: "More", icon: <Ellipsis /> },
];

const PHASE_LABEL = { focus: "Focus", short_break: "Short break", long_break: "Long break" } as const;

function useTheme() {
  const pref = useApp((s) => s.settings.theme ?? "system");
  const prefersLight = useMediaQuery("(prefers-color-scheme: light)");
  useEffect(() => {
    const theme = pref === "system" ? (prefersLight ? "light" : "dark") : pref;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("kairo-theme", pref);
    } catch {
      /* storage unavailable */
    }
  }, [pref, prefersLight]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest("input, textarea, select, [contenteditable=true]");
      const st = useApp.getState();
      if ((e.metaKey || e.ctrlKey) && /^[1-7]$/.test(e.key)) {
        const views: View[] = ["focus", "today", "insights", "apps", "tasks", "sounds", "settings"];
        st.setView(views[Number(e.key) - 1]);
        e.preventDefault();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && st.deepFocus) st.setDeepFocus(false);
      if (st.view !== "focus") return;
      if (e.code === "Space" && !el.closest("button")) {
        e.preventDefault();
        void st.timerAction("toggle");
      } else if (e.key === "f") {
        st.setDeepFocus(!st.deepFocus);
      } else if (e.key === "s") {
        void st.timerAction("skip");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function SidebarStatus() {
  const timer = useApp((s) => s.timer);
  const skew = useApp((s) => s.clockSkew);
  const tracker = useApp((s) => s.tracker);
  const setView = useApp((s) => s.setView);
  useNow(1000, timer?.status === "running");
  const active = timer && timer.status !== "idle";

  const paused = tracker?.pausedUntil && tracker.pausedUntil > Date.now();
  const trackingText = !isNative
    ? "Sample data"
    : !tracker?.supported
      ? "Timer only on this device"
      : !tracker.enabled
        ? "Tracking off"
        : paused
          ? "Tracking paused"
          : tracker.needsPermission
            ? "Needs usage access"
            : tracker.current
              ? tracker.current.domain ?? tracker.current.appName
              : "Idle";

  return (
    <div className="side-status">
      {active && timer && (
        <button className={cx("side-timer", `phase-${timer.phase}`)} onClick={() => setView("focus")}>
          <span className="side-timer-dot" />
          <span className="side-timer-label">{PHASE_LABEL[timer.phase]}</span>
          <span className="side-timer-time tabular">
            {timer.status === "paused" ? "Paused · " : ""}
            {fmtClock(remainingNow(timer, skew))}
          </span>
        </button>
      )}
      <div className="side-tracking" title="What Kairo is tracking right now">
        <span className={cx("live-dot", tracker?.current && !paused && "on")} />
        <span className="side-tracking-text">{trackingText}</span>
      </div>
      <div className="side-privacy">
        <ShieldCheck />
        <span>Private · stays on this device</span>
      </div>
    </div>
  );
}

function Sidebar() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  return (
    <aside className="sidebar">
      <div className="side-drag" data-tauri-drag-region />
      <div className="brand" data-tauri-drag-region>
        <svg viewBox="0 0 32 32" className="brand-mark" aria-hidden>
          <defs>
            <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7fb2ff" />
              <stop offset="0.55" stopColor="#3987e5" />
              <stop offset="1" stopColor="#9085e9" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" className="brand-bg" />
          <circle cx="16" cy="16" r="8.2" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="2.6" />
          <path d="M16 7.8 A8.2 8.2 0 1 1 8.9 11.9" fill="none" stroke="url(#brand-g)" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        <span className="brand-name">Kairo</span>
      </div>
      <nav className="side-nav" aria-label="Main">
        {NAV.map((n, i) => (
          <button key={n.view} className={cx("side-item", view === n.view && "active")} aria-current={view === n.view ? "page" : undefined} onClick={() => setView(n.view)}>
            {n.icon}
            <span>{n.label}</span>
            <span className="side-kbd">{isMac ? "⌘" : "Ctrl "}{i + 1}</span>
          </button>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <SidebarStatus />
      <button className={cx("side-item", view === "settings" && "active")} onClick={() => setView("settings")}>
        <SettingsIcon />
        <span>Settings</span>
      </button>
    </aside>
  );
}

function TabBar() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const inMore = view === "more" || view === "apps" || view === "tasks" || view === "settings";
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.view}
          className={cx("tab", (view === t.view || (t.view === "more" && inMore)) && "active")}
          onClick={() => setView(t.view)}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

function CurrentView() {
  const view = useApp((s) => s.view);
  switch (view) {
    case "focus":
      return <FocusView />;
    case "today":
      return <TodayView />;
    case "insights":
      return <InsightsView />;
    case "apps":
      return <AppsView />;
    case "tasks":
      return <TasksView />;
    case "sounds":
      return <SoundsView />;
    case "settings":
      return <SettingsView />;
    case "more":
      return <MoreView />;
  }
}

export default function App() {
  const ready = useApp((s) => s.ready);
  const onboarded = useApp((s) => s.settings.onboarded);
  const view = useApp((s) => s.view);
  const deepFocus = useApp((s) => s.deepFocus);
  useTheme();
  useShortcuts();

  useEffect(() => {
    void useApp.getState().init();
  }, []);

  useEffect(() => {
    document.querySelector(".main")?.scrollTo({ top: 0 });
  }, [view]);

  if (!ready) return <div className="boot" />;

  return (
    <div className={cx("shell", deepFocus && "deep")}>
      <Sidebar />
      <main className="main">
        {!isNative && (
          <div className="demo-banner">
            <Sparkles />
            <span>
              <strong>Preview with sample data.</strong> Install Kairo on your Mac, PC or phone to track your own time, entirely on-device.
            </span>
          </div>
        )}
        <div className={cx("main-inner", `view-${view}`)} key={view}>
          <CurrentView />
        </div>
      </main>
      <TabBar />
      <Toasts />
      {!onboarded && <Onboarding />}
    </div>
  );
}
