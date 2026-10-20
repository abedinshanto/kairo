import { Check, Clock, Ellipsis, Layers, Pencil, Play, Plus, RotateCcw, Timer, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Buddy, type BuddyMood } from "../components/Buddy";
import { PageTitle, PillTabs, SlideToConfirm, Stepper, TopBar, cx } from "../components/ui";
import { backend } from "../lib/backend";
import { useQuery } from "../lib/hooks";
import { useApp } from "../lib/store";
import { addDays, fmtDuration, fmtShortDay, MINUTE, relativeDayLabel, startOfDay } from "../lib/time";
import type { Task } from "../lib/types";
import "../styles/views/tasks.css";

type Tab = "todo" | "done";

const MAX_ESTIMATE = 12;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const blocksLeft = (t: Task) => Math.max(0, t.estimate - t.pomodoros);

// ------------------------------------------------------------------ Actions (shared by hero, rows and menus)

/** Run a backend call, surface failures as a toast, then refresh every query. */
async function run(what: string, fn: () => Promise<unknown>): Promise<boolean> {
  let ok = true;
  try {
    await fn();
  } catch (err) {
    ok = false;
    useApp.getState().toast({ title: `Couldn't ${what}`, body: String(err), tone: "warning" });
  }
  useApp.getState().bumpData();
  return ok;
}

const actions = {
  setDone: (task: Task, done: boolean) =>
    run(done ? "complete the task" : "reopen the task", async () => {
      await backend.taskUpdate(task.id, { done });
      const { timer, setIntention, toast } = useApp.getState();
      // A finished task shouldn't stay linked to an idle timer; never touch a live session.
      if (done && timer?.taskId === task.id && timer.status === "idle") {
        await setIntention(timer.intention === task.title ? "" : timer.intention, null);
      }
      if (done) toast({ title: "Nice work!", body: `“${task.title}” is done.`, tone: "success" });
    }),

  rename: (task: Task, title: string) => {
    const next = title.trim();
    if (!next || next === task.title) return Promise.resolve(true);
    return run("rename the task", async () => {
      await backend.taskUpdate(task.id, { title: next });
      const { timer, setIntention } = useApp.getState();
      if (timer?.taskId === task.id && timer.intention === task.title) await setIntention(next, task.id);
    });
  },

  estimate: (task: Task, estimate: number) => run("change the estimate", () => backend.taskUpdate(task.id, { estimate })),

  remove: (task: Task) => run("delete the task", () => backend.taskDelete(task.id)),

  /** Make this task the timer's intention and jump to the timer. */
  async focus(task: Task) {
    const { timer, setIntention, setView } = useApp.getState();
    if (timer?.taskId !== task.id) {
      const ok = await run("link the task", () => setIntention(task.title, task.id));
      if (!ok) return;
    }
    setView("home");
  },
};

// ------------------------------------------------------------------ Screen

export function TasksView() {
  const { data } = useQuery(() => backend.tasksList(), []);
  const timer = useApp((s) => s.timer)!;
  const focusMin = useApp((s) => s.settings.focusMinutes);
  const setView = useApp((s) => s.setView);
  const [tab, setTab] = useState<Tab>("todo");

  const loaded = data !== undefined;
  const all = data ?? [];
  const open = all.filter((t) => !t.done);
  const done = all.filter((t) => t.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const hero = open.find((t) => t.id === timer.taskId) ?? open[0];
  const rest = open.filter((t) => t !== hero);
  const left = open.reduce((a, t) => a + blocksLeft(t), 0);

  const [headline, sub] = !loaded
    ? ["Tasks", "Loading your plan"]
    : !open.length
      ? ["All clear", done.length ? `${plural(done.length, "task")} wrapped up` : "Nothing waiting on you"]
      : left
        ? [`${plural(left, "block")} to go`, `About ${fmtDuration(left * focusMin * MINUTE)} of focus planned`]
        : ["Estimates met", "Mark tasks done when they're finished"];

  return (
    <div className="tasks">
      <TopBar
        left={
          <div style={{ minWidth: 0 }}>
            <div className="who-name">{headline}</div>
            <div className="who-sub">{sub}</div>
          </div>
        }
        right={
          <button className="circle-btn" aria-label="Open the timer" title="Timer" onClick={() => setView("home")}>
            <Timer />
          </button>
        }
      />

      <div className="tasks-grid">
        <section className="tasks-main">
          <PageTitle strong="Your tasks," dim="one block at a time." />
          <div className="tasks-tabs">
            <PillTabs<Tab>
              label="Task lists"
              value={tab}
              onChange={setTab}
              options={[
                { value: "todo", label: "To do", count: loaded ? open.length : undefined },
                { value: "done", label: "Done", count: loaded ? done.length : undefined },
              ]}
            />
          </div>

          {loaded &&
            (tab === "todo" ? (
              hero ? (
                <HeroTask key={hero.id} task={hero} />
              ) : (
                <EmptyHero cleared={done.length > 0} />
              )
            ) : (
              <DoneSummary tasks={done} />
            ))}
        </section>

        {loaded && (
          <aside className="tasks-side">
            {tab === "todo" ? (
              <>
                <Composer />
                {rest.length > 0 && (
                  <div className="card task-card">
                    <div className="task-card-head">
                      <div className="card-title">Up next</div>
                      <div className="card-sub">
                        {plural(rest.length, "more task")} · {plural(rest.reduce((a, t) => a + blocksLeft(t), 0), "block")} left
                      </div>
                    </div>
                    <ul className="task-list">
                      {rest.map((t) => (
                        <TaskRow key={t.id} task={t} />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              done.length > 0 && (
                <div className="card task-card">
                  <div className="task-card-head">
                    <div className="card-title">Wrapped up</div>
                    <div className="card-sub">Tap a check to bring a task back</div>
                  </div>
                  <ul className="task-list">
                    {done.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </ul>
                </div>
              )
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Hero: the one task that matters right now

function HeroTask({ task }: { task: Task }) {
  const timer = useApp((s) => s.timer)!;
  const focusMin = useApp((s) => s.settings.focusMinutes);
  const [editing, setEditing] = useState(false);
  const inFocus = timer.taskId === task.id;
  const left = blocksLeft(task);
  const mood: BuddyMood =
    inFocus && timer.status === "running" && timer.phase === "focus" ? "focus" : task.pomodoros >= task.estimate ? "happy" : "idle";

  return (
    <div className="stacked task-stack">
      <article className="card hero task-hero" aria-label={`Up first: ${task.title}`}>
        <div className="task-hero-top">
          <span className="task-hero-buddy">
            <Buddy mood={mood} tone="cloud" size={76} />
          </span>
          <div className="task-hero-actions">
            <span className="chip on-brand">
              <Clock />
              {task.focusMs > 0 ? `${fmtDuration(task.focusMs)} focused` : "Not started"}
            </span>
            <TaskMenu task={task} onRename={() => setEditing(true)} onBrand />
          </div>
        </div>

        <div className="task-hero-text">
          <div className="task-hero-tags">
            <span className="badge white">
              <Layers />
              {plural(task.estimate, "block")}
            </span>
            {inFocus && (
              <span className="badge glass">
                <span className="live-dot" aria-hidden />
                In focus
              </span>
            )}
          </div>
          <TaskTitle task={task} editing={editing} setEditing={setEditing} variant="hero" />
        </div>

        <div className="task-hero-progress">
          <BlockBar done={task.pomodoros} estimate={task.estimate} />
          <div className="task-hero-caption">
            <span>
              <strong>
                {task.pomodoros} of {task.estimate}
              </strong>{" "}
              blocks done
            </span>
            <span>
              {left
                ? `About ${fmtDuration(left * focusMin * MINUTE)} to go`
                : task.pomodoros > task.estimate
                  ? `${plural(task.pomodoros - task.estimate, "block")} over`
                  : "Estimate reached"}
            </span>
          </div>
        </div>

        <div className="task-hero-foot">
          <SlideToConfirm label="Slide to mark done" onConfirm={() => void actions.setDone(task, true)} />
          <button
            className="circle-btn on-brand task-hero-play"
            aria-label={inFocus ? "Back to the timer" : `Focus on ${task.title}`}
            title={inFocus ? "Back to the timer" : "Focus on this"}
            onClick={() => void actions.focus(task)}
          >
            <Play className="fill" />
          </button>
        </div>
      </article>
    </div>
  );
}

function EmptyHero({ cleared }: { cleared: boolean }) {
  return (
    <div className="stacked task-stack">
      <div className="card hero task-hero task-hero-empty">
        <Buddy mood={cleared ? "happy" : "idle"} tone="cloud" size={128} />
        <h2 className="task-empty-title">{cleared ? "All clear!" : "A fresh page"}</h2>
        <p className="task-empty-copy">{cleared ? "Every task is done. Add the next one whenever you're ready." : "Add a task and guess how many focus blocks it needs."}</p>
      </div>
    </div>
  );
}

function DoneSummary({ tasks }: { tasks: Task[] }) {
  const focus = tasks.reduce((a, t) => a + t.focusMs, 0);
  const blocks = tasks.reduce((a, t) => a + t.pomodoros, 0);
  if (!tasks.length) {
    return (
      <div className="card tint task-summary is-empty">
        <Buddy mood="idle" tone="blue" size={96} />
        <div>
          <div className="card-title">Nothing done yet</div>
          <p className="task-summary-copy">Slide a task to done and it will land here.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="card tint task-summary">
      <div className="task-summary-text">
        <div className="big-number">
          {tasks.length}
          <small>{tasks.length === 1 ? "task done" : "tasks done"}</small>
        </div>
        <p className="task-summary-copy">
          {focus > 0 ? `${fmtDuration(focus)} of focus across ${plural(blocks, "block")}.` : "Every one of them counts."} Lovely work.
        </p>
      </div>
      <Buddy mood="happy" tone="blue" size={104} />
    </div>
  );
}

// ------------------------------------------------------------------ Add a task

function Composer() {
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState(2);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    if (await run("add the task", () => backend.taskCreate(t, estimate))) setTitle("");
    setBusy(false);
  };

  return (
    <div className="composer-wrap">
      <form className="composer" onSubmit={submit}>
        <input
          className="composer-input"
          placeholder="Add a task…"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="New task"
          enterKeyHint="done"
        />
        <div className="composer-trail">
          <Stepper label="estimated blocks" value={estimate} onChange={setEstimate} min={1} max={MAX_ESTIMATE} format={(v) => plural(v, "block")} />
          <button className="circle-btn brand" type="submit" aria-label="Add task" title="Add task (Enter)" disabled={!title.trim() || busy}>
            <Plus />
          </button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ Calm list rows

function TaskRow({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const toggle = () => {
    setLeaving(true);
    window.setTimeout(() => void actions.setDone(task, !task.done).finally(() => setLeaving(false)), 280);
  };

  const when = task.completedAt ? doneWhen(task.completedAt) : null;

  return (
    <li className={cx("task-row", task.done && "is-done", leaving && "is-leaving", editing && "is-editing")}>
      <button
        type="button"
        className="task-check"
        aria-label={task.done ? `Move “${task.title}” back to To do` : `Mark “${task.title}” as done`}
        title={task.done ? "Not done yet" : "Mark as done"}
        onClick={toggle}
        disabled={leaving}
      >
        <span className="task-check-ring">
          <Check />
        </span>
      </button>

      <div className="task-main">
        <TaskTitle task={task} editing={editing} setEditing={setEditing} variant="row" />
        {!editing && (
          <div className="task-sub">
            {task.done ? (
              <span className="task-sub-text">
                {[task.pomodoros > 0 && plural(task.pomodoros, "block"), task.focusMs > 0 && fmtDuration(task.focusMs), when ?? "Finished"].filter(Boolean).join(" · ")}
              </span>
            ) : (
              <>
                <Dots done={task.pomodoros} estimate={task.estimate} />
                <span className="task-sub-text">
                  {task.pomodoros} of {plural(task.estimate, "block")}
                  {task.focusMs > 0 && <span className="task-sub-time"> · {fmtDuration(task.focusMs)}</span>}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {!editing && (
        <div className="task-actions">
          {!task.done && (
            <button className="circle-btn soft task-play" aria-label={`Focus on ${task.title}`} title="Focus on this" onClick={() => void actions.focus(task)}>
              <Play className="fill" />
            </button>
          )}
          <TaskMenu task={task} onRename={() => setEditing(true)} />
        </div>
      )}
    </li>
  );
}

function doneWhen(at: number): string {
  const day = startOfDay(at);
  const label = day >= addDays(startOfDay(Date.now()), -6) ? relativeDayLabel(day) : fmtShortDay(at);
  return `Finished ${label === "Today" || label === "Yesterday" ? label.toLowerCase() : label}`;
}

/** Inline-renamable title: double-click (or "Rename" in the menu), Enter saves, Esc cancels. */
function TaskTitle({
  task,
  editing,
  setEditing,
  variant,
}: {
  task: Task;
  editing: boolean;
  setEditing: (v: boolean) => void;
  variant: "hero" | "row";
}) {
  const [value, setValue] = useState(task.title);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) {
      cancelled.current = false;
      setValue(task.title);
    }
  }, [editing, task.title]);

  const finish = () => {
    setEditing(false);
    if (!cancelled.current) void actions.rename(task, value);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      cancelled.current = true;
      e.currentTarget.blur();
    }
  };
  const canEdit = !task.done;

  if (editing && variant === "hero") {
    return (
      <textarea
        className="task-hero-title task-hero-edit"
        rows={1}
        value={value}
        maxLength={120}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value.replace(/\n/g, ""))}
        onBlur={finish}
        onKeyDown={onKeyDown}
        aria-label="Task title"
      />
    );
  }
  if (editing) {
    return (
      <input
        className="input pill task-edit"
        value={value}
        maxLength={120}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={finish}
        onKeyDown={onKeyDown}
        aria-label="Task title"
      />
    );
  }
  return variant === "hero" ? (
    <h2 className="task-hero-title" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
      {task.title}
    </h2>
  ) : (
    <span className="task-title" onDoubleClick={() => canEdit && setEditing(true)} title={canEdit ? "Double-click to rename" : undefined}>
      {task.title}
    </span>
  );
}

// ------------------------------------------------------------------ Overflow menu (rename · estimate · delete)

function TaskMenu({ task, onRename, onBrand }: { task: Task; onRename: () => void; onBrand?: boolean }) {
  const [open, setOpen] = useState(false);
  const [estimate, setEstimate] = useState(task.estimate);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setEstimate(task.estimate);
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      wrap.current?.querySelector<HTMLElement>(".task-more")?.focus();
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className={cx("task-menu-wrap", open && "open")} ref={wrap}>
      <button
        type="button"
        className={cx("circle-btn task-more", onBrand ? "glass" : "ghost")}
        aria-label={`More options for ${task.title}`}
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Ellipsis />
      </button>
      {open && (
        <div className="task-menu" role="menu" ref={menu} aria-label={task.title}>
          {task.done ? (
            <button type="button" role="menuitem" onClick={pick(() => void actions.setDone(task, false))}>
              <RotateCcw /> Back to To do
            </button>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={pick(onRename)}>
                <Pencil /> Rename
              </button>
              <div className="task-menu-est">
                <span>Blocks</span>
                <Stepper
                  label="estimated blocks"
                  value={estimate}
                  min={1}
                  max={Math.max(MAX_ESTIMATE, task.estimate)}
                  onChange={(v) => {
                    setEstimate(v);
                    void actions.estimate(task, v);
                  }}
                />
              </div>
            </>
          )}
          <button type="button" role="menuitem" className="danger" onClick={pick(() => void actions.remove(task))}>
            <Trash2 /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Block progress

/** Hero: one segment per estimated block, filled as blocks complete. */
function BlockBar({ done, estimate }: { done: number; estimate: number }) {
  const total = Math.min(Math.max(estimate, done), 16);
  return (
    <div className="block-bar" role="img" aria-label={`${done} of ${estimate} blocks done`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx(i < done && "on", i >= estimate && "over")} />
      ))}
    </div>
  );
}

/** Rows: small dots when they fit, a mini meter when the estimate is large. */
function Dots({ done, estimate }: { done: number; estimate: number }) {
  const total = Math.max(estimate, done);
  if (total > 8) {
    return (
      <span className="task-mini-meter" aria-hidden>
        <span style={{ width: `${Math.min(100, (done / Math.max(1, estimate)) * 100)}%` }} />
      </span>
    );
  }
  return (
    <span className="task-dots" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx(i < done && "on")} />
      ))}
    </span>
  );
}
