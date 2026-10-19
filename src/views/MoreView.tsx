import { AppWindow, ChevronRight, ListChecks, Settings, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "../components/PageHeader";
import { useApp, type View } from "../lib/store";

const LINKS: { view: View; label: string; desc: string; icon: ReactNode }[] = [
  { view: "apps", label: "Apps & Sites", desc: "Choose what counts as productive", icon: <AppWindow /> },
  { view: "tasks", label: "Tasks", desc: "Plan and link focus blocks", icon: <ListChecks /> },
  { view: "settings", label: "Settings", desc: "Timer, tracking, privacy & data", icon: <Settings /> },
];

export function MoreView() {
  const setView = useApp((s) => s.setView);
  return (
    <div className="narrow">
      <PageHeader title="More" />
      <div className="card flush">
        <ul className="more-list">
          {LINKS.map((l) => (
            <li key={l.view}>
              <button onClick={() => setView(l.view)}>
                <span className="more-icon">{l.icon}</span>
                <span className="more-text">
                  <span className="more-label">{l.label}</span>
                  <span className="faint more-desc">{l.desc}</span>
                </span>
                <ChevronRight className="faint" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="more-privacy faint">
        <ShieldCheck />
        Everything Kairo records stays on this device.
      </div>
    </div>
  );
}
