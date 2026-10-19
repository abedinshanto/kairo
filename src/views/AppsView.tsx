import { EyeOff, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Monogram, Segmented, cx } from "../components/ui";
import { backend } from "../lib/backend";
import { CATEGORIES, categoryLabel, defaultProductivity, entityName } from "../lib/categories";
import { confirmDialog } from "../lib/dialogs";
import { useQuery } from "../lib/hooks";
import { useApp } from "../lib/store";
import { addDays, fmtDuration, startOfDay } from "../lib/time";
import type { EntityTotal, Productivity } from "../lib/types";

type Range = 1 | 7 | 30;
type Filter = "all" | "1" | "0" | "-1";

export function AppsView() {
  const [range, setRange] = useState<Range>(7);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const toast = useApp((s) => s.toast);
  const today = startOfDay(Date.now());
  const from = addDays(today, -(range - 1));

  const { data } = useQuery(async () => {
    const [entities, rules] = await Promise.all([backend.entityTotals(from, addDays(today, 1)), backend.rulesList()]);
    return { entities, rules: new Set(rules.map((r) => r.key)) };
  }, [from]);

  const total = useMemo(() => (data?.entities ?? []).reduce((a, e) => a + e.ms, 0), [data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.entities ?? []).filter(
      (e) =>
        (filter === "all" || String(e.productivity) === filter) &&
        (!q || e.name.toLowerCase().includes(q) || e.key.includes(q) || categoryLabel(e.category).toLowerCase().includes(q)),
    );
  }, [data, filter, query]);

  const ruleKey = (e: EntityTotal) => `${e.kind === "site" ? "site" : "app"}:${e.key}`;

  const setRule = async (e: EntityTotal, category: string, productivity: Productivity) => {
    await backend.ruleSet({ key: ruleKey(e), category, productivity });
    useApp.getState().bumpData();
  };

  const exclude = async (e: EntityTotal) => {
    const name = entityName(e.kind, e.key, e.name);
    const ok = await confirmDialog(`Stop tracking ${name} and permanently delete its history from this device?`, {
      title: "Exclude app",
      okLabel: "Exclude & delete",
      destructive: true,
    });
    if (!ok) return;
    updateSettings({ excludedApps: [...settings.excludedApps, e.key.toLowerCase()] });
    toast({ title: `${name} excluded`, body: "Its history was deleted. You can re-enable it in Settings.", tone: "success" });
    window.setTimeout(() => useApp.getState().bumpData(), 600);
  };

  return (
    <div>
      <PageHeader
        title="Apps & Sites"
        subtitle="Choose what counts as productive. Changes apply to your whole history."
        actions={
          <Segmented<Range>
            label="Date range"
            value={range}
            onChange={setRange}
            options={[
              { value: 1, label: "Today" },
              { value: 7, label: "7 days" },
              { value: 30, label: "30 days" },
            ]}
          />
        }
      />

      <div className="filter-row">
        <div className="input-icon" style={{ flex: "1 1 220px", maxWidth: 340 }}>
          <Search />
          <input className="input" placeholder="Search apps, sites, categories" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
        </div>
        <Segmented<Filter>
          label="Filter by productivity"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "1", label: "Productive" },
            { value: "0", label: "Neutral" },
            { value: "-1", label: "Distracting" },
          ]}
        />
      </div>

      <div className="card flush">
        {rows.length ? (
          <ul className="app-table">
            {rows.map((e) => {
              const custom = data?.rules.has(ruleKey(e));
              return (
                <li key={ruleKey(e)} className="app-row">
                  <Monogram name={entityName(e.kind, e.key, e.name)} kind={e.kind} productivity={e.productivity} />
                  <div className="app-name-col">
                    <div className="app-name">
                      {entityName(e.kind, e.key, e.name)}
                      {custom && <span className="badge accent">Custom</span>}
                    </div>
                    <div className="faint app-sub">
                      {e.kind === "site" ? `${e.key} · in ${e.appName}` : "App"} · {e.visits} visit{e.visits === 1 ? "" : "s"}
                    </div>
                  </div>
                  <select
                    className="select app-cat"
                    aria-label={`Category for ${e.name}`}
                    value={e.category}
                    onChange={(ev) => void setRule(e, ev.target.value, defaultProductivity(ev.target.value))}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <div className="prod-toggle" role="group" aria-label={`Productivity for ${e.name}`}>
                    {([1, 0, -1] as Productivity[]).map((p) => (
                      <button
                        key={p}
                        className={cx("prod-btn", p > 0 ? "productive" : p < 0 ? "distracting" : "neutral", e.productivity === p && "on")}
                        aria-pressed={e.productivity === p}
                        title={p > 0 ? "Productive" : p < 0 ? "Distracting" : "Neutral"}
                        onClick={() => void setRule(e, e.category, p)}
                      >
                        {p > 0 ? "Productive" : p < 0 ? "Distracting" : "Neutral"}
                      </button>
                    ))}
                  </div>
                  <div className="app-time">
                    <span className="tabular">{fmtDuration(e.ms)}</span>
                    <span className="faint tabular">{total ? `${Math.round((e.ms / total) * 100)}%` : ""}</span>
                  </div>
                  <div className="app-actions">
                    {custom && (
                      <button
                        className="icon-btn sm"
                        aria-label="Reset to default"
                        title="Reset to default"
                        onClick={async () => {
                          await backend.ruleDelete(ruleKey(e));
                          useApp.getState().bumpData();
                        }}
                      >
                        <RotateCcw />
                      </button>
                    )}
                    {e.kind === "app" && (
                      <button className="icon-btn sm" aria-label="Exclude from tracking" title="Exclude from tracking" onClick={() => void exclude(e)}>
                        <EyeOff />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty">
            <strong>{query || filter !== "all" ? "No matches" : "Nothing tracked in this period"}</strong>
            {query || filter !== "all" ? "Try a different search or filter." : "Apps and sites show up here as you use them."}
          </div>
        )}
      </div>
    </div>
  );
}
