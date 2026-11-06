import { Check, Shapes, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { backend } from "../lib/backend";
import { CATEGORIES, categoryLabel, defaultProductivity, entityName, PRODUCTIVITY_LABEL } from "../lib/categories";
import { confirmDialog } from "../lib/dialogs";
import { useQuery } from "../lib/hooks";
import { useApp } from "../lib/store";
import { addDays, fmtDuration, fmtTime, MINUTE } from "../lib/time";
import type { ActivitySpan, EntityTotal, FocusSession } from "../lib/types";
import "../styles/history-edit.css";
import { Avatar, Sheet, cx } from "./ui";

// Fixing the record: log time Kairo couldn't see, move or delete an entry,
// and point a focus block at the right task. Opened from the Stats timeline.

/** One stretch of the same app or site: back-to-back spans read as one entry. */
export interface SpanRun {
  ids: number[];
  start: number;
  end: number;
  first: ActivitySpan;
}

/** The entry around `hit`: neighbours of the same app and site with no gap between. */
export function runAround(spans: ActivitySpan[], hit: ActivitySpan): SpanRun {
  const same = (s: ActivitySpan) => s.appId === hit.appId && s.domain === hit.domain;
  let i = spans.indexOf(hit);
  let j = i;
  while (i > 0 && same(spans[i - 1]) && spans[i].start - spans[i - 1].end < 1000) i--;
  while (j < spans.length - 1 && same(spans[j + 1]) && spans[j + 1].start - spans[j].end < 1000) j++;
  const run = spans.slice(i, j + 1);
  return { ids: run.map((s) => s.id), start: run[0].start, end: run[run.length - 1].end, first: run[0] };
}

/** "09:05" for a time input. */
const clock = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** A time input's "HH:MM" on `day`. */
const atClock = (day: number, value: string): number | null => {
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(day);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.getTime();
};

/** Start and end on one day; an end at or before the start means just past midnight. */
function TimeRange({ day, start, end, onChange }: { day: number; start: number; end: number; onChange: (start: number, end: number) => void }) {
  return (
    <div className="hx-times">
      <label className="hx-time">
        <span>From</span>
        <input
          className="input"
          type="time"
          value={clock(start)}
          onChange={(e) => {
            const t = atClock(day, e.target.value);
            if (t !== null) onChange(t, end);
          }}
        />
      </label>
      <label className="hx-time">
        <span>To</span>
        <input
          className="input"
          type="time"
          value={clock(end)}
          onChange={(e) => {
            let t = atClock(day, e.target.value);
            if (t === null) return;
            if (t <= start) t = atClock(addDays(day, 1), e.target.value)!;
            onChange(start, t);
          }}
        />
      </label>
    </div>
  );
}

/** Save/delete row, shared by the sheets. */
function Actions({ children }: { children: ReactNode }) {
  return <div className="hx-actions">{children}</div>;
}

async function attempt(what: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    useApp.getState().bumpData();
    return true;
  } catch (err) {
    useApp.getState().toast({ title: `Couldn't ${what}`, body: String(err), tone: "warning" });
    return false;
  }
}

// ------------------------------------------------------------------ An entry from the timeline

export function SpanSheet({ run, onClose, onCategory }: { run: SpanRun; onClose: () => void; onCategory: (e: EntityTotal) => void }) {
  const s = run.first;
  const site = !!s.domain;
  const name = entityName(site ? "site" : "app", s.domain ?? s.appId, s.appName);
  const [start, setStart] = useState(run.start);
  const [end, setEnd] = useState(run.end);
  const [busy, setBusy] = useState(false);
  const changed = start !== run.start || end !== run.end;
  const valid = end > start;

  const save = async () => {
    setBusy(true);
    const ok = await attempt("change the entry", async () => {
      // One entry from here on: the pieces after the first go, the first takes the times.
      for (const id of run.ids.slice(1)) await backend.spanDelete(id);
      await backend.spanUpdate(run.ids[0], start, end);
    });
    setBusy(false);
    if (ok) {
      useApp.getState().toast({ title: "Entry updated", body: `${name}, ${fmtTime(start)} – ${fmtTime(end)}.`, tone: "success" });
      onClose();
    }
  };

  const remove = async () => {
    const ok = await confirmDialog(`Delete ${name} from ${fmtTime(run.start)} to ${fmtTime(run.end)}? Kairo keeps tracking it from now on.`, {
      title: "Delete entry",
      okLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const done = await attempt("delete the entry", async () => {
      for (const id of run.ids) await backend.spanDelete(id);
    });
    setBusy(false);
    if (done) onClose();
  };

  const entity: EntityTotal = {
    key: s.domain ?? s.appId,
    kind: site ? "site" : "app",
    name: s.domain ?? s.appName,
    appName: s.appName,
    category: s.category,
    productivity: s.productivity,
    ms: run.end - run.start,
    visits: 1,
    lastSeen: run.end,
  };

  return (
    <Sheet label={`${name} entry`} onClose={onClose}>
      <div className={cx("hx", busy && "busy")}>
        <header className="hx-head">
          <Avatar name={name} productivity={s.productivity} size={52} iconKey={site ? undefined : s.appId} siteKey={site ? s.domain! : undefined} />
          <div className="hx-head-text">
            <h2 className="title">{name}</h2>
            <p className="card-sub">
              {categoryLabel(s.category)} · {PRODUCTIVITY_LABEL[s.productivity]}
              {s.source === "manual" ? " · added by you" : ""}
            </p>
          </div>
        </header>
        <TimeRange
          day={run.start}
          start={start}
          end={end}
          onChange={(a, b) => {
            setStart(a);
            setEnd(b);
          }}
        />
        <p className={cx("hx-note", !valid && "bad")}>
          {valid ? `${fmtDuration(end - start)}. Anything else recorded in that time makes way.` : "The end has to come after the start."}
        </p>
        <Actions>
          <button className="btn btn-soft" disabled={busy} onClick={() => onCategory(entity)} title="Category and how it counts, for all of its time">
            <Shapes /> Category
          </button>
          <button className="btn btn-soft hx-danger" disabled={busy} onClick={() => void remove()}>
            <Trash2 /> Delete
          </button>
          <button className="btn btn-primary hx-save" disabled={busy || !changed || !valid} onClick={() => void save()}>
            <Check /> Save
          </button>
        </Actions>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Time Kairo couldn't see

const NAMES = ["Meeting", "Phone call", "Reading", "Paperwork", "Workshop", "Commute"];
const NAME_CATEGORY: Record<string, string> = {
  Meeting: "meetings",
  "Phone call": "communication",
  Reading: "learning",
  Paperwork: "productivity",
  Workshop: "learning",
  Commute: "other",
};

export function AddTimeSheet({ day, onClose }: { day: number; onClose: () => void }) {
  // Default: the hour before now (today), or mid-morning (another day).
  const now = Date.now();
  const today = now < addDays(day, 1);
  const end0 = today ? Math.floor(now / (5 * MINUTE)) * 5 * MINUTE : atClock(day, "10:00")!;
  const [name, setName] = useState("");
  const [category, setCategory] = useState("meetings");
  const [start, setStart] = useState(end0 - 60 * MINUTE);
  const [end, setEnd] = useState(end0);
  const [busy, setBusy] = useState(false);
  const valid = end > start && !!name.trim();

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const ok = await attempt("add the time", () =>
      backend.spanAdd({ start, end, name: name.trim(), category, productivity: defaultProductivity(category) }),
    );
    setBusy(false);
    if (ok) {
      useApp.getState().toast({ title: "Time added", body: `${name.trim()}, ${fmtDuration(end - start)}.`, tone: "success" });
      onClose();
    }
  };

  return (
    <Sheet label="Add time" onClose={onClose}>
      <form
        className={cx("hx", busy && "busy")}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <header className="hx-head plain">
          <div className="hx-head-text">
            <h2 className="title">Add time</h2>
            <p className="card-sub">A meeting, a call, time away from the screen. It counts like everything else.</p>
          </div>
        </header>
        <label className="hx-field">
          <span>What was it?</span>
          <input className="input" value={name} maxLength={80} autoFocus placeholder="Design review" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="hx-chips" role="group" aria-label="Suggestions">
          {NAMES.map((n) => (
            <button
              key={n}
              type="button"
              className={cx("chip", name === n && "active")}
              onClick={() => {
                setName(n);
                setCategory(NAME_CATEGORY[n] ?? category);
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <TimeRange
          day={day}
          start={start}
          end={end}
          onChange={(a, b) => {
            setStart(a);
            setEnd(b);
          }}
        />
        <div className="hx-field">
          <span>Category</span>
          <div className="hx-chips" role="group" aria-label="Category">
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={cx("chip", category === c.id && "active")} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <p className={cx("hx-note", end <= start && "bad")}>
          {end > start ? `${fmtDuration(end - start)}, counted as ${PRODUCTIVITY_LABEL[defaultProductivity(category)].toLowerCase()}. It replaces anything recorded then.` : "The end has to come after the start."}
        </p>
        <Actions>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary hx-save" disabled={busy || !valid}>
            <Check /> Add
          </button>
        </Actions>
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ A focus block

export function SessionSheet({ session, onClose }: { session: FocusSession; onClose: () => void }) {
  const { data: tasks } = useQuery(() => backend.tasksList(), []);
  const [taskId, setTaskId] = useState<number | null>(session.taskId);
  const [intention, setIntention] = useState(session.intention);
  const [busy, setBusy] = useState(false);
  const changed = taskId !== session.taskId || intention.trim() !== session.intention.trim();
  // Done tasks stay pickable: an old block may well belong to one.
  const choices = [...(tasks ?? [])].sort((a, b) => Number(a.done) - Number(b.done));

  const save = async () => {
    setBusy(true);
    const ok = await attempt("change the block", () => backend.sessionUpdate(session.id, taskId, intention.trim()));
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    const ok = await confirmDialog(`Delete this ${fmtDuration(session.actualMs)} focus block? It comes off your focus time and streak.`, {
      title: "Delete focus block",
      okLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const done = await attempt("delete the block", () => backend.sessionDelete(session.id));
    setBusy(false);
    if (done) onClose();
  };

  return (
    <Sheet label="Focus block" onClose={onClose}>
      <div className={cx("hx", busy && "busy")}>
        <header className="hx-head plain">
          <div className="hx-head-text">
            <h2 className="title">Focus block</h2>
            <p className="card-sub">
              {fmtTime(session.start)} – {fmtTime(session.end)} · {fmtDuration(session.actualMs)} · {session.completed ? "completed" : "ended early"}
            </p>
          </div>
        </header>
        <label className="hx-field">
          <span>Counts toward</span>
          <select
            className="select hx-select"
            value={taskId ?? ""}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              const before = choices.find((t) => t.id === taskId);
              const next = choices.find((t) => t.id === id);
              setTaskId(id);
              // The focus line follows the task, unless it was something else.
              if (next && (!intention.trim() || intention.trim() === before?.title)) setIntention(next.title);
            }}
          >
            <option value="">No task</option>
            {choices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.done ? `${t.title} (done)` : t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="hx-field">
          <span>Focus</span>
          <input className="input" value={intention} maxLength={200} placeholder="What it was for" onChange={(e) => setIntention(e.target.value)} />
        </label>
        <Actions>
          <button className="btn btn-soft hx-danger" disabled={busy} onClick={() => void remove()}>
            <Trash2 /> Delete
          </button>
          <button className="btn btn-primary hx-save" disabled={busy || !changed} onClick={() => void save()}>
            <Check /> Save
          </button>
        </Actions>
      </div>
    </Sheet>
  );
}
