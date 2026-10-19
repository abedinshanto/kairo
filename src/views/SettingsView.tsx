import { Cpu, FileJson, FileSpreadsheet, HardDrive, Lock, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "../components/PageHeader";
import { Segmented, Stepper, Switch } from "../components/ui";
import { backend, isNative } from "../lib/backend";
import { confirmDialog } from "../lib/dialogs";
import { useQuery } from "../lib/hooks";
import { isMac, isMobileOS, os, shortcutLabel } from "../lib/platform";
import { useApp } from "../lib/store";
import { fmtDuration, fmtShortDay, fmtTime } from "../lib/time";
import type { ThemePref } from "../lib/types";

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <div className="settings-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          {title}
        </h2>
        {desc && <p className="faint settings-desc">{desc}</p>}
      </div>
      <div className="card">
        <div className="rows">{children}</div>
      </div>
    </section>
  );
}

function Row({ label, desc, children }: { label: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="row">
      <div style={{ minWidth: 0 }}>
        <div className="row-label">{label}</div>
        {desc && <div className="row-desc">{desc}</div>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

const mins = (v: number) => `${v} min`;

export function SettingsView() {
  const s = useApp((st) => st.settings);
  const update = useApp((st) => st.updateSettings);
  const tracker = useApp((st) => st.tracker);
  const pauseTracking = useApp((st) => st.pauseTracking);
  const toast = useApp((st) => st.toast);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const { data: info } = useQuery(() => backend.dataInfo(), []);
  const desktop = !isMobileOS;

  useEffect(() => {
    backend.autostartEnabled().then(setAutostart).catch(() => setAutostart(null));
  }, []);

  const paused = tracker?.pausedUntil && tracker.pausedUntil > Date.now();

  return (
    <div className="narrow">
      <PageHeader title="Settings" subtitle="Kairo works offline and keeps everything on this device." />

      <Section title="Focus timer">
        <Row label="Focus block" desc="Length of one focus block.">
          <Stepper label="focus minutes" value={s.focusMinutes} onChange={(v) => update({ focusMinutes: v })} min={5} max={120} step={5} format={mins} />
        </Row>
        <Row label="Short break">
          <Stepper label="short break minutes" value={s.shortBreakMinutes} onChange={(v) => update({ shortBreakMinutes: v })} min={1} max={30} format={mins} />
        </Row>
        <Row label="Long break">
          <Stepper label="long break minutes" value={s.longBreakMinutes} onChange={(v) => update({ longBreakMinutes: v })} min={5} max={60} step={5} format={mins} />
        </Row>
        <Row label="Long break after" desc="Number of focus blocks before a long break.">
          <Stepper label="blocks before long break" value={s.longBreakEvery} onChange={(v) => update({ longBreakEvery: v })} min={2} max={8} format={(v) => `${v} blocks`} />
        </Row>
        <Row label="Start breaks automatically">
          <Switch label="Start breaks automatically" checked={s.autoStartBreaks} onChange={(v) => update({ autoStartBreaks: v })} />
        </Row>
        <Row label="Start focus automatically after breaks">
          <Switch label="Start focus automatically" checked={s.autoStartFocus} onChange={(v) => update({ autoStartFocus: v })} />
        </Row>
      </Section>

      <Section title="Goals">
        <Row label="Daily focus goal" desc="Counts every focus block, finished or not. Used for streaks.">
          <Stepper label="daily focus goal" value={s.dailyFocusGoalMinutes} onChange={(v) => update({ dailyFocusGoalMinutes: v })} min={30} max={600} step={30} format={(v) => fmtDuration(v * 60_000)} />
        </Row>
        <Row label="Distraction budget" desc="Daily allowance for distracting apps and sites.">
          <Stepper label="distraction budget" value={s.distractionBudgetMinutes} onChange={(v) => update({ distractionBudgetMinutes: v })} min={0} max={300} step={15} format={(v) => (v ? fmtDuration(v * 60_000) : "Off")} />
        </Row>
      </Section>

      <Section
        title="Activity tracking"
        desc={
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
          <Row label="Usage access" desc={tracker?.needsPermission ? "Required to see which apps you use." : "Granted."}>
            <button className="btn btn-secondary btn-sm" onClick={() => void backend.usagePermissionRequest()}>
              {tracker?.needsPermission ? "Grant access" : "Open settings"}
            </button>
          </Row>
        )}
        {desktop && (
          <Row label="Pause tracking" desc={paused ? `Paused until ${fmtTime(tracker!.pausedUntil!)}` : "Take a private moment. The timer keeps working."}>
            {paused ? (
              <button className="btn btn-secondary btn-sm" onClick={() => void pauseTracking(null)}>
                Resume now
              </button>
            ) : (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => void pauseTracking(30)}>
                  30 min
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => void pauseTracking(60)}>
                  1 hour
                </button>
              </>
            )}
          </Row>
        )}
        {desktop && (
          <Row label="Idle after" desc="Stop counting when there's no keyboard or mouse input for this long.">
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
          <Row label="Read exact website from browser" desc="Asks macOS for permission to read the front tab's address in Safari, Chrome, Arc, Edge and Brave. Only the domain is stored.">
            <Switch label="Read website from browser" checked={s.trackBrowserUrls} onChange={(v) => update({ trackBrowserUrls: v })} />
          </Row>
        )}
        {desktop && (
          <Row label="Store window titles" desc="Off by default. Titles can contain document names and other private details.">
            <Switch label="Store window titles" checked={s.storeWindowTitles} onChange={(v) => update({ storeWindowTitles: v })} />
          </Row>
        )}
        <Row
          label="Excluded apps"
          desc={
            s.excludedApps.length ? (
              <span className="chips">
                {s.excludedApps.map((a) => (
                  <span key={a} className="chip-tag">
                    {a}
                    <button aria-label={`Track ${a} again`} onClick={() => update({ excludedApps: s.excludedApps.filter((x) => x !== a) })}>
                      <X />
                    </button>
                  </span>
                ))}
              </span>
            ) : (
              "Never recorded. Exclude apps from the Apps & Sites list."
            )
          }
        >
          <span />
        </Row>
      </Section>

      <Section title="Notifications & nudges">
        <Row label="Notifications" desc="Phase changes and goal milestones.">
          <Switch label="Notifications" checked={s.notificationsEnabled} onChange={(v) => update({ notificationsEnabled: v })} />
        </Row>
        {desktop && (
          <Row label="Focus guard" desc="A gentle nudge when you drift to a distracting app during a focus block.">
            <Switch label="Focus guard" checked={s.focusGuard} onChange={(v) => update({ focusGuard: v })} />
          </Row>
        )}
        {desktop && (
          <Row label="Smart nudges" desc="Suggest a focus block after a long distraction, and a break after a long stretch.">
            <Switch label="Smart nudges" checked={s.nudgesEnabled} onChange={(v) => update({ nudgesEnabled: v })} />
          </Row>
        )}
        {desktop && s.nudgesEnabled && (
          <>
            <Row label="Nudge after distraction of">
              <Stepper label="distraction nudge" value={s.nudgeDistractionMinutes} onChange={(v) => update({ nudgeDistractionMinutes: v })} min={5} max={60} step={5} format={mins} />
            </Row>
            <Row label="Suggest a break after">
              <Stepper label="break reminder" value={s.nudgeBreakMinutes} onChange={(v) => update({ nudgeBreakMinutes: v })} min={30} max={240} step={15} format={(v) => fmtDuration(v * 60_000)} />
            </Row>
          </>
        )}
      </Section>

      <Section title="Appearance & system">
        <Row label="Theme">
          <Segmented<ThemePref>
            label="Theme"
            size="sm"
            value={s.theme ?? "system"}
            onChange={(theme) => update({ theme })}
            options={[
              { value: "system", label: "System" },
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        </Row>
        {desktop && autostart !== null && (
          <Row label="Open at login" desc="Starts quietly in the menu bar or tray.">
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
          <Row label={isMac ? "Show timer in menu bar" : "Show timer in tray tooltip"}>
            <Switch label="Show timer in tray" checked={s.showTimerInTray} onChange={(v) => update({ showTimerInTray: v })} />
          </Row>
        )}
        {isMac && isNative && (
          <Row label="Hide Dock icon" desc="Kairo stays reachable from the menu bar.">
            <Switch label="Hide Dock icon" checked={s.hideDockIcon} onChange={(v) => update({ hideDockIcon: v })} />
          </Row>
        )}
        {desktop && (
          <Row label="Global shortcut" desc="Start or pause the timer from any app.">
            <select className="select" value={s.globalShortcut} onChange={(e) => update({ globalShortcut: e.target.value })} aria-label="Global shortcut">
              {["CommandOrControl+Shift+Space", "CommandOrControl+Shift+F", "CommandOrControl+Alt+P", ""].map((a) => (
                <option key={a} value={a}>
                  {a ? shortcutLabel(a) : "Off"}
                </option>
              ))}
            </select>
          </Row>
        )}
      </Section>

      <section className="settings-section">
        <div className="settings-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            Privacy & data
          </h2>
        </div>
        <div className="card privacy-card">
          <div className="privacy-hero">
            <span className="privacy-shield">
              <ShieldCheck />
            </span>
            <div>
              <div className="card-title">Your data never leaves this device</div>
              <p className="faint" style={{ fontSize: 13, marginTop: 4 }}>
                No account, no cloud, no analytics, no ads. Kairo makes no network requests. Uninstalling it removes everything.
              </p>
            </div>
          </div>
          <div className="privacy-facts">
            <div>
              <HardDrive />
              <span>{info ? `${info.spans.toLocaleString()} activity records · ${info.sessions.toLocaleString()} focus blocks` : "…"}</span>
            </div>
            <div>
              <Cpu />
              <span>{info ? `${(info.dbBytes / 1024 / 1024).toFixed(1)} MB${info.firstActivity ? ` since ${fmtShortDay(info.firstActivity)}` : ""}` : "…"}</span>
            </div>
            <div className="privacy-path" title={info?.dbPath}>
              <Lock />
              <span>{info?.dbPath ?? "…"}</span>
            </div>
          </div>
          <div className="rows" style={{ marginTop: 6 }}>
            <Row label="Keep history for" desc="Older activity is deleted automatically at launch.">
              <select className="select" value={s.retentionDays} onChange={(e) => update({ retentionDays: Number(e.target.value) })} aria-label="Data retention">
                <option value={0}>Forever</option>
                <option value={365}>1 year</option>
                <option value={180}>6 months</option>
                <option value={90}>90 days</option>
                <option value={30}>30 days</option>
              </select>
            </Row>
            <Row label="Export everything" desc="Your data, in open formats.">
              <button className="btn btn-secondary btn-sm" onClick={async () => (await backend.exportData("json")) && toast({ title: "Export saved", tone: "success" })}>
                <FileJson /> JSON
              </button>
              <button className="btn btn-secondary btn-sm" onClick={async () => (await backend.exportData("csv")) && toast({ title: "Export saved", tone: "success" })}>
                <FileSpreadsheet /> CSV
              </button>
            </Row>
            <Row label="Delete all data" desc="Erases activity, focus history, tasks and custom rules. Settings stay.">
              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  const ok = await confirmDialog("Permanently delete all tracked activity, focus history, tasks and rules from this device? This can't be undone.", {
                    title: "Delete all data",
                    okLabel: "Delete everything",
                    destructive: true,
                  });
                  if (!ok) return;
                  await backend.wipeData();
                  toast({ title: "All data deleted", tone: "success" });
                }}
              >
                <Trash2 /> Delete…
              </button>
            </Row>
          </div>
        </div>
      </section>

      <section className="settings-section about">
        <div className="faint" style={{ fontSize: 12.5, textAlign: "center", padding: "8px 0 24px" }}>
          Kairo 0.1.0 · Made for deep work · {isNative ? `${os} app` : "Browser preview"}
        </div>
      </section>
    </div>
  );
}
