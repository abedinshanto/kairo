import { ChartColumn, Headphones, House, ListChecks, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Toasts, cx } from "./components/ui";
import { isNative } from "./lib/backend";
import { confirmDialog } from "./lib/dialogs";
import { useMediaQuery } from "./lib/hooks";
import { TAB_VIEWS, useApp, type View } from "./lib/store";
import { AppsView } from "./views/AppsView";
import { HomeView } from "./views/HomeView";
import { Onboarding } from "./views/Onboarding";
import { SettingsView } from "./views/SettingsView";
import { SoundsView } from "./views/SoundsView";
import { StatsView } from "./views/StatsView";
import { TasksView } from "./views/TasksView";

const NAV: { view: View; label: string; icon: ReactNode }[] = [
  { view: "home", label: "Home", icon: <House /> },
  { view: "stats", label: "Stats", icon: <ChartColumn /> },
  { view: "sounds", label: "Sounds", icon: <Headphones /> },
  { view: "tasks", label: "Tasks", icon: <ListChecks /> },
  { view: "settings", label: "Settings", icon: <SettingsIcon /> },
];

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
      if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
        st.setView(TAB_VIEWS[Number(e.key) - 1]);
        e.preventDefault();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && st.deepFocus) st.setDeepFocus(false);
      if (st.view !== "home") return;
      if (e.code === "Space" && !el.closest("button, [role=button]")) {
        e.preventDefault();
        void st.timerAction("toggle");
      } else if (e.key === "f") {
        st.setDeepFocus(!st.deepFocus);
      } else if (e.key === "s") {
        // A stray keypress shouldn't throw away a focus block that's under way.
        const t = st.timer;
        if (t?.phase === "focus" && t.startedAt !== null) {
          void confirmDialog("The time so far won't count as a finished block.", { title: "Skip this focus block?", okLabel: "Skip" }).then(
            (ok) => ok && void st.timerAction("skip"),
          );
        } else {
          void st.timerAction("skip");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function BottomNav() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const current = view === "apps" ? "stats" : view;
  return (
    <nav className="nav" aria-label="Main">
      {NAV.map((n) => {
        const active = current === n.view;
        return (
          <button
            key={n.view}
            className={cx("nav-item", active && "active")}
            aria-current={active ? "page" : undefined}
            aria-label={n.label}
            title={n.label}
            onClick={() => setView(n.view)}
          >
            {n.icon}
            <span className="nav-label">{n.label}</span>
          </button>
        );
      })}
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
  }
}

export default function App() {
  const ready = useApp((s) => s.ready);
  const onboarded = useApp((s) => s.settings.onboarded);
  const view = useApp((s) => s.view);
  const deepFocus = useApp((s) => s.deepFocus);
  const phase = useApp((s) => s.timer?.phase);
  useTheme();
  useShortcuts();

  useEffect(() => {
    void useApp.getState().init();
  }, []);

  useEffect(() => {
    document.querySelector(".scroll")?.scrollTo({ top: 0 });
  }, [view]);

  if (!ready) return <div className="boot" />;

  return (
    <div className={cx("app", deepFocus && "deep")} data-phase={phase}>
      <div className="canvas-glow" aria-hidden />
      <main className="scroll">
        <div className={cx("page", `view-${view}`)} key={view}>
          <CurrentView />
        </div>
      </main>
      {!deepFocus && <BottomNav />}
      {!isNative && !deepFocus && (
        <div className="preview-chip" title="Install Kairo to track your own time, privately on your device.">
          <Sparkles /> Preview · sample data
        </div>
      )}
      <Toasts />
      {!onboarded && <Onboarding />}
    </div>
  );
}
