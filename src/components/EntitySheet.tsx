import { Check, EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { backend } from "../lib/backend";
import { CATEGORIES, PRODUCTIVITY_LABEL, defaultProductivity, entityName, productivityClass } from "../lib/categories";
import { confirmDialog } from "../lib/dialogs";
import { useMediaQuery, useQuery } from "../lib/hooks";
import { useApp } from "../lib/store";
import { fmtDuration } from "../lib/time";
import type { EntityTotal, Productivity } from "../lib/types";
import "../styles/entity-sheet.css";
import { Avatar, Sheet, cx } from "./ui";

const LEVELS: Productivity[] = [1, 0, -1];

/** The rule key for an app or site ("app:slack", "site:youtube.com"). */
export const ruleKey = (e: EntityTotal) => `${e.kind === "site" ? "site" : "app"}:${e.key}`;

/** "23%", or "<1%" for a sliver. */
export const fmtShare = (ms: number, total: number) => {
  if (!total || ms <= 0) return "0%";
  const pct = (ms / total) * 100;
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
};

/**
 * One app or site: how it counts, its category, and excluding it (which stops
 * tracking it and deletes its history). Opened from Apps & sites and from Stats.
 * `period` reads after the time, e.g. "today" or "in the last 7 days".
 */
export function EntitySheet({ e, total, period, onClose }: { e: EntityTotal; total: number; period: string; onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const phone = useMediaQuery("(max-width: 760px)");
  const [busy, setBusy] = useState(false);
  const { data: rules } = useQuery(() => backend.rulesList(), []);
  const name = entityName(e.kind, e.key, e.name);
  const key = ruleKey(e);
  const site = e.kind === "site";
  const custom = !!rules?.some((r) => r.key === key);

  /** Resolves to whether it worked (a failure has already said so in a toast). */
  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      useApp.getState().bumpData();
      return true;
    } catch (err) {
      toast({ title: "Couldn't save that change", body: String(err), tone: "warning" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setRule = (category: string, productivity: Productivity) => {
    if (category === e.category && productivity === e.productivity) return;
    void run(() => backend.ruleSet({ key, category, productivity }));
  };

  const reset = () => void run(() => backend.ruleDelete(key));

  const exclude = async () => {
    const ok = await confirmDialog(`Stop tracking ${name} and permanently delete its history from this device?`, {
      title: site ? "Exclude site" : "Exclude app",
      okLabel: "Exclude & delete",
      destructive: true,
    });
    if (!ok) return;
    const { settings, updateSettings } = useApp.getState();
    const id = e.key.toLowerCase();
    if (site) {
      if (!settings.excludedSites.includes(id)) updateSettings({ excludedSites: [...settings.excludedSites, id] });
    } else if (!settings.excludedApps.includes(id)) {
      updateSettings({ excludedApps: [...settings.excludedApps, id] });
    }
    onClose();
    toast({ title: `${name} excluded`, body: "Its history was deleted. You can track it again in Settings.", tone: "success" });
    // Settings save after a short debounce; the core deletes the history then.
    window.setTimeout(() => useApp.getState().bumpData(), 700);
  };

  // Just this once: the time goes, tracking stays.
  const forget = async () => {
    const ok = await confirmDialog(`Delete all of ${name}'s recorded time? Kairo keeps tracking it from now on.`, {
      title: "Delete history",
      okLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    if (!(await run(() => backend.deleteHistory(site ? "site" : "app", e.key)))) return;
    onClose();
    toast({ title: `${name}'s history deleted`, body: "It will show up again when you next use it.", tone: "success" });
  };

  const where = site ? `${e.key} in ${e.appName}` : "App";

  return (
    <Sheet label={`${name} details`} onClose={onClose}>
      <div className={cx("apps-sheet", busy && "busy")}>
        <header className="apps-sheet-head">
          <Avatar name={name} productivity={e.productivity} size={phone ? 60 : 72} iconKey={site ? undefined : e.key} siteKey={site ? e.key : undefined} />
          <h2 className="title apps-sheet-name">{name}</h2>
          <p className="apps-sheet-where">
            {where} · {e.visits} visit{e.visits === 1 ? "" : "s"}
          </p>
          <div className="apps-sheet-time tabular">{fmtDuration(e.ms)}</div>
          <p className="apps-sheet-period">
            {period} · {fmtShare(e.ms, total)} of your time
          </p>
        </header>

        <section aria-labelledby="apps-counts-as">
          <h3 className="apps-sheet-label" id="apps-counts-as">
            Counts as
          </h3>
          <div className="apps-levels" role="group" aria-labelledby="apps-counts-as">
            {LEVELS.map((p) => {
              const on = e.productivity === p;
              return (
                <button key={p} className={cx("apps-level", productivityClass(p))} aria-pressed={on} disabled={busy} onClick={() => setRule(e.category, p)}>
                  {on ? <Check /> : <span className="apps-level-dot" aria-hidden />}
                  {PRODUCTIVITY_LABEL[p]}
                </button>
              );
            })}
          </div>
          <p className="apps-sheet-note">Changes apply to your whole history.</p>
        </section>

        <section aria-labelledby="apps-category">
          <h3 className="apps-sheet-label" id="apps-category">
            Category
          </h3>
          <div className="apps-cats" role="group" aria-labelledby="apps-category">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={cx("chip", "apps-cat", e.category === c.id && "active")}
                aria-pressed={e.category === c.id}
                disabled={busy}
                onClick={() => setRule(c.id, defaultProductivity(c.id))}
              >
                {c.label}
              </button>
            ))}
          </div>
        </section>

        <div className="apps-sheet-actions">
          {custom && (
            <button className="btn btn-soft" disabled={busy} onClick={reset}>
              <RotateCcw /> Reset to default
            </button>
          )}
          <button className="btn btn-soft" disabled={busy} onClick={() => void forget()} title="Delete its time once; Kairo keeps tracking it">
            <Trash2 /> Delete history
          </button>
          <button className="btn btn-danger" disabled={busy} onClick={() => void exclude()} title="Stop tracking it and delete its time">
            <EyeOff /> Exclude & delete
          </button>
        </div>
      </div>
    </Sheet>
  );
}
