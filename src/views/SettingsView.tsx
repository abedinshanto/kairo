import {
  ArchiveRestore,
  ChevronRight,
  DatabaseBackup,
  FileJson,
  FileSpreadsheet,
  Monitor,
  Moon,
  Play,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  Volume1,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Buddy } from "../components/Buddy";
import { Avatar, PageTitle, Segmented, Slider, Stepper, Switch, TopBar, cx } from "../components/ui";
import { soundEngine } from "../lib/audio/engine";
import { backend, isNative } from "../lib/backend";
import { CATEGORIES, categoryLabel, entityName } from "../lib/categories";
import { categoryIcon } from "../lib/categoryIcons";
import { confirmDialog } from "../lib/dialogs";
import { useMediaQuery, useQuery } from "../lib/hooks";
import { isMac, isMobileOS, os, shortcutLabel } from "../lib/platform";
import { useApp } from "../lib/store";
import { fmtDay, fmtDuration, fmtShortDay, fmtTime } from "../lib/time";
import type { ChimeId, DataInfo, ThemePref } from "../lib/types";
import "../styles/views/settings.css";

const mins = (v: number) => `${v} min`;
const hm = (v: number) => fmtDuration(v * 60_000);

const CHIMES: { value: ChimeId; label: string }[] = [
  { value: "bell", label: "Bell" },
  { value: "soft", label: "Soft" },
  { value: "digital", label: "Digital" },
  { value: "none", label: "None" },
];

const RETENTION: { value: number; label: string }[] = [
  { value: 0, label: "Forever" },
  { value: 365, label: "1 year" },
  { value: 180, label: "6 months" },
  { value: 90, label: "90 days" },
  { value: 30, label: "30 days" },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CAPTURE_SHORTCUTS = ["CommandOrControl+Alt+K", "CommandOrControl+Shift+K", "CommandOrControl+Alt+Space", ""];

const SHORTCUTS = ["CommandOrControl+Shift+Space", "CommandOrControl+Shift+F", "CommandOrControl+Alt+P", ""];

// ------------------------------------------------------------------ Building blocks

/** A titled group: section title outside, rows inside one white card. */
function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="set-group" aria-labelledby={`set-${id}`}>
      <h2 className="section-title" id={`set-${id}`}>
        {title}
      </h2>
      <div className="card set-card">{children}</div>
    </section>
  );
}

/**
 * One settings row: label (+ an optional line only where behaviour needs explaining), control on the right.
 * Controls stay inline on phones too; only `wide` ones (segmented, slider) drop onto their own line.
 * `below` content always sits under the text. `off` dims the row and disables its control
 * (rows that depend on a switch stay in place, so the page doesn't jump).
 */
/** Minutes after midnight as "HH:MM" for a time input. */
const clockTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function Row({
  label,
  desc,
  children,
  below,
  wide,
  off,
  keywords,
}: {
  label: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
  below?: ReactNode;
  wide?: boolean;
  off?: boolean;
  /** Other words people might search for this by. */
  keywords?: string;
}) {
  return (
    <div className={cx("set-row", wide && "wide", below !== undefined && "has-below", off && "is-off")} data-keywords={keywords}>
      <div className="set-text">
        <div className="set-label">{label}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      {children && (
        <fieldset className="set-control" disabled={off}>
          {children}
        </fieldset>
      )}
      {below !== undefined && <div className="set-below">{below}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ View

export function SettingsView() {
  const s = useApp((st) => st.settings);
  const update = useApp((st) => st.updateSettings);
  const tracker = useApp((st) => st.tracker);
  const pauseTracking = useApp((st) => st.pauseTracking);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const { data: info } = useQuery(() => backend.dataInfo(), []);
  const desktop = !isMobileOS;
  // Resolve the theme from settings (not the DOM, which updates after render).
  const prefersLight = useMediaQuery("(prefers-color-scheme: light)");
  const pref = s.theme ?? "light";
  const theme = pref === "system" ? (prefersLight ? "light" : "dark") : pref;

  useEffect(() => {
    backend.autostartEnabled().then(setAutostart).catch(() => setAutostart(null));
  }, []);

  const paused = !!tracker?.pausedUntil && tracker.pausedUntil > Date.now();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<number | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // Search: rows whose name, line or keywords match stay; a group whose title matches stays whole.
  useLayoutEffect(() => {
    const el = page.current;
    if (!el) return;
    const q = query.trim().toLowerCase();
    const has = (node: Element | null | undefined, extra = "") => !!node && `${node.textContent ?? ""} ${extra}`.toLowerCase().includes(q);
    let count = 0;
    el.querySelectorAll<HTMLElement>(".set-group").forEach((group) => {
      const whole = !!q && has(group.querySelector(".section-title"));
      let shown = 0;
      group.querySelectorAll<HTMLElement>(".set-row").forEach((row) => {
        const hit = !q || whole || has(row.querySelector(".set-text"), row.dataset.keywords);
        row.hidden = !hit;
        if (hit) shown++;
      });
      group.hidden = !!q && !shown;
      if (q) count += shown;
    });
    el.querySelectorAll<HTMLElement>(".set-top > *").forEach((card) => {
      const hit = !q || has(card, card.dataset.keywords);
      card.hidden = !hit;
      if (hit && q) count++;
    });
    setFound(q ? count : null);
  });

  // "/" or ⌘F / Ctrl+F jumps to the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.closest("input, textarea, select") || e.target.isContentEditable);
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "f" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        search.current?.focus();
        search.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="settings" ref={page}>
      <TopBar
        left={
          <>
            <span className="buddy-avatar set-topmark" aria-hidden>
              <SettingsIcon />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="who-name">Kairo</div>
              <div className="who-sub">Timer, tracking and appearance</div>
            </div>
          </>
        }
        right={
          <button
            className="circle-btn"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title="Theme"
            onClick={() => update({ theme: theme === "dark" ? "light" : "dark" })}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </button>
        }
      />
      <PageTitle strong="Settings," dim="make it yours." />

      <div className="input-wrap set-search">
        <Search aria-hidden />
        <input
          ref={search}
          className="input pill"
          type="search"
          placeholder="Search settings"
          aria-label="Search settings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        />
        {query && (
          <button className="circle-btn sm ghost set-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            <X />
          </button>
        )}
      </div>
      {found === 0 && (
        <div className="card set-nothing">
          <Buddy mood="idle" size={64} />
          <div>
            <strong>Nothing matches “{query.trim()}”</strong>
            <span>Try another word, like “sound”, “backup” or “shortcut”.</span>
          </div>
        </div>
      )}

      <div className="set-top">
        <ProfileCard />
        <PrivacyCard info={info} />
      </div>

      {/* Groups pair up row by row (timer | nudges, tracking | system, goals | data),
          so headings line up and each pair of cards ends together. */}
      <div className={cx("set-cols", !desktop && "loose")}>
        <Group id="timer" title="Focus timer">
          <Row label="Focus block">
            <Stepper label="focus minutes" value={s.focusMinutes} onChange={(v) => update({ focusMinutes: v })} min={5} max={120} step={5} format={mins} />
          </Row>
          <Row label="Short break">
            <Stepper label="short break minutes" value={s.shortBreakMinutes} onChange={(v) => update({ shortBreakMinutes: v })} min={1} max={30} format={mins} />
          </Row>
          <Row label="Long break">
            <Stepper label="long break minutes" value={s.longBreakMinutes} onChange={(v) => update({ longBreakMinutes: v })} min={5} max={60} step={5} format={mins} />
          </Row>
          <Row label="Long break after">
            <Stepper
              label="blocks before long break"
              value={s.longBreakEvery}
              onChange={(v) => update({ longBreakEvery: v })}
              min={2}
              max={8}
              format={(v) => `${v} blocks`}
            />
          </Row>
          <Row label="Start breaks automatically">
            <Switch label="Start breaks automatically" checked={s.autoStartBreaks} onChange={(v) => update({ autoStartBreaks: v })} />
          </Row>
          <Row label="Start focus after breaks">
            <Switch label="Start focus automatically after breaks" checked={s.autoStartFocus} onChange={(v) => update({ autoStartFocus: v })} />
          </Row>
          <ChimeRows />
        </Group>

        <Group id="nudges" title="Notifications & nudges">
          <Row label="Notifications" keywords="alerts">
            <Switch label="Notifications" checked={s.notificationsEnabled} onChange={(v) => update({ notificationsEnabled: v })} />
          </Row>
          <Row label="Daily summary" desc="What you got done and where the time went, once a day.">
            <Switch label="Daily summary" checked={s.dailySummary} onChange={(v) => update({ dailySummary: v })} />
          </Row>
          <Row label="Summary time" desc="Pick the end of your working day." off={!s.dailySummary}>
            <input
              className="input pill set-time"
              type="time"
              aria-label="Summary time"
              value={clockTime(s.dailySummaryMinutes)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                if (Number.isFinite(h) && Number.isFinite(m)) update({ dailySummaryMinutes: h * 60 + m });
              }}
            />
          </Row>
          <Row label="Weekly review" desc="Your week at a glance, and a moment to plan the next.">
            <Switch label="Weekly review" checked={s.weeklyReview} onChange={(v) => update({ weeklyReview: v })} />
          </Row>
          <Row label="Review day" desc="At your summary time." off={!s.weeklyReview}>
            <select className="select" value={s.weeklyReviewDay} onChange={(e) => update({ weeklyReviewDay: Number(e.target.value) })} aria-label="Weekly review day">
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Row>
          {desktop && (
            <Row label="Focus guard" desc="A nudge if you drift mid-block.">
              <Switch label="Focus guard" checked={s.focusGuard} onChange={(v) => update({ focusGuard: v })} />
            </Row>
          )}
          {desktop && (
            <Row label="Smart nudges">
              <Switch label="Smart nudges" checked={s.nudgesEnabled} onChange={(v) => update({ nudgesEnabled: v })} />
            </Row>
          )}
          {desktop && (
            <>
              <Row label="Nudge to focus after" desc="Time on distracting apps." off={!s.nudgesEnabled}>
                <Stepper label="distraction nudge" value={s.nudgeDistractionMinutes} onChange={(v) => update({ nudgeDistractionMinutes: v })} min={5} max={60} step={5} format={mins} />
              </Row>
              <Row label="Suggest a break after" desc="Time working without a pause." off={!s.nudgesEnabled}>
                <Stepper label="break reminder" value={s.nudgeBreakMinutes} onChange={(v) => update({ nudgeBreakMinutes: v })} min={30} max={240} step={15} format={hm} />
              </Row>
            </>
          )}
        </Group>

        <Group id="tracking" title="Activity tracking">
          <Row
            label="Track app & website time"
            desc={
              isMobileOS
                ? os === "ios"
                  ? "iOS keeps other apps' usage private, so Kairo tracks focus blocks only."
                  : "Read on this device only, once you grant Usage access."
                : "Checks the app in front about once a second. Idle time is skipped."
            }
          >
            <Switch label="Track app and website time" checked={s.trackingEnabled} onChange={(v) => update({ trackingEnabled: v })} disabled={!tracker?.supported} />
          </Row>
          {os === "android" && isNative && (
            <Row label="Usage access" desc={tracker?.needsPermission ? "Needed to see which apps you use." : "Granted. Thank you!"}>
              <button className="btn btn-soft btn-sm" onClick={() => void backend.usagePermissionRequest()}>
                {tracker?.needsPermission ? "Grant access" : "Open settings"}
              </button>
            </Row>
          )}
          {desktop && (
            <Row label="Pause tracking" desc={paused ? `Paused until ${fmtTime(tracker!.pausedUntil!)}` : undefined}>
              {paused ? (
                <button className="btn btn-soft btn-sm" onClick={() => void pauseTracking(null)}>
                  Resume now
                </button>
              ) : (
                <div className="set-btns">
                  <button className="btn btn-soft btn-sm" onClick={() => void pauseTracking(30)}>
                    30 min
                  </button>
                  <button className="btn btn-soft btn-sm" onClick={() => void pauseTracking(60)}>
                    1 hour
                  </button>
                </div>
              )}
            </Row>
          )}
          {desktop && (
            <Row label="Idle after" desc="Stop counting when you step away. Videos and calls keep counting." keywords="away afk inactive">
              <select className="select" value={s.idleThresholdSeconds} onChange={(e) => update({ idleThresholdSeconds: Number(e.target.value) })} aria-label="Idle threshold">
                {[60, 120, 180, 300, 600, 900].map((v) => (
                  <option key={v} value={v}>
                    {v / 60} min
                  </option>
                ))}
              </select>
            </Row>
          )}
          {desktop && isMac && (
            <Row label="Read website from browser" desc="Safari, Chrome, Arc, Edge, Brave. Domain only.">
              <Switch label="Read website from browser" checked={s.trackBrowserUrls} onChange={(v) => update({ trackBrowserUrls: v })} />
            </Row>
          )}
          {desktop && (
            <Row label="Store window titles" desc="Off by default. Titles can be private.">
              <Switch label="Store window titles" checked={s.storeWindowTitles} onChange={(v) => update({ storeWindowTitles: v })} />
            </Row>
          )}
          <ExcludedApps />
        </Group>

        <Group id="system" title="Appearance & system">
          <Row label="Theme" wide keywords="dark light mode appearance colour color">
            <Segmented<ThemePref>
              label="Theme"
              value={s.theme ?? "light"}
              onChange={(theme) => update({ theme })}
              options={[
                { value: "light", label: <><Sun aria-hidden /> Light</> },
                { value: "dark", label: <><Moon aria-hidden /> Dark</> },
                { value: "system", label: <><Monitor aria-hidden /> System</> },
              ]}
            />
          </Row>
          {desktop && autostart !== null && (
            <Row label="Open at login" desc={`Starts quietly in the ${isMac ? "menu bar" : "tray"}.`}>
              <Switch
                label="Open at login"
                checked={autostart}
                onChange={async (v) => {
                  await backend.setAutostart(v);
                  setAutostart(await backend.autostartEnabled());
                }}
              />
            </Row>
          )}
          {desktop && (
            <Row label={isMac ? "Timer in menu bar" : "Timer in tray tooltip"}>
              <Switch label={isMac ? "Show timer in menu bar" : "Show timer in tray"} checked={s.showTimerInTray} onChange={(v) => update({ showTimerInTray: v })} />
            </Row>
          )}
          {isMac && isNative && (
            <Row label="Hide Dock icon" desc="Kairo stays in the menu bar.">
              <Switch label="Hide Dock icon" checked={s.hideDockIcon} onChange={(v) => update({ hideDockIcon: v })} />
            </Row>
          )}
          {desktop && (
            <Row label="Download site icons" desc="Only for sites your browser has no icon for. Nothing else goes online." keywords="favicon network internet">
              <Switch label="Download site icons" checked={s.downloadSiteIcons} onChange={(v) => update({ downloadSiteIcons: v })} />
            </Row>
          )}
          {desktop && <UpdateRow />}
          {desktop && (
            <Row label="Global shortcut" desc="Start or pause from any app." keywords="keyboard hotkey">
              <select className="select" value={s.globalShortcut} onChange={(e) => update({ globalShortcut: e.target.value })} aria-label="Global shortcut">
                {SHORTCUTS.map((a) => (
                  <option key={a} value={a}>
                    {a ? shortcutLabel(a) : "Off"}
                  </option>
                ))}
              </select>
            </Row>
          )}
          {desktop && (
            <Row label="Quick capture" desc="Add a task or set your focus from any app. Press it twice to talk." keywords="keyboard hotkey shortcut add task dictate">
              <select className="select" value={s.captureShortcut} onChange={(e) => update({ captureShortcut: e.target.value })} aria-label="Quick capture shortcut">
                {CAPTURE_SHORTCUTS.filter((a) => !a || a !== s.globalShortcut).map((a) => (
                  <option key={a} value={a}>
                    {a ? shortcutLabel(a) : "Off"}
                  </option>
                ))}
              </select>
            </Row>
          )}
        </Group>

        <Group id="goals" title="Goals">
          <Row label="Daily focus goal" keywords="target">
            <Stepper label="daily focus goal" value={s.dailyFocusGoalMinutes} onChange={(v) => update({ dailyFocusGoalMinutes: v })} min={30} max={600} step={30} format={hm} />
          </Row>
          <Row label="Distraction budget" desc="A daily allowance for distracting apps.">
            <Stepper
              label="distraction budget"
              value={s.distractionBudgetMinutes}
              onChange={(v) => update({ distractionBudgetMinutes: v })}
              min={0}
              max={300}
              step={15}
              format={(v) => (v ? hm(v) : "Off")}
            />
          </Row>
          <CategoryLimits />
        </Group>

        <DataGroup />
      </div>

      <footer className="set-footer">
        <Buddy mood="sleep" size={40} />
        <span>
          Kairo {__APP_VERSION__} · Made for deep work · {isNative ? `${os} app` : "Browser preview"}
        </span>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ Profile

function ProfileCard() {
  const name = useApp((st) => st.settings.name ?? "");
  const update = useApp((st) => st.updateSettings);
  const clean = name.trim();
  return (
    <section className="card set-profile" aria-labelledby="set-profile-title" data-keywords="name profile greeting">
      <div className="set-kai">
        <Buddy mood={clean ? "happy" : "idle"} size={108} />
      </div>
      <div className="set-profile-text">
        <h2 className="title" id="set-profile-title">
          {clean ? `Hi ${clean}!` : "Hi there!"}
        </h2>
        <label className="set-profile-q" htmlFor="set-name">
          What should Kai call you?
        </label>
        <input
          id="set-name"
          className="input pill set-name"
          placeholder="Your name"
          autoComplete="given-name"
          maxLength={32}
          value={name}
          onChange={(e) => update({ name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <p className="set-profile-note">Only used for greetings.</p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Privacy hero

function PrivacyCard({ info }: { info: DataInfo | undefined }) {
  const toast = useApp((st) => st.toast);

  const exportAs = async (format: "json" | "csv") => {
    if (await backend.exportData(format)) toast({ title: "Export saved", tone: "success" });
  };

  // Bring in an export from another computer (or an older copy): anything already here is skipped.
  const importFile = async () => {
    try {
      const added = await backend.importData();
      if (!added) return;
      useApp.getState().bumpData();
      const parts = [
        added.activity && `${added.activity.toLocaleString()} activities`,
        added.sessions && `${added.sessions.toLocaleString()} focus blocks`,
        added.tasks && `${added.tasks.toLocaleString()} tasks`,
        added.rules && `${added.rules.toLocaleString()} rules`,
      ].filter(Boolean);
      toast({ title: "Import done", body: parts.length ? `Added ${parts.join(", ")}.` : "Everything in it was already here.", tone: "success" });
    } catch (err) {
      toast({ title: "Couldn't import that file", body: String(err), tone: "warning" });
    }
  };

  const mb = info ? (info.dbBytes / 1024 / 1024).toFixed(1) : null;

  return (
    <section className="card tint set-privacy" aria-labelledby="set-privacy-title" data-keywords="export import json csv data privacy storage">
      <ShieldCheck className="set-privacy-mark" aria-hidden />

      <div className="set-privacy-copy">
        <h2 id="set-privacy-title">Your data never leaves this device</h2>
        <p>No account, no cloud, no analytics.</p>
      </div>

      <dl className="set-facts">
        <div>
          <dt>Activities</dt>
          <dd>{info ? info.spans.toLocaleString() : "…"}</dd>
        </div>
        <div>
          <dt>Focus blocks</dt>
          <dd>{info ? info.sessions.toLocaleString() : "…"}</dd>
        </div>
        <div>
          <dt>{info?.firstActivity ? `Since ${fmtShortDay(info.firstActivity)}` : "On disk"}</dt>
          <dd>
            {mb ?? "…"}
            {mb && <small>MB</small>}
          </dd>
        </div>
      </dl>

      <div className="set-privacy-bar">
        <div className="set-export">
          <span className="set-export-label">Export</span>
          <button className="btn btn-soft btn-sm" onClick={() => void exportAs("json")} aria-label="Export everything as JSON">
            <FileJson /> JSON
          </button>
          <button className="btn btn-soft btn-sm" onClick={() => void exportAs("csv")} aria-label="Export everything as CSV">
            <FileSpreadsheet /> CSV
          </button>
        </div>
        {!isMobileOS && (
          <button className="btn btn-soft btn-sm" onClick={() => void importFile()} title="Merge a Kairo JSON export into this device">
            <Upload /> Import
          </button>
        )}
      </div>

      <p className="set-stored">
        Stored at <span className="set-path" title={info?.dbPath}>{info?.dbPath ?? "…"}</span>
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ Your data (retention, location, delete)

function DataGroup() {
  const retention = useApp((st) => st.settings.retentionDays);
  const update = useApp((st) => st.updateSettings);
  const toast = useApp((st) => st.toast);

  const wipe = async () => {
    const ok = await confirmDialog("Permanently delete all tracked activity, focus history, tasks and rules from this device? This can't be undone.", {
      title: "Delete all data",
      okLabel: "Delete everything",
      destructive: true,
    });
    if (!ok) return;
    await backend.wipeData();
    toast({ title: "All data deleted", tone: "success" });
  };

  return (
    <Group id="data" title="Your data">
      <Row label="Keep history" desc="Older activity is deleted automatically.">
        <select className="select" value={retention} onChange={(e) => update({ retentionDays: Number(e.target.value) })} aria-label="Keep history for">
          {RETENTION.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Row>
      {!isMobileOS && <Backups />}
      <Row label="Delete all data" desc="Erases activity, focus history, tasks and rules. Settings stay." keywords="wipe erase reset">
        <button className="btn btn-danger btn-sm" onClick={() => void wipe()}>
          <Trash2 aria-hidden /> Delete
        </button>
      </Row>
    </Group>
  );
}

// ------------------------------------------------------------------ Limits per category

/** "Social media ≤ 30 min a day": a heads-up near the limit, and its progress in Stats. */
function CategoryLimits() {
  const limits = useApp((st) => st.settings.categoryLimits);
  const update = useApp((st) => st.updateSettings);
  const set = (id: string, minutes: number | null) => {
    const next = { ...limits };
    if (minutes === null) delete next[id];
    else next[id] = minutes;
    update({ categoryLimits: next });
  };
  const limited = CATEGORIES.filter((c) => limits[c.id] !== undefined);
  const free = CATEGORIES.filter((c) => limits[c.id] === undefined);
  return (
    <Row
      label="Limits per category"
      desc={limited.length ? "A heads-up as you near each one." : "e.g. Social media 30 min a day. Kairo gives you a heads-up near it."}
      below={
        limited.length ? (
          <ul className="set-limits">
            {limited.map((c) => (
              <li key={c.id} className="set-limit">
                <Avatar name={c.label} productivity={c.productivity} size={32} glyph={categoryIcon(c.id)} />
                <span className="set-limit-name">{c.label}</span>
                <Stepper label={`${c.label} limit`} value={limits[c.id]} onChange={(v) => set(c.id, v)} min={5} max={600} step={5} format={hm} />
                <button className="circle-btn sm ghost" aria-label={`Remove the ${c.label} limit`} title="Remove" onClick={() => set(c.id, null)}>
                  <X />
                </button>
              </li>
            ))}
          </ul>
        ) : undefined
      }
    >
      <select
        className="select"
        value=""
        aria-label="Add a limit for a category"
        onChange={(e) => {
          const id = e.target.value;
          if (id) set(id, CATEGORIES.find((c) => c.id === id)!.productivity < 0 ? 30 : 60);
        }}
        disabled={!free.length}
      >
        <option value="">Add a limit</option>
        {free.map((c) => (
          <option key={c.id} value={c.id}>
            {categoryLabel(c.id)}
          </option>
        ))}
      </select>
    </Row>
  );
}

// ------------------------------------------------------------------ Updates

/** Off by default: Kairo only asks GitHub about new versions when you say so. */
function UpdateRow() {
  const on = useApp((st) => st.settings.checkUpdates);
  const update = useApp((st) => st.update);
  const updateSettings = useApp((st) => st.updateSettings);
  const toast = useApp((st) => st.toast);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      const found = await backend.updateCheck();
      if (found) useApp.setState({ update: found });
      else toast({ title: "You're up to date", body: `Kairo ${__APP_VERSION__} is the latest.`, tone: "success" });
    } catch (err) {
      toast({ title: "Couldn't check", body: String(err), tone: "warning" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Row
      label="Check for updates"
      desc={update ? `Kairo ${update.version} is out.` : "Once a day, asks GitHub for the latest version. Nothing about you is sent."}
      keywords="update version upgrade release new"
      below={
        on || update ? (
          <div className="set-btns">
            {update ? (
              <button className="btn btn-primary btn-sm" onClick={() => void backend.updateOpen()}>
                Get Kairo {update.version}
              </button>
            ) : (
              <button className="btn btn-soft btn-sm" disabled={checking} onClick={() => void check()}>
                {checking ? "Checking…" : "Check now"}
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      <Switch label="Check for updates" checked={on} onChange={(v) => updateSettings({ checkUpdates: v })} />
    </Row>
  );
}

// ------------------------------------------------------------------ Backups

const fmtSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Weekly copies of the database on this device, the last four kept; any can be put back. */
function Backups() {
  const enabled = useApp((st) => st.settings.backups);
  const update = useApp((st) => st.updateSettings);
  const toast = useApp((st) => st.toast);
  const [busy, setBusy] = useState(false);
  const { data: list } = useQuery(() => backend.backupsList(), []);

  const now = async () => {
    setBusy(true);
    try {
      const b = await backend.backupNow();
      toast({ title: "Backed up", body: `${fmtSize(b.bytes)}, kept on this device.`, tone: "success" });
      useApp.getState().bumpData();
    } catch (err) {
      toast({ title: "Couldn't back up", body: String(err), tone: "warning" });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (name: string, at: number) => {
    const ok = await confirmDialog(`Put back your data as it was on ${fmtDay(at)}? Anything since then is set aside (Kairo keeps a copy), and Kairo restarts.`, {
      title: "Restore backup",
      okLabel: "Restore",
      destructive: true,
    });
    if (!ok) return;
    try {
      await backend.backupRestore(name);
    } catch (err) {
      toast({ title: "Couldn't restore", body: String(err), tone: "warning" });
    }
  };

  return (
    <>
      <Row label="Weekly backups" desc="A copy of everything each week, on this device. The last 4 are kept.">
        <Switch label="Weekly backups" checked={enabled} onChange={(v) => update({ backups: v })} />
      </Row>
      <Row
        label="Backups"
        desc={list?.length ? `Last one ${fmtShortDay(list[0].at)}.` : "None yet."}
        below={
          list?.length ? (
            <ul className="set-backups">
              {list.map((b) => (
                <li key={b.name}>
                  <DatabaseBackup aria-hidden />
                  <span className="set-backup-when">{fmtDay(b.at)}</span>
                  <span className="set-backup-size">{fmtSize(b.bytes)}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => void restore(b.name, b.at)} title="Put this copy back">
                    <ArchiveRestore /> Restore
                  </button>
                </li>
              ))}
            </ul>
          ) : undefined
        }
      >
        <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => void now()}>
          Back up now
        </button>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------ Chime (moved here from Sounds)

function ChimeRows() {
  const sound = useApp((st) => st.settings.sound!);
  const updateSound = useApp((st) => st.updateSound);
  const preview = (kind: ChimeId = sound.chime, volume = sound.chimeVolume) => void soundEngine.chime(kind, volume);

  return (
    <>
      <Row label="Chime" wide keywords="sound bell alarm">
        <Segmented<ChimeId>
          label="Chime sound"
          value={sound.chime}
          onChange={(chime) => {
            updateSound({ chime });
            preview(chime);
          }}
          options={CHIMES}
        />
      </Row>
      <Row label="Chime volume" wide off={sound.chime === "none"}>
        <div className="set-volume">
          <Volume1 aria-hidden className="set-volume-icon" />
          <Slider label="Chime volume" value={sound.chimeVolume} onChange={(v) => updateSound({ chimeVolume: v })} />
          <button className="btn btn-soft btn-sm" onClick={() => preview()} disabled={sound.chimeVolume <= 0}>
            <Play className="fill" /> Test
          </button>
        </div>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------ Excluded apps

/** Excluded apps are stored by their lowercase id ("google chrome"); show them as names. */
const appLabel = (id: string) => id.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

function ExcludedApps() {
  const apps = useApp((st) => st.settings.excludedApps);
  const sites = useApp((st) => st.settings.excludedSites);
  const update = useApp((st) => st.updateSettings);
  const setView = useApp((st) => st.setView);
  const chips = [
    ...apps.map((a) => ({ key: `app:${a}`, label: appLabel(a), avatar: <Avatar name={appLabel(a)} productivity={0} size={20} iconKey={a} />, untrack: () => update({ excludedApps: apps.filter((x) => x !== a) }) })),
    ...sites.map((d) => {
      const label = entityName("site", d, d);
      return { key: `site:${d}`, label, avatar: <Avatar name={label} productivity={0} size={20} siteKey={d} />, untrack: () => update({ excludedSites: sites.filter((x) => x !== d) }) };
    }),
  ];
  return (
    <Row
      label="Excluded apps & sites"
      desc={chips.length ? "Kairo never records these." : "None yet. Tap any app or site in Stats to exclude it."}
      below={
        chips.length ? (
          <div className="set-chips">
            {chips.map((c) => (
              <span key={c.key} className="chip set-chip">
                {c.avatar}
                {c.label}
                <button aria-label={`Track ${c.label} again`} title="Track again" onClick={c.untrack}>
                  <X />
                </button>
              </span>
            ))}
          </div>
        ) : undefined
      }
    >
      <button className="circle-btn sm soft" aria-label="Open Apps & Sites" title="Apps & Sites" onClick={() => setView("apps")}>
        <ChevronRight />
      </button>
    </Row>
  );
}
