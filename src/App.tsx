import { ChartColumn, Headphones, House, ListChecks, Pause, Play, Search, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Buddy } from "./components/Buddy";
import { CommandPalette } from "./components/CommandPalette";
import { Toasts, cx } from "./components/ui";
import { isNative } from "./lib/backend";
import { useMediaQuery, useNow } from "./lib/hooks";
import { isMac } from "./lib/platform";
import { TAB_VIEWS, finishOrSkip, remainingNow, useApp, type View } from "./lib/store";
import { fmtClock } from "./lib/time";
import type { Phase } from "./lib/types";
import { windowRole } from "./lib/windowRole";
import { MenuPanel } from "./views/MenuPanel";
import { QuickCapture } from "./views/QuickCapture";
import { AppsView } from "./views/AppsView";
import { HomeView } from "./views/HomeView";
import { Onboarding } from "./views/Onboarding";
import { SettingsView } from "./views/SettingsView";
import { SoundsView } from "./views/SoundsView";
import { StatsView } from "./views/StatsView";
import { SummaryView } from "./views/SummaryView";
import { TasksView } from "./views/TasksView";

interface NavItem {
  view: View;
  label: string;
  icon: ReactNode;
}

/** Top-level screens. Settings is secondary: the sidebar sets it apart. */
const PRIMARY: NavItem[] = [
  { view: "home", label: "Home", icon: <House /> },
  { view: "stats", label: "Stats", icon: <ChartColumn /> },
  { view: "sounds", label: "Sounds", icon: <Headphones /> },
  { view: "tasks", label: "Tasks", icon: <ListChecks /> },
];
const SETTINGS: NavItem = { view: "settings", label: "Settings", icon: <SettingsIcon /> };

const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short_break: "Short break", long_break: "Long break" };

function useTheme() {
  const pref = useApp((s) => s.settings.theme ?? "light");
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
      // ⌘K / Ctrl+K: the command palette, from anywhere (even while typing).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        st.setPalette(!st.paletteOpen);
        return;
      }
      if (st.paletteOpen) return;
      if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
        st.setView(TAB_VIEWS[Number(e.key) - 1]);
        e.preventDefault();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.key === "Escape" && st.deepFocus) st.setDeepFocus(false);
      if (st.view !== "home") return;
      if (e.code === "Space" && !el.closest("button, [role=button]")) {
        e.preventDefault();
        void st.timerAction("toggle");
      } else if (e.key === "f") {
        st.setDeepFocus(!st.deepFocus);
      } else if (e.key === "s") {
        void finishOrSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Apps & sites and the summaries live under Stats. */
const sectionOf = (view: View): View => (view === "apps" || view === "summary" ? "stats" : view);

function NavButton({ item, current, className }: { item: NavItem; current: View; className: string }) {
  const setView = useApp((s) => s.setView);
  const active = current === item.view;
  return (
    <button
      className={cx(className, active && "active")}
      aria-current={active ? "page" : undefined}
      title={item.label}
      onClick={() => setView(item.view)}
    >
      <span className="nav-icon" aria-hidden>
        {item.icon}
      </span>
      <span className="nav-label">{item.label}</span>
    </button>
  );
}

/** Wide windows: a sidebar (a rail on medium widths) with search, the screens and a live timer. */
function SideNav() {
  const view = useApp((s) => s.view);
  const setPalette = useApp((s) => s.setPalette);
  const current = sectionOf(view);
  return (
    <aside className="sidenav" aria-label="Kairo">
      <div className="sidenav-brand" data-tauri-drag-region>
        <Buddy mood="idle" size={38} />
        <span className="sidenav-name">Kairo</span>
      </div>
      <button className="sidenav-search" onClick={() => setPalette(true)} aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"} title={`Search and commands (${isMac ? "⌘" : "Ctrl+"}K)`}>
        <Search aria-hidden />
        <span className="nav-label">Search</span>
        <kbd className="sidenav-kbd" aria-hidden>
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <nav className="sidenav-list" aria-label="Main">
        {PRIMARY.map((item) => (
          <NavButton key={item.view} item={item} current={current} className="sidenav-item" />
        ))}
      </nav>
      <div className="sidenav-fill" />
      {view !== "home" && <MiniTimer />}
      <nav className="sidenav-list secondary" aria-label="Preferences">
        <NavButton item={SETTINGS} current={current} className="sidenav-item" />
      </nav>
      {!isNative && (
        <p className="preview-chip" title="Install Kairo to track your own time, privately on your device.">
          <Sparkles aria-hidden /> <span className="nav-label">Preview · sample data</span>
        </p>
      )}
    </aside>
  );
}

/** The timer, a glance away on every other screen (the sidebar keeps it in reach). */
function MiniTimer() {
  const timer = useApp((s) => s.timer)!;
  const skew = useApp((s) => s.clockSkew);
  const { setView, timerAction } = useApp.getState();
  const running = timer.status === "running";
  useNow(1000, running);
  const remaining = remainingNow(timer, skew);
  const flow = timer.flow && timer.phase === "focus";
  const shown = flow ? Math.max(0, timer.durationMs - remaining) : remaining;
  const progress = flow || !timer.durationMs ? 0 : Math.min(1, Math.max(0, 1 - remaining / timer.durationMs));
  const label = flow ? "Flow" : PHASE_LABEL[timer.phase];
  const r = 21;
  const c = 2 * Math.PI * r;
  return (
    <section className={cx("mini-timer", `phase-${timer.phase}`, `is-${timer.status}`)} aria-label="Timer">
      <button className="mini-timer-main" onClick={() => setView("home")} title="Open the timer">
        <span className="mini-timer-ring" aria-hidden>
          <svg viewBox="0 0 48 48">
            <circle cx="24" cy="24" r={r} className="track" />
            {progress > 0 && <circle cx="24" cy="24" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} transform="rotate(-90 24 24)" />}
          </svg>
        </span>
        <span className="mini-timer-text">
          <span className="mini-timer-phase">{timer.status === "paused" ? `${label} · paused` : label}</span>
          <span className="mini-timer-time tabular">{fmtClock(shown)}</span>
        </span>
      </button>
      <button className="circle-btn sm ink mini-timer-play" aria-label={running ? "Pause" : "Start"} onClick={() => void timerAction("toggle")}>
        {running ? <Pause className="fill" /> : <Play className="fill" />}
      </button>
    </section>
  );
}

/** Phones: a tab bar with every destination labelled. */
function TabBar() {
  const view = useApp((s) => s.view);
  const current = sectionOf(view);
  return (
    <nav className="tabbar" aria-label="Main">
      {[...PRIMARY, SETTINGS].map((item) => (
        <NavButton key={item.view} item={item} current={current} className="tabbar-item" />
      ))}
    </nav>
  );
}

function CurrentView() {
  const view = useApp((s) => s.view);
  switch (view) {
    case "home":
      return <HomeView />;
    case "stats":
      return <StatsView />;
    case "sounds":
      return <SoundsView />;
    case "tasks":
      return <TasksView />;
    case "settings":
      return <SettingsView />;
    case "apps":
      return <AppsView />;
    case "summary":
      return <SummaryView />;
  }
}

/** The panel and the capture box: the same store, no navigation. */
function SmallWindow() {
  const ready = useApp((s) => s.ready);
  useTheme();
  useEffect(() => {
    void useApp.getState().init();
  }, []);
  if (!ready) return null;
  return windowRole === "panel" ? <MenuPanel /> : <QuickCapture />;
}

export default function App() {
  return windowRole === "main" ? <MainWindow /> : <SmallWindow />;
}

function MainWindow() {
  const ready = useApp((s) => s.ready);
  const onboarded = useApp((s) => s.settings.onboarded);
  const view = useApp((s) => s.view);
  const routeKey = useApp((s) => s.routeKey);
  const deepFocus = useApp((s) => s.deepFocus);
  const phase = useApp((s) => s.timer?.phase);
  const main = useRef<HTMLElement>(null);
  const navigated = useRef(false);
  useTheme();
  useShortcuts();

  useEffect(() => {
    void useApp.getState().init();
  }, []);

  // A new screen starts at the top, and keyboard and screen reader users land on its title.
  useEffect(() => {
    const scroller = main.current;
    scroller?.scrollTo({ top: 0 });
    if (!navigated.current) {
      navigated.current = true;
      return;
    }
    const title = scroller?.querySelector<HTMLElement>(".page h1");
    if (title) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  }, [view, routeKey]);

  if (!ready) return <div className="boot" />;

  return (
    <div className={cx("app", deepFocus && "deep")} data-phase={phase}>
      <button className="skip-link" onClick={() => main.current?.focus()}>
        Skip to content
      </button>
      <div className="canvas-glow" aria-hidden />
      {/* macOS hides the title bar, so this strip is where the window is dragged from. */}
      <div className="drag-strip" data-tauri-drag-region aria-hidden />
      {!deepFocus && <SideNav />}
      <main className="scroll" id="main" tabIndex={-1} ref={main}>
        <div className={cx("page", `view-${view}`)} key={`${view}:${routeKey}`}>
          <CurrentView />
        </div>
      </main>
      {!deepFocus && <TabBar />}
      <Toasts />
      <CommandPalette />
      {!onboarded && <Onboarding />}
    </div>
  );
}
