import {
  ArrowRight,
  CalendarDays,
  ChartColumn,
  Check,
  Eye,
  EyeOff,
  Headphones,
  House,
  Infinity as InfinityIcon,
  ListChecks,
  Maximize2,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  SkipForward,
  Sun,
  AppWindow,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { PRESET_ICONS } from "./soundIcons";
import { cx } from "./ui";
import { PRESETS, soundEngine, type SoundId } from "../lib/audio/engine";
import { backend } from "../lib/backend";
import { isMac } from "../lib/platform";
import { finishOrSkip, useApp, type View } from "../lib/store";
import { startOfDay } from "../lib/time";
import type { Phase, Task } from "../lib/types";

type Group = "Timer" | "Go to" | "Tasks" | "Sounds" | "Settings";
const GROUPS: Group[] = ["Timer", "Tasks", "Go to", "Sounds", "Settings"];

interface Command {
  id: string;
  group: Group;
  label: string;
  icon: ReactNode;
  /** Other words people might type for it. */
  keywords?: string;
  /** A shortcut shown beside it. */
  keys?: string;
  run: () => unknown;
}

const PHASES: { phase: Phase; label: string }[] = [
  { phase: "focus", label: "Focus" },
  { phase: "short_break", label: "Short break" },
  { phase: "long_break", label: "Long break" },
];

/** How well `cmd` matches the typed words: every word must appear; word starts score higher. */
function score(cmd: Command, words: string[]): number {
  if (!words.length) return 1;
  const label = cmd.label.toLowerCase();
  const hay = `${label} ${cmd.keywords ?? ""} ${cmd.group}`.toLowerCase();
  let total = 0;
  for (const w of words) {
    const at = hay.indexOf(w);
    if (at < 0) return 0;
    total += label.startsWith(w) ? 4 : new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(label) ? 3 : at < label.length ? 2 : 1;
  }
  return total;
}

function useCommands(open: boolean, tasks: Task[]): Command[] {
  const timer = useApp((s) => s.timer);
  const settings = useApp((s) => s.settings);
  const tracker = useApp((s) => s.tracker);
  const playing = useApp((s) => s.soundPlaying);
  return useMemo(() => {
    if (!open || !timer) return [];
    const st = useApp.getState();
    const go = (view: View, hash?: string) => () => {
      st.setView(view);
      if (hash) window.history.replaceState(null, "", hash);
    };
    const out: Command[] = [];
    const running = timer.status === "running";
    const started = timer.startedAt !== null;
    const flow = timer.flow && timer.phase === "focus";
    const what = timer.phase === "focus" ? (flow ? "flow" : "focus") : "break";
    out.push({
      id: "toggle",
      group: "Timer",
      label: running ? "Pause the timer" : started ? `Resume the ${what}` : `Start ${what === "break" ? "the break" : what}`,
      icon: running ? <Pause /> : <Play />,
      keywords: "start pause resume play timer pomodoro",
      keys: "Space",
      run: () => st.timerAction("toggle"),
    });
    if (timer.phase === "focus" && started) {
      out.push({ id: "finish", group: "Timer", label: flow ? "Take your earned break" : "Finish this block", icon: <Check />, keywords: "done end log complete break", keys: "S", run: () => finishOrSkip() });
    }
    if (timer.phase !== "focus") out.push({ id: "skip", group: "Timer", label: "Skip the break", icon: <SkipForward />, keywords: "next focus", run: () => st.timerAction("skip") });
    if (started) out.push({ id: "stop", group: "Timer", label: "Start over", icon: <RotateCcw />, keywords: "reset restart stop", run: () => st.timerAction("stop") });
    if (!started) {
      for (const p of PHASES) {
        if (p.phase !== timer.phase) out.push({ id: `phase-${p.phase}`, group: "Timer", label: `Switch to ${p.label.toLowerCase()}`, icon: <ArrowRight />, keywords: "mode phase pomodoro", run: () => st.setPhase(p.phase) });
      }
    }
    out.push({
      id: "flow",
      group: "Timer",
      label: settings.flowMode ? "Turn flow mode off" : "Turn flow mode on",
      icon: <InfinityIcon />,
      keywords: "count up stopwatch flowtime earn break",
      run: () => st.updateSettings({ flowMode: !settings.flowMode }),
    });
    out.push({
      id: "deep",
      group: "Timer",
      label: "Deep focus",
      icon: <Maximize2 />,
      keywords: "fullscreen distraction free zen",
      keys: "F",
      run: () => {
        st.setView("home");
        st.setDeepFocus(true);
      },
    });

    // Tasks: the open ones, in priority order.
    out.push({
      id: "add-task",
      group: "Tasks",
      label: "Add a task",
      icon: <Plus />,
      keywords: "new todo create",
      run: () => {
        st.setView("tasks");
        window.setTimeout(() => document.getElementById("task-composer-input")?.focus(), 80);
      },
    });
    tasks.forEach((t, i) =>
      out.push({
        id: `task-${t.id}`,
        group: "Tasks",
        label: `Focus on ${t.title}`,
        icon: <span className="palette-num">{i + 1}</span>,
        keywords: `task ${t.title}`,
        run: async () => {
          await st.setIntention(t.title, t.id);
          st.setView("home");
        },
      }),
    );

    const screens: [View, string, ReactNode, string?, string?][] = [
      ["home", "Home", <House />, "timer today", "⌘1"],
      ["stats", "Stats", <ChartColumn />, "progress insights charts", "⌘2"],
      ["sounds", "Sounds", <Headphones />, "soundscapes ambience music noise", "⌘3"],
      ["tasks", "Tasks", <ListChecks />, "todo plan", "⌘4"],
      ["settings", "Settings", <SettingsIcon />, "preferences options", "⌘5"],
      ["apps", "Apps & sites", <AppWindow />, "categories productivity rules websites"],
    ];
    for (const [view, label, icon, keywords, keys] of screens) {
      out.push({ id: `go-${view}`, group: "Go to", label, icon, keywords, keys: keys && (isMac ? keys : keys.replace("⌘", "Ctrl+")), run: go(view) });
    }
    out.push({ id: "go-week", group: "Go to", label: "This week's stats", icon: <CalendarDays />, keywords: "7 days range", run: go("stats", "#/stats?r=7") });
    out.push({ id: "go-summary", group: "Go to", label: "Today's summary", icon: <ScrollText />, keywords: "daily wrap recap", run: () => st.openSummary() });
    out.push({ id: "go-review", group: "Go to", label: "Weekly review", icon: <ScrollText />, keywords: "week wrap recap", run: () => st.openSummary(startOfDay(Date.now()), true) });

    out.push({
      id: "sound-toggle",
      group: "Sounds",
      label: playing ? "Pause the sound" : "Play the sound",
      icon: playing ? <Pause /> : <Headphones />,
      keywords: "soundscape music noise mute",
      run: () => soundEngine.toggle(),
    });
    for (const p of PRESETS) {
      out.push({
        id: `preset-${p.id}`,
        group: "Sounds",
        label: `Play ${p.name}`,
        icon: PRESET_ICONS[p.id] ?? <Headphones />,
        keywords: `soundscape ${p.description}`,
        run: () => {
          st.updateSound({ levels: p.levels as Record<SoundId, number> });
          if (!soundEngine.playing) void soundEngine.play();
        },
      });
    }

    const dark = document.documentElement.dataset.theme === "dark";
    out.push({ id: "theme", group: "Settings", label: dark ? "Light theme" : "Dark theme", icon: dark ? <Sun /> : <Moon />, keywords: "appearance mode colour color", run: () => st.updateSettings({ theme: dark ? "light" : "dark" }) });
    if (tracker?.supported && settings.trackingEnabled) {
      const paused = !!tracker.pausedUntil && tracker.pausedUntil > Date.now();
      out.push({
        id: "tracking",
        group: "Settings",
        label: paused ? "Resume tracking" : "Pause tracking for an hour",
        icon: paused ? <Eye /> : <EyeOff />,
        keywords: "privacy private incognito",
        run: () => st.pauseTracking(paused ? null : 60),
      });
    }
    return out;
  }, [open, timer, settings.flowMode, settings.trackingEnabled, tracker, playing, tasks]);
}

/** ⌘K / Ctrl+K: every action, screen, task and sound, from the keyboard. */
export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const setPalette = useApp((s) => s.setPalette);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const id = useId().replace(/:/g, "");
  const commands = useCommands(open, tasks);

  useEffect(() => {
    if (!open) return;
    backend
      .tasksList()
      .then((all) => setTasks(all.filter((t) => !t.done)))
      .catch(() => setTasks([]));
    // Everything behind is inert while it's open.
    const others = Array.from(document.querySelectorAll<HTMLElement>(".app > *:not(.palette-scrim):not(.toasts)"));
    others.forEach((el) => el.setAttribute("inert", ""));
    return () => {
      others.forEach((el) => el.removeAttribute("inert"));
      opener.current?.focus({ preventScroll: true });
    };
  }, [open]);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = useMemo(() => {
    const scored = commands.map((c) => ({ c, s: score(c, words) })).filter((x) => x.s > 0);
    // Nothing typed: the timer, the first tasks and the screens. Typed: best matches first, within groups.
    const shown = words.length ? scored : scored.filter((x) => x.c.group !== "Sounds" || x.c.id === "sound-toggle");
    const byGroup = GROUPS.map((g) => ({
      group: g,
      items: shown
        .filter((x) => x.c.group === g)
        .sort((a, b) => b.s - a.s)
        .slice(0, words.length ? 8 : g === "Tasks" ? 5 : 8)
        .map((x) => x.c),
    })).filter((g) => g.items.length);
    if (words.length) byGroup.sort((a, b) => score(b.items[0], words) - score(a.items[0], words));
    return byGroup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, query]);
  const flat = results.flatMap((g) => g.items);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  // Start fresh next time; focus goes back to whatever opened it.
  const close = () => {
    setPalette(false);
    setQuery("");
    setActive(0);
  };
  const runAt = (i: number) => {
    const cmd = flat[i];
    if (!cmd) return;
    // The opener gets focus back first, so a command that moves focus wins.
    close();
    window.setTimeout(() => void Promise.resolve(cmd.run()).catch(() => {}), 0);
  };

  let index = -1;
  return (
    <div className="palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search and commands">
        <div className="palette-field">
          <Search aria-hidden />
          <input
            ref={(el) => {
              input.current = el;
              // Remember the opener and take focus the moment it mounts, so typing right after ⌘K is never lost.
              if (el && document.activeElement !== el) {
                opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                el.focus();
              }
            }}
            className="palette-input"
            placeholder="Search actions, screens, tasks…"
            value={query}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={flat.length ? `${id}-opt-${active}` : undefined}
            aria-autocomplete="list"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
              } else if (e.key === "Enter") {
                // Not while an input method is still composing a character.
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                runAt(active);
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              } else if (e.key === "Tab") {
                e.preventDefault();
              }
            }}
          />
          <kbd className="palette-esc" aria-hidden>
            esc
          </kbd>
        </div>
        <div className="palette-list" id={`${id}-list`} role="listbox" aria-label="Results" ref={list}>
          {flat.length ? (
            results.map((g) => (
              <div key={g.group} role="group" aria-labelledby={`${id}-${g.group}`}>
                <div className="palette-group" id={`${id}-${g.group}`} role="presentation">
                  {g.group}
                </div>
                {g.items.map((cmd) => {
                  index++;
                  const i = index;
                  return (
                    <div
                      key={cmd.id}
                      id={`${id}-opt-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      className={cx("palette-item", i === active && "active")}
                      onMouseMove={() => i !== active && setActive(i)}
                      onClick={() => runAt(i)}
                    >
                      <span className="palette-icon" aria-hidden>
                        {cmd.icon}
                      </span>
                      <span className="palette-label">{cmd.label}</span>
                      {cmd.keys && (
                        <kbd className="palette-keys" aria-hidden>
                          {cmd.keys}
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="palette-empty" role="status">
              <strong>No match for “{query.trim()}”</strong>
              <span>Try “start”, “tasks”, “rain” or a task's name.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
