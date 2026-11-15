import { ArrowLeft, ArrowRight, BarChart3, Lock, Smartphone, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Buddy, type BuddyMood } from "../components/Buddy";
import { Stepper, Switch, cx } from "../components/ui";
import { backend, isNative } from "../lib/backend";
import { isMac, isMobileOS, os } from "../lib/platform";
import { useApp } from "../lib/store";
import { fmtDuration } from "../lib/time";
import "../styles/views/onboarding.css";

const STEPS = 2;
const MOOD: BuddyMood[] = ["happy", "idle"];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const tracker = useApp((s) => s.tracker);
  const root = useRef<HTMLDivElement>(null);
  const [atLogin, setAtLogin] = useState(true);
  const [readSites, setReadSites] = useState(true);

  const finish = () => update({ onboarded: true });
  // Fade the welcome flow away, then hand over to the app.
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(finish, 320);
  };
  const go = (next: number) => {
    if (next < 0 || next >= STEPS) return;
    setDir(next > step ? 1 : -1);
    setStep(next);
  };
  const start = () => {
    void backend.ensureNotificationPermission().catch(() => {});
    // Kairo only sees what happens while it runs: starting at login covers the whole day.
    if (trayNote) void backend.setAutostart(atLogin).catch(() => {});
    if (sitesNote) update({ trackBrowserUrls: readSites });
    close();
  };
  const last = step === STEPS - 1;

  // Behave like a modal: the app behind is inert while the welcome flow is up.
  useEffect(() => {
    const el = root.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const others = Array.from(parent.children).filter((c) => c !== el && !c.classList.contains("toasts"));
    others.forEach((c) => c.setAttribute("inert", ""));
    el.focus({ preventScroll: true });
    return () => others.forEach((c) => c.removeAttribute("inert"));
  }, []);

  // Esc skips (as before); ← / → move between steps when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "ArrowRight" && !last) go(step + 1);
      if (e.key === "ArrowLeft" && step > 0) go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Platform notes from the native shells (none show in the web preview).
  const needsUsage = isNative && os === "android" && !!tracker?.needsPermission;
  const iosNote = isNative && os === "ios";
  const trayNote = !isMobileOS && isNative;
  const sitesNote = trayNote && isMac;
  const compact = last && (needsUsage || iosNote || trayNote);

  return (
    <div ref={root} className={cx("onb", leaving && "leaving")} role="dialog" aria-modal="true" aria-labelledby="onb-title" tabIndex={-1}>
      <div className="onb-bg" aria-hidden>
        <span className="onb-blob a" />
        <span className="onb-blob b" />
        <span className="onb-blob c" />
      </div>

      <div className="onb-col">
        <header className="onb-top">
          <button className={cx("circle-btn onb-back", step === 0 && "hidden")} aria-label="Back" tabIndex={step === 0 ? -1 : undefined} onClick={() => go(step - 1)}>
            <ArrowLeft />
          </button>
          <div className="onb-dots" aria-hidden>
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} className={cx(i === step && "on", i < step && "done")} />
            ))}
          </div>
          <button className={cx("btn btn-ghost btn-sm onb-skip", last && "hidden")} tabIndex={last ? -1 : undefined} onClick={close}>
            Skip
          </button>
        </header>
        <p className="sr-only" aria-live="polite">
          Step {step + 1} of {STEPS}
        </p>

        <div className="onb-body">
          <div className={cx("onb-kai", compact && "compact", step === 0 && "hero")}>
            <span className="onb-halo" aria-hidden />
            <span className="onb-hop" key={step}>
              <Buddy mood={MOOD[step]} size={step === 0 ? 220 : 160} />
            </span>
            {step === 0 && (
              <>
                <span className="onb-float f1" aria-hidden>
                  <Timer /> Focus
                </span>
                <span className="onb-float f2" aria-hidden>
                  <BarChart3 /> Insights
                </span>
                <span className="onb-float f3" aria-hidden>
                  <Lock /> Private
                </span>
              </>
            )}
          </div>

          <div className="onb-step" key={step} style={{ ["--dir" as string]: dir }}>
            <div id="onb-title" className="onb-title">
              {step === 0 ? <h1 className="display onb-brand">Kairo</h1> : <h1 className="display">Make it yours</h1>}
            </div>

            {step === 0 && <p className="onb-lead">Focus calmly. See where your time goes. All on your device.</p>}

            {step === 1 && (
              <>
                <div className="card onb-setup">
                  <label className="onb-field">
                    <span className="onb-field-label">Your name</span>
                    <input
                      className="input pill onb-name"
                      type="text"
                      placeholder="Your name"
                      autoComplete="given-name"
                      maxLength={40}
                      value={settings.name ?? ""}
                      onChange={(e) => update({ name: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    />
                  </label>
                  <div className="onb-goal">
                    <div className="onb-goal-text">
                      <span className="onb-field-label">Daily focus goal</span>
                    </div>
                    <Stepper
                      label="daily focus goal"
                      value={settings.dailyFocusGoalMinutes}
                      onChange={(v) => update({ dailyFocusGoalMinutes: v })}
                      min={30}
                      max={600}
                      step={30}
                      format={(v) => fmtDuration(v * 60_000)}
                    />
                  </div>
                  {trayNote && (
                    <div className="onb-goal">
                      <div className="onb-goal-text">
                        <span className="onb-field-label">Open at login</span>
                        <span className="onb-field-sub">Track your whole day from the {isMac ? "menu bar" : "tray"}.</span>
                      </div>
                      <Switch label="Open at login" checked={atLogin} onChange={setAtLogin} />
                    </div>
                  )}
                  {sitesNote && (
                    <div className="onb-goal">
                      <div className="onb-goal-text">
                        <span className="onb-field-label">See websites</span>
                        <span className="onb-field-sub">Only the domain is kept. macOS asks once per browser.</span>
                      </div>
                      <Switch label="See websites" checked={readSites} onChange={setReadSites} />
                    </div>
                  )}
                  {needsUsage && (
                    <div className="onb-permission">
                      <span className="icon-tile round">
                        <Smartphone />
                      </span>
                      <div className="onb-permission-text">
                        <span className="onb-field-label">Allow usage access</span>
                        <span className="onb-field-sub">Android asks before Kairo can see which apps you use.</span>
                        <button className="btn btn-soft btn-sm" onClick={() => void backend.usagePermissionRequest()}>
                          Open settings
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {iosNote && (
                  <p className="onb-note">
                    <Smartphone />
                    <span>On iPhone and iPad, Kairo tracks your focus blocks. App tracking runs on your Mac, PC or Android.</span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="onb-foot">
          <button className="btn btn-dark btn-block onb-cta" onClick={last ? start : () => go(step + 1)}>
            {last ? "Start focusing" : "Get started"}
            <span className="onb-cta-arrow" aria-hidden>
              <ArrowRight />
            </span>
          </button>
        </footer>
      </div>
    </div>
  );
}
