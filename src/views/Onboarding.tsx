import { ArrowRight, BarChart3, Lock, ShieldCheck, Sparkles, Timer, WifiOff } from "lucide-react";
import { useState } from "react";
import { Modal, Stepper, cx } from "../components/ui";
import { backend, isNative } from "../lib/backend";
import { isMobileOS, os } from "../lib/platform";
import { useApp } from "../lib/store";
import { fmtDuration } from "../lib/time";

export function Onboarding() {
  const [step, setStep] = useState(0);
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const tracker = useApp((s) => s.tracker);
  const finish = () => update({ onboarded: true });

  return (
    <Modal onClose={finish} label="Welcome to Kairo">
      <div className="onboard">
        <div className="onboard-steps" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={cx(i <= step && "on")} />
          ))}
        </div>

        {step === 0 && (
          <>
            <div className="onboard-art">
              <Timer />
            </div>
            <h2 className="onboard-title">Welcome to Kairo</h2>
            <p className="onboard-text">A calm focus timer that also shows where your time actually goes, so you can protect what matters.</p>
            <ul className="onboard-list">
              <li>
                <Timer /> Focus blocks with breaks, intentions and tasks
              </li>
              <li>
                <BarChart3 /> Automatic time tracking across apps and websites
              </li>
              <li>
                <Sparkles /> Insights on your peak hours and biggest distractions
              </li>
            </ul>
          </>
        )}

        {step === 1 && (
          <>
            <div className="onboard-art private">
              <ShieldCheck />
            </div>
            <h2 className="onboard-title">Private by design</h2>
            <p className="onboard-text">Everything Kairo records lives in a database on this device. There's no account and no server for it to go to.</p>
            <ul className="onboard-list">
              <li>
                <WifiOff /> Works fully offline. Kairo makes no network requests.
              </li>
              <li>
                <Lock /> Window titles are off by default; only app and site names are kept
              </li>
              <li>
                <ShieldCheck /> Pause tracking, exclude apps or delete everything any time
              </li>
            </ul>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="onboard-title" style={{ marginTop: 8 }}>
              Set your daily focus goal
            </h2>
            <p className="onboard-text">How much deep, focused work do you want each day? Most people start with 2–4 hours.</p>
            <div className="onboard-goal">
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
            {isNative && os === "android" && tracker?.needsPermission && (
              <div className="onboard-permission">
                <div>
                  <strong>Allow usage access</strong>
                  <p className="faint">Android needs your OK before Kairo can see which apps you use. The data stays on your phone.</p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => void backend.usagePermissionRequest()}>
                  Open settings
                </button>
              </div>
            )}
            {isNative && os === "ios" && (
              <p className="onboard-note faint">On iPhone and iPad, Apple doesn't let apps read other apps' usage. Kairo tracks your focus blocks there; app tracking runs on your Mac, PC or Android.</p>
            )}
            {!isMobileOS && isNative && (
              <p className="onboard-note faint">Kairo lives in your menu bar or system tray. Closing the window keeps the timer and tracking running.</p>
            )}
          </>
        )}

        <div className="onboard-actions">
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={finish}>
              Skip
            </button>
          )}
          {step < 2 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
              Continue <ArrowRight />
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => {
                void backend.ensureNotificationPermission().catch(() => {});
                finish();
              }}
            >
              Start focusing <ArrowRight />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
