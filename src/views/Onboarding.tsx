import { ArrowLeft, ArrowRight, BarChart3, Lock, MonitorSmartphone, ShieldCheck, Smartphone, Sparkles, Target, Timer, WifiOff } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Buddy, type BuddyMood } from "../components/Buddy";
import { PageTitle, Stepper, cx } from "../components/ui";
import { backend, isNative } from "../lib/backend";
import { isMobileOS, os } from "../lib/platform";
import { useApp } from "../lib/store";
import { fmtDuration } from "../lib/time";
import "../styles/views/onboarding.css";

const STEPS = 3;
const MOOD: BuddyMood[] = ["happy", "idle", "happy"];

interface Benefit {
  icon: ReactNode;
  title: string;
  sub: string;
}

const MEET: Benefit[] = [
  { icon: <Timer />, title: "Calm focus blocks", sub: "Timed sessions with breaks, intentions and tasks." },
  { icon: <BarChart3 />, title: "Effortless tracking", sub: "See where your time goes across apps and sites." },
  { icon: <Sparkles />, title: "Gentle insights", sub: "Find your peak hours and biggest distractions." },
];

const PRIVATE: Benefit[] = [
  { icon: <WifiOff />, title: "Works fully offline", sub: "Kairo makes no network requests. Ever." },
  { icon: <Lock />, title: "Only names, no titles", sub: "Window titles are off; app and site names are kept." },
  { icon: <ShieldCheck />, title: "You're in control", sub: "Pause, exclude apps or delete everything any time." },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const tracker = useApp((s) => s.tracker);
  const root = useRef<HTMLDivElement>(null);

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

  const goal = fmtDuration(settings.dailyFocusGoalMinutes * 60_000);
  // Platform notes from the native shells (none show in the web preview).
  const needsUsage = isNative && os === "android" && !!tracker?.needsPermission;
  const iosNote = isNative && os === "ios";
  const trayNote = !isMobileOS && isNative;
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
          <div className={cx("onb-kai", compact && "compact")}>
            <span className="onb-halo" aria-hidden />
            <span className="onb-hop" key={step}>
              <Buddy mood={MOOD[step]} size={184} />
            </span>
            <span className={cx("onb-float", `s${step}`)} key={`f${step}`} aria-hidden>
              {step === 0 && (
                <>
                  <Timer /> {settings.focusMinutes}:00
                </>
              )}
              {step === 1 && (
                <>
                  <Lock /> On device
                </>
              )}
              {step === 2 && (
                <>
                  <Target /> {goal} a day
                </>
              )}
            </span>
          </div>

          <div className="onb-step" key={step} style={{ ["--dir" as string]: dir }}>
            <div id="onb-title" className="onb-title">
              {step === 0 && <PageTitle strong="Meet Kai," dim="your focus buddy." />}
              {step === 1 && <PageTitle strong="Private," dim="by design." />}
              {step === 2 && <PageTitle strong="Let's set you up," dim="it takes a second." />}
            </div>

            {step === 0 && (
              <>
                <p className="onb-lead">Kairo is a calm focus timer that also shows where your time really goes.</p>
                <BenefitList items={MEET} />
              </>
            )}

            {step === 1 && (
              <>
                <p className="onb-lead">Everything Kairo records stays on this device. No account, no server, nowhere to leak.</p>
                <BenefitList items={PRIVATE} />
              </>
            )}

            {step === 2 && (
              <>
                <p className="onb-lead">You can change both any time in Settings.</p>
                <div className="card onb-setup">
                  <label className="onb-field">
                    <span className="onb-field-label">What should Kai call you?</span>
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
                      <span className="onb-field-sub">Most people start with 2–4 hours.</span>
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
                  {needsUsage && (
                    <div className="onb-permission">
                      <span className="icon-tile round">
                        <Smartphone />
                      </span>
                      <div className="onb-permission-text">
                        <span className="onb-field-label">Allow usage access</span>
                        <span className="onb-field-sub">Android needs your OK before Kairo can see which apps you use. It all stays on your phone.</span>
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
                    <span>On iPhone and iPad, Apple doesn't let apps read other apps' usage. Kairo tracks your focus blocks here; app tracking runs on your Mac, PC or Android.</span>
                  </p>
                )}
                {trayNote && (
                  <p className="onb-note">
                    <MonitorSmartphone />
                    <span>Kairo lives in your menu bar or system tray. Closing the window keeps the timer and tracking running.</span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="onb-foot">
          <button className="btn btn-dark btn-block onb-cta" onClick={last ? start : () => go(step + 1)}>
            {last ? "Start focusing" : step === 0 ? "Get started" : "Continue"}
            <span className="onb-cta-arrow" aria-hidden>
              <ArrowRight />
            </span>
          </button>
        </footer>
      </div>
    </div>
  );
}

function BenefitList({ items }: { items: Benefit[] }) {
  return (
    <ul className="card onb-list">
      {items.map((b) => (
        <li key={b.title} className="onb-row">
          <span className="icon-tile">{b.icon}</span>
          <span className="onb-row-text">
            <span className="onb-row-title">{b.title}</span>
            <span className="onb-row-sub">{b.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
