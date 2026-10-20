import { ChevronRight, FileJson, FileSpreadsheet, Monitor, Moon, Play, ShieldCheck, Sun, Trash2, Volume1, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Buddy } from "../components/Buddy";
import { PageTitle, Segmented, Slider, Stepper, Switch, cx } from "../components/ui";
import { soundEngine } from "../lib/audio/engine";
import { backend, isNative } from "../lib/backend";
import { confirmDialog } from "../lib/dialogs";
import { useQuery } from "../lib/hooks";
import { isMac, isMobileOS, os, shortcutLabel } from "../lib/platform";
import { useApp } from "../lib/store";
import { fmtDuration, fmtShortDay, fmtTime } from "../lib/time";
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

const SHORTCUTS = ["CommandOrControl+Shift+Space", "CommandOrControl+Shift+F", "CommandOrControl+Alt+P", ""];

// ------------------------------------------------------------------ Building blocks

/** A titled group: section title outside, rows inside one white card, optional footnote. */
function Group({ id, title, foot, children }: { id: string; title: string; foot?: ReactNode; children: ReactNode }) {
  return (
    <section className="set-group" aria-labelledby={`set-${id}`}>
      <h2 className="section-title" id={`set-${id}`}>
        {title}
      </h2>
      <div className="card set-card">{children}</div>
      {foot && <p className="set-foot">{foot}</p>}
    </section>
  );
}

/**
 * One settings row: label (+ an optional line only where behaviour needs explaining), control on the right.
 * Controls stay inline on phones too; only `wide` ones (segmented, slider) drop onto their own line.
 * `below` content always sits under the text.
 */
function Row({
  label,
  desc,
  children,
  below,
  wide,
}: {
  label: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
  below?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cx("set-row", wide && "wide", below !== undefined && "has-below")}>
      <div className="set-text">
        <div className="set-label">{label}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      {children && <div className="set-control">{children}</div>}
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

  useEffect(() => {
    backend.autostartEnabled().then(setAutostart).catch(() => setAutostart(null));
  }, []);

  const paused = !!tracker?.pausedUntil && tracker.pausedUntil > Date.now();

  return (
    <div className="settings">
      <PageTitle strong="Settings," dim="make it yours." />

      <div className="set-top">
        <ProfileCard />
        <PrivacyCard info={info} />
      </div>

      <div className="set-cols">
        <div className="set-col">
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

          <Group id="goals" title="Goals">
            <Row label="Daily focus goal">
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
          </Group>

          <Group id="system" title="Appearance & system">
            <Row label="Theme" wide>
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
            {desktop && isNative && (
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
              <Row label="Global shortcut" desc="Start or pause from any app.">
                <select className="select" value={s.globalShortcut} onChange={(e) => update({ globalShortcut: e.target.value })} aria-label="Global shortcut">
                  {SHORTCUTS.map((a) => (
                    <option key={a} value={a}>
                      {a ? shortcutLabel(a) : "Off"}
                    </option>
                  ))}
                </select>
              </Row>
            )}
          </Group>
        </div>

        <div className="set-col">
          <Group
            id="tracking"
            title="Activity tracking"
            foot={
              isMobileOS
                ? os === "ios"
                  ? "iOS doesn't let apps read other apps' usage, so on iPhone Kairo tracks your focus blocks only."
                  : "Android shares per-app usage with Kairo once you grant Usage access. It's read on-device only."
                : "Kairo checks which app is in front about once a second. Idle time is skipped."
            }
          >
            <Row label="Track app & website time">
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
              <Row label="Idle after" desc="Stop counting when you step away.">
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

          <Group id="nudges" title="Notifications & nudges">
            <Row label="Notifications">
              <Switch label="Notifications" checked={s.notificationsEnabled} onChange={(v) => update({ notificationsEnabled: v })} />
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
            {desktop && s.nudgesEnabled && (
              <>
                <Row label="Nudge to focus after" desc="Time on distracting apps.">
                  <Stepper label="distraction nudge" value={s.nudgeDistractionMinutes} onChange={(v) => update({ nudgeDistractionMinutes: v })} min={5} max={60} step={5} format={mins} />
                </Row>
                <Row label="Suggest a break after" desc="Time working without a pause.">
                  <Stepper label="break reminder" value={s.nudgeBreakMinutes} onChange={(v) => update({ nudgeBreakMinutes: v })} min={30} max={240} step={15} format={hm} />
                </Row>
              </>
            )}
          </Group>

          <DataGroup info={info} />
        </div>
      </div>

      <footer className="set-footer">
        <Buddy mood="sleep" size={40} />
        <span>
          Kairo 0.1.0 · Made for deep work · {isNative ? `${os} app` : "Browser preview"}
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
    <section className="card set-profile" aria-labelledby="set-profile-title">
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
        <p className="set-profile-note">Only used for greetings. It stays on this device.</p>
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

  const mb = info ? (info.dbBytes / 1024 / 1024).toFixed(1) : null;

  return (
    <section className="card hero set-privacy" aria-labelledby="set-privacy-title">
      <ShieldCheck className="set-privacy-mark" aria-hidden />

      <span className="set-privacy-shield" aria-hidden>
        <ShieldCheck />
      </span>

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
          <button className="btn btn-on-brand btn-sm" onClick={() => void exportAs("json")} aria-label="Export everything as JSON">
            <FileJson /> JSON
          </button>
          <button className="btn btn-on-brand btn-sm" onClick={() => void exportAs("csv")} aria-label="Export everything as CSV">
            <FileSpreadsheet /> CSV
          </button>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Your data (retention, location, delete)

function DataGroup({ info }: { info: DataInfo | undefined }) {
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
      <Row label="Stored at" desc={<span className="set-path" title={info?.dbPath}>{info?.dbPath ?? "…"}</span>} />
      <Row label="Delete all data" desc="Erases activity, focus history, tasks and rules. Settings stay.">
        <button className="btn btn-danger btn-sm" onClick={() => void wipe()}>
          <Trash2 aria-hidden /> Delete
        </button>
      </Row>
    </Group>
  );
}

// ------------------------------------------------------------------ Chime (moved here from Sounds)

function ChimeRows() {
  const sound = useApp((st) => st.settings.sound!);
  const updateSound = useApp((st) => st.updateSound);
  const preview = (kind: ChimeId = sound.chime, volume = sound.chimeVolume) => void soundEngine.chime(kind, volume);

  return (
    <>
      <Row
        label="Chime"
        below={
          <Segmented<ChimeId>
            label="Chime sound"
            value={sound.chime}
            onChange={(chime) => {
              updateSound({ chime });
              preview(chime);
            }}
            options={CHIMES}
          />
        }
      />
      {sound.chime !== "none" && (
        <Row label="Chime volume" wide>
          <div className="set-volume">
            <Volume1 aria-hidden className="set-volume-icon" />
            <Slider label="Chime volume" value={sound.chimeVolume} onChange={(v) => updateSound({ chimeVolume: v })} />
            <button className="btn btn-soft btn-sm" onClick={() => preview()} disabled={sound.chimeVolume <= 0}>
              <Play className="fill" /> Test
            </button>
          </div>
        </Row>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Excluded apps

function ExcludedApps() {
  const excluded = useApp((st) => st.settings.excludedApps);
  const update = useApp((st) => st.updateSettings);
  const setView = useApp((st) => st.setView);
  return (
    <Row
      label="Excluded apps"
      desc={excluded.length ? "Kairo never records these." : "None yet. Exclude apps from Apps & Sites."}
      below={
        excluded.length ? (
          <div className="set-chips">
            {excluded.map((a) => (
              <span key={a} className="chip set-chip">
                {a}
                <button aria-label={`Track ${a} again`} title="Track again" onClick={() => update({ excludedApps: excluded.filter((x) => x !== a) })}>
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
