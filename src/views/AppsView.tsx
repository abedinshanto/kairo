import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Buddy } from "../components/Buddy";
import { EntitySheet, fmtShare, ruleKey } from "../components/EntitySheet";
import { Avatar, PageTitle, PillTabs, Segmented, TopBar, cx } from "../components/ui";
import { backend } from "../lib/backend";
import { PRODUCTIVITY_LABEL, categoryLabel, entityName, productivityClass } from "../lib/categories";
import { useQuery } from "../lib/hooks";
import { useApp } from "../lib/store";
import { addDays, fmtDuration, startOfDay } from "../lib/time";
import type { EntityTotal, Productivity } from "../lib/types";
import "../styles/views/apps.css";

type Range = 1 | 7 | 30;
type Filter = "all" | "1" | "0" | "-1";
type Split = Record<"1" | "0" | "-1", number>;

const LEVELS: Productivity[] = [1, 0, -1];
/** Rows shown before "Show all" (progressive disclosure keeps the screen calm). */
const PAGE = 10;

const displayName = (e: EntityTotal) => entityName(e.kind, e.key, e.name);
const periodLabel = (r: Range) => (r === 1 ? "today" : `in the last ${r} days`);

export function AppsView() {
  // Stats links here with its range (#/apps?r=30)
  const [range, setRange] = useState<Range>(() => (/[?&]r=30\b/.test(window.location.hash) ? 30 : /[?&]r=1\b/.test(window.location.hash) ? 1 : 7));
  // Keep the hash in step so a reload keeps the chosen range.
  const pickRange = (r: Range) => {
    setRange(r);
    window.history.replaceState(null, "", r === 7 ? "#/apps" : `#/apps?r=${r}`);
  };
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const today = startOfDay(Date.now());
  const from = addDays(today, -(range - 1));

  const { data, loading } = useQuery(async () => {
    const [entities, rules] = await Promise.all([backend.entityTotals(from, addDays(today, 1)), backend.rulesList()]);
    return { entities, rules: new Set(rules.map((r) => r.key)) };
  }, [from]);

  const entities = useMemo(() => data?.entities ?? [], [data]);

  const { total, split } = useMemo(() => {
    const split: Split = { "1": 0, "0": 0, "-1": 0 };
    for (const e of entities) split[String(Math.sign(e.productivity)) as keyof Split] += e.ms;
    return { total: split["1"] + split["0"] + split["-1"], split };
  }, [entities]);

  const q = query.trim().toLowerCase();
  const matched = useMemo(
    () =>
      entities.filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          displayName(e).toLowerCase().includes(q) ||
          e.key.toLowerCase().includes(q) ||
          categoryLabel(e.category).toLowerCase().includes(q),
      ),
    [entities, q],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: matched.length, "1": 0, "0": 0, "-1": 0 };
    for (const e of matched) c[String(Math.sign(e.productivity)) as Filter]++;
    return c;
  }, [matched]);

  const rows = filter === "all" ? matched : matched.filter((e) => String(e.productivity) === filter);
  const expanded = showAll || !!q;
  const visible = expanded ? rows : rows.slice(0, PAGE);
  const filtered = !!q || filter !== "all";
  const selected = openKey ? entities.find((e) => ruleKey(e) === openKey) : undefined;

  return (
    <div className={cx("apps", loading && data && "refreshing")}>
      <TopBar
        left={
          <button className="circle-btn" aria-label="Back to stats" title="Back to stats" onClick={() => useApp.getState().setView("stats")}>
            <ChevronLeft />
          </button>
        }
      />

      <div className="apps-grid">
        <div className="apps-title">
          <PageTitle strong="Apps & sites," dim="your call." />
        </div>

        <aside className="apps-side">
          <Summary range={range} onRange={pickRange} total={total} split={split} />
        </aside>

        <div className="apps-controls">
          <div className="input-wrap apps-search">
            <Search />
            <input
              className="input pill"
              type="search"
              placeholder="Search apps, sites or categories"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search apps and sites"
            />
            {query && (
              <button className="circle-btn sm soft apps-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                <X />
              </button>
            )}
          </div>
          <div className="apps-filters">
            <PillTabs<Filter>
              label="Filter by how it counts"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "1", label: "Productive", count: counts["1"] },
                { value: "0", label: "Neutral", count: counts["0"] },
                { value: "-1", label: "Distracting", count: counts["-1"] },
              ]}
            />
          </div>
          {(!data || visible.length > 0) && <p className="muted apps-hint">Tap any app or site to change how it counts.</p>}
        </div>

        <section className="apps-list-wrap" aria-label="Apps and sites">
          <div className="card apps-card">
            {!data ? (
              <div className="apps-loading" aria-busy="true" aria-label="Loading" />
            ) : visible.length ? (
              <>
                <ul className="apps-list">
                  {visible.map((e) => (
                    <Row key={ruleKey(e)} e={e} total={total} custom={data.rules.has(ruleKey(e))} onOpen={() => setOpenKey(ruleKey(e))} />
                  ))}
                </ul>
                {!expanded && rows.length > PAGE && (
                  <div className="apps-more">
                    <button className="btn btn-ghost btn-sm card-link" onClick={() => setShowAll(true)}>
                      Show all {rows.length}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="apps-empty">
                <Buddy mood={filtered ? "idle" : "sleep"} size={96} />
                <strong>{filtered ? "Nothing matches" : "All quiet so far"}</strong>
                <span>{filtered ? "Try another search or filter." : "Apps and sites show up here as you use them."}</span>
                {filtered && (
                  <button
                    className="btn btn-soft btn-sm"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {selected && data && (
        <EntitySheet e={selected} total={total} period={periodLabel(range)} onClose={() => setOpenKey(null)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Hero summary

function Summary({ range, onRange, total, split }: { range: Range; onRange: (r: Range) => void; total: number; split: Split }) {
  const share = total ? split["1"] / total : 0;
  const totalMin = Math.round(total / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const described = LEVELS.map((p) => `${PRODUCTIVITY_LABEL[p]} ${fmtDuration(split[String(p) as keyof Split])}`).join(", ");

  return (
    <section className="card apps-hero" aria-label="Time summary">
        <Segmented<Range>
          label="Date range"
          value={range}
          onChange={onRange}
          options={[
            { value: 1, label: "Today" },
            { value: 7, label: "7 days" },
            { value: 30, label: "30 days" },
          ]}
        />

        <div className="apps-hero-body">
          <div className="apps-hero-text">
            <span className="apps-hero-label">Tracked {periodLabel(range)}</span>
            <div className="apps-total tabular">
              {h > 0 && (
                <>
                  {h}
                  <small>h</small>
                </>
              )}
              {(m > 0 || h === 0) && (
                <>
                  {m}
                  <small>m</small>
                </>
              )}
            </div>
            <span className="badge brand">{total ? `${Math.round(share * 100)}% productive` : "Nothing yet"}</span>
          </div>
        </div>

        <div className="apps-split">
          <div className="apps-bar" role="img" aria-label={described}>
            {total ? (
              LEVELS.map((p) => {
                const ms = split[String(p) as keyof Split];
                return ms > 0 ? (
                  <span
                    key={p}
                    className={cx("apps-seg", productivityClass(p))}
                    style={{ flexGrow: ms }}
                    title={`${PRODUCTIVITY_LABEL[p]} · ${fmtDuration(ms)} · ${fmtShare(ms, total)}`}
                  />
                ) : null;
              })
            ) : (
              <span className="apps-seg empty" />
            )}
          </div>
          <dl className="apps-legend">
            {LEVELS.map((p) => (
              <div key={p}>
                <dt>
                  <span className={cx("swatch", productivityClass(p))} aria-hidden />
                  {PRODUCTIVITY_LABEL[p]}
                </dt>
                <dd className="tabular">{fmtDuration(split[String(p) as keyof Split])}</dd>
              </div>
            ))}
          </dl>
        </div>
    </section>
  );
}

// ------------------------------------------------------------------ Row

function Row({ e, total, custom, onOpen }: { e: EntityTotal; total: number; custom: boolean; onOpen: () => void }) {
  const name = displayName(e);
  return (
    <li>
      <button className="apps-row" aria-haspopup="dialog" onClick={onOpen}>
        <Avatar name={name} productivity={e.productivity} size={46} iconKey={e.kind === "app" ? e.key : undefined} siteKey={e.kind === "site" ? e.key : undefined} />
        <span className="apps-row-main">
          <span className="apps-row-title">
            <span className="apps-row-name">{name}</span>
            {custom && <span className="badge brand">Custom</span>}
          </span>
          <span className="apps-row-sub">
            {categoryLabel(e.category)} · {e.kind === "site" ? "Site" : "App"}
            <span className="sr-only">, {PRODUCTIVITY_LABEL[e.productivity]}</span>
          </span>
        </span>
        <span className="apps-row-trail">
          <span className="apps-row-time tabular">{fmtDuration(e.ms)}</span>
          <span className="apps-row-pct tabular">{fmtShare(e.ms, total)}</span>
        </span>
        <ChevronRight className="apps-row-chev" aria-hidden />
      </button>
    </li>
  );
}
