import {
  ArrowUpToLine,
  CalendarDays,
  Check,
  Clock,
  Ellipsis,
  GripVertical,
  ListChecks,
  LoaderCircle,
  Mic,
  Music2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Square,
  StickyNote,
  Timer,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { Buddy, type BuddyMood } from "../components/Buddy";
import { PageTitle, PillTabs, SlideToConfirm, Stepper, TopBar, cx } from "../components/ui";
import { backend } from "../lib/backend";
import { confirmDialog } from "../lib/dialogs";
import { useQuery } from "../lib/hooks";
import { PRESETS } from "../lib/audio/engine";
import { dueFromWords, parseSpokenTask, splitDue } from "../lib/spoken";
import { useApp } from "../lib/store";
import { addDays, dueInfo, fmtDay, fmtDuration, fmtShortDay, fromDateInput, MINUTE, relativeDayLabel, startOfDay, toDateInput } from "../lib/time";
import type { Task } from "../lib/types";
import { useDictation } from "../lib/voice";
import "../styles/views/tasks.css";

type Tab = "todo" | "today" | "done";

const MAX_ESTIMATE = 12;
const COMPOSER_ID = "task-composer-input";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const blocksLeft = (t: Task) => Math.max(0, t.estimate - t.pomodoros);

/**
 * The hero stays put while you add tasks (both backends list newest first, so
 * "first open task" alone would swap it out under you). Lives at module level
 * so it also survives switching screens.
 */
let stickyHeroId: number | null = null;

/** `#/tasks?tab=done` deep-links (and survives a reload). */
const tabFromHash = (): Tab => {
  const m = window.location.hash.match(/[?&]tab=(done|today)\b/);
  return m ? (m[1] as Tab) : "todo";
};
function writeTab(tab: Tab) {
  const next = tab === "todo" ? "#/tasks" : `#/tasks?tab=${tab}`;
  if (window.location.hash !== next) window.history.replaceState(null, "", next);
}

// ------------------------------------------------------------------ Actions (shared by hero, rows and menus)

/** Due today, or overdue. */
const dueByToday = (t: Task) => t.dueDay !== null && t.dueDay <= startOfDay(Date.now());

/** `subset`, re-ordered, put back into the slots its tasks held in `order`. */
function reorderWithin(order: number[], subset: number[]): number[] {
  const mine = new Set(subset);
  let i = 0;
  return order.map((id) => (mine.has(id) ? subset[i++] : id));
}

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

  due: (task: Task, dueDay: number | null) => (task.dueDay === dueDay ? Promise.resolve(true) : run("change the due date", () => backend.taskUpdate(task.id, { dueDay }))),

  note: (task: Task, notes: string) => {
    const next = notes.trim();
    if (next === (task.notes ?? "")) return Promise.resolve(true);
    return run("save the note", () => backend.taskUpdate(task.id, { notes: next || null }));
  },

  sound: (task: Task, sound: string | null) => run("change the sound", () => backend.taskUpdate(task.id, { sound })),

  async remove(task: Task) {
    const ok = await confirmDialog(`Delete “${task.title}”? Its focus time stays in your stats.`, {
      title: "Delete task",
      okLabel: "Delete",
      destructive: true,
    });
    return ok && run("delete the task", () => backend.taskDelete(task.id));
  },

  /** Change a task's priority: `order` is the open tasks' ids, highest first. */
  move(task: Task, order: number[], to: "top") {
    if (!order.includes(task.id)) return Promise.resolve(false);
    const next = order.filter((id) => id !== task.id);
    if (to === "top") next.unshift(task.id);
    return run("reorder the tasks", () => backend.tasksReorder(next));
  },

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
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const setTab = (t: Tab) => {
    setTabState(t);
    writeTab(t);
  };

  const loaded = data !== undefined;
  const all = data ?? [];
  const open = all.filter((t) => !t.done);
  const today = open.filter(dueByToday);
  const done = all.filter((t) => t.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  // The Today tab is the same list, narrowed to what's due.
  const shown = tab === "today" ? today : open;
  // Hero: the task linked to the timer, else the one already on screen, else the first open task.
  const hero = shown.find((t) => t.id === timer.taskId) ?? shown.find((t) => t.id === stickyHeroId) ?? shown[0];
  const rest = shown.filter((t) => t !== hero);
  // Priority order: the first four are the 1–4 buttons on the timer.
  const order = open.map((t) => t.id);
  const left = open.reduce((a, t) => a + blocksLeft(t), 0);
  const planned = open.reduce((a, t) => a + t.estimate, 0);
  const progressed = open.reduce((a, t) => a + Math.min(t.pomodoros, t.estimate), 0);

  useLayoutEffect(() => {
    if (loaded) stickyHeroId = hero?.id ?? null;
  }, [loaded, hero?.id]);

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
          <>
            <PlanRing done={progressed} total={planned} allDone={loaded && !open.length && done.length > 0} />
            <div style={{ minWidth: 0 }}>
              <div className="who-name">{headline}</div>
              <div className="who-sub">{sub}</div>
            </div>
          </>
        }
        right={
          <button className="circle-btn" aria-label="Open the timer" title="Timer" onClick={() => setView("home")}>
            <Timer />
          </button>
        }
      />

      <header className="tasks-head">
        <PageTitle strong="Your tasks," dim="one block at a time." />
        <div className="tasks-tabs">
          <PillTabs<Tab>
            label="Task lists"
            value={tab}
            onChange={setTab}
            options={[
              { value: "todo", label: "To do", count: loaded ? open.length : undefined },
              { value: "today", label: "Today", count: loaded ? today.length : undefined },
              { value: "done", label: "Done", count: loaded ? done.length : undefined },
            ]}
          />
        </div>
      </header>

      <div className="tasks-grid">
        <section className="tasks-main">
          {loaded &&
            (tab !== "done" ? (
              hero ? (
                <HeroTask key={hero.id} task={hero} order={order} />
              ) : tab === "today" ? (
                <EmptyToday others={open.length} />
              ) : (
                <EmptyHero cleared={done.length > 0} />
              )
            ) : (
              <DoneSummary tasks={done} />
            ))}
        </section>

        {loaded && (
          <aside className="tasks-side">
            {tab !== "done" ? (
              <>
                <Composer key={tab} defaultDue={tab === "today" ? startOfDay(Date.now()) : null} />
                {rest.length > 0 && (
                  <div className="card task-card">
                    <div className="task-card-head">
                      <div className="card-title">{tab === "today" ? "Also today" : "Up next"}</div>
                    </div>
                    <SortableTasks tasks={rest} order={order} />
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

/** "1"–"4" for the tasks the timer's number buttons pick, else nothing. */
const rankOf = (task: Task, order: number[]) => {
  const i = order.indexOf(task.id);
  return i >= 0 && i < 4 ? i + 1 : null;
};

function HeroTask({ task, order }: { task: Task; order: number[] }) {
  const timer = useApp((s) => s.timer)!;
  const focusMin = useApp((s) => s.settings.focusMinutes);
  const [editing, setEditing] = useState(false);
  const [noting, setNoting] = useState(false);
  const inFocus = timer.taskId === task.id;
  const left = blocksLeft(task);
  const rank = rankOf(task, order);
  const mood: BuddyMood =
    inFocus && timer.status === "running" && timer.phase === "focus" ? "focus" : task.pomodoros >= task.estimate ? "happy" : "idle";

  return (
    <div className="task-stack">
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
            <TaskMenu task={task} order={order} onRename={() => setEditing(true)} onNote={() => setNoting(true)} onBrand />
          </div>
        </div>

        <div className="task-hero-text">
          {/* The block bar below carries the estimate; the tag only marks a task the timer is on. */}
          {(inFocus || rank || task.dueDay !== null) && (
            <div className="task-hero-tags">
              {rank && (
                <span className="badge glass task-rank-badge" title={`Press ${rank} on the timer to focus on this`}>
                  Task {rank}
                </span>
              )}
              {task.dueDay !== null && <DueBadge day={task.dueDay} glass />}
              {inFocus && (
                <span className="badge glass">
                  <span className="live-dot" aria-hidden />
                  In focus
                </span>
              )}
            </div>
          )}
          <TaskTitle task={task} editing={editing} setEditing={setEditing} variant="hero" />
          {noting ? (
            <NoteEditor task={task} onDone={() => setNoting(false)} variant="hero" />
          ) : (
            task.notes && (
              <p className="task-hero-note" onDoubleClick={() => setNoting(true)} title="Double-click to edit the note">
                {task.notes}
              </p>
            )
          )}
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
    <div className="task-stack">
      <div className="card hero task-hero task-hero-empty">
        <Buddy mood={cleared ? "happy" : "idle"} tone="cloud" size={128} />
        <h2 className="task-empty-title">{cleared ? "All clear!" : "A fresh page"}</h2>
        <p className="task-empty-copy">{cleared ? "Every task is done. Add the next one whenever you're ready." : "Add a task and guess how many focus blocks it needs."}</p>
        <button
          type="button"
          className="btn btn-on-brand task-empty-cta"
          onClick={() => {
            const input = document.getElementById(COMPOSER_ID);
            input?.scrollIntoView({ behavior: "smooth", block: "center" });
            input?.focus({ preventScroll: true });
          }}
        >
          <Plus /> {cleared ? "Add the next one" : "Add your first task"}
        </button>
      </div>
    </div>
  );
}

function EmptyToday({ others }: { others: number }) {
  return (
    <div className="task-stack">
      <div className="card hero task-hero task-hero-empty">
        <Buddy mood="idle" tone="cloud" size={128} />
        <h2 className="task-empty-title">Nothing due today</h2>
        <p className="task-empty-copy">
          {others
            ? "Give a task a day from its ••• menu, or add one here: it's due today."
            : "Add a task here and it's due today. Saying “…tomorrow” or “by Friday” works too."}
        </p>
        <button
          type="button"
          className="btn btn-on-brand task-empty-cta"
          onClick={() => {
            const input = document.getElementById(COMPOSER_ID);
            input?.scrollIntoView({ behavior: "smooth", block: "center" });
            input?.focus({ preventScroll: true });
          }}
        >
          <Plus /> Add something for today
        </button>
      </div>
    </div>
  );
}

/** Top-bar avatar: how much of the planned work is already done. */
function PlanRing({ done, total, allDone }: { done: number; total: number; allDone: boolean }) {
  const pct = total ? Math.min(1, done / total) : allDone ? 1 : 0;
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <span className="buddy-avatar plan-ring" role="img" aria-label={total ? `${Math.round(pct * 100)}% of planned blocks done` : allDone ? "Everything done" : "Nothing planned"}>
      <svg viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r={r} className="plan-ring-track" />
        <circle cx="28" cy="28" r={r} className="plan-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      {allDone ? <Check /> : <ListChecks />}
    </span>
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
          {focus > 0 ? `${fmtDuration(focus)} of focus${blocks ? ` across ${plural(blocks, "block")}` : ""}.` : "Every one of them counts."} Lovely work.
        </p>
      </div>
      <Buddy mood="happy" tone="blue" size={116} />
    </div>
  );
}

// ------------------------------------------------------------------ Add a task

/** `defaultDue`: the day new tasks get unless one is said, typed or picked (the Today tab's). */
function Composer({ defaultDue }: { defaultDue: number | null }) {
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState(2);
  // "auto": whatever the title says ("…tomorrow"), else the default.
  const [due, setDue] = useState<number | null | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [missed, setMissed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dictation = useDictation();
  const typed = splitDue(title);
  const fromTitle = due === "auto" && typed.dueDay !== undefined;
  const dueDay = due === "auto" ? (typed.dueDay ?? defaultDue) : due;

  // Say it: "Landing page redesign, three blocks, by Friday". The field fills in; Enter adds it.
  const dictate = async () => {
    if (dictation.state === "listening") return dictation.stop();
    if (dictation.busy) return;
    setMissed(false);
    const text = await dictation.listen();
    if (text === null) return;
    if (!text) return setMissed(true);
    const spoken = parseSpokenTask(text);
    setTitle(spoken.title);
    if (spoken.estimate) setEstimate(spoken.estimate);
    if (spoken.dueDay !== undefined) setDue(spoken.dueDay);
    input.current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = (fromTitle ? typed.title : title).trim();
    // Nothing typed yet: the add button just points you at the field.
    if (!t) return input.current?.focus();
    if (busy) return;
    setBusy(true);
    if (await run("add the task", () => backend.taskCreate(t, estimate, dueDay))) {
      setTitle("");
      setDue("auto");
    }
    setBusy(false);
  };

  // One pill: the title, the mic, a due chip, an estimate chip (native picker) and a solid add circle.
  return (
    <form className="composer" onSubmit={submit}>
      <input
        ref={input}
        id={COMPOSER_ID}
        className="composer-input"
        placeholder={
          dictation.state === "listening"
            ? "Listening…"
            : dictation.state === "thinking"
              ? "Writing it down…"
              : missed
                ? "Didn't catch that. Try again?"
                : "Add a task…"
        }
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="New task"
        enterKeyHint="done"
      />
      {dictation.available && (
        <button
          type="button"
          ref={dictation.levelRef as Ref<HTMLButtonElement>}
          className={cx("composer-mic", `is-${dictation.state}`)}
          aria-label={dictation.state === "listening" ? "Done talking" : "Say a task"}
          aria-pressed={dictation.state === "listening"}
          title={dictation.state === "listening" ? "Done talking (or just pause)" : "Say a task, e.g. “Landing page, three blocks, by Friday”"}
          onClick={() => void dictate()}
        >
          {dictation.state === "listening" ? <Square className="fill" /> : dictation.state === "thinking" ? <LoaderCircle className="spin" /> : <Mic />}
        </button>
      )}
      <DueButton value={dueDay} fromTitle={fromTitle} onPick={setDue} />
      <select
        className="select composer-est"
        value={estimate}
        onChange={(e) => setEstimate(Number(e.target.value))}
        aria-label="Estimated focus blocks"
        title="How many focus blocks?"
      >
        {Array.from({ length: MAX_ESTIMATE }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {plural(n, "block")}
          </option>
        ))}
      </select>
      <button className="circle-btn brand composer-add" type="submit" aria-label="Add task" title="Add task (Enter)" disabled={busy}>
        <Plus />
      </button>
    </form>
  );
}

// ------------------------------------------------------------------ Due dates

/** Today, tomorrow, this week, next week: the days people mean most. */
function dueChoices() {
  const now = Date.now();
  const today = startOfDay(now);
  const all = [
    { label: "Today", day: today },
    { label: "Tomorrow", day: addDays(today, 1) },
    { label: "This week", day: dueFromWords("this week", now) ?? today },
    { label: "Next week", day: dueFromWords("next week", now) ?? addDays(today, 7) },
  ];
  return all.filter((c, i) => all.findIndex((o) => o.day === c.day) === i);
}

/** Quick picks, any day, or none. `onChose` runs after a pick that's final (not mid-typing a date). */
function DueOptions({ value, onPick, onChose }: { value: number | null; onPick: (day: number | null) => void; onChose?: () => void }) {
  const choose = (day: number | null) => {
    onPick(day);
    onChose?.();
  };
  return (
    <div className="due-options">
      <div className="due-chips" role="group" aria-label="Due">
        {dueChoices().map((c) => (
          <button key={c.label} type="button" className={cx("chip", value === c.day && "active")} aria-pressed={value === c.day} title={fmtDay(c.day)} onClick={() => choose(c.day)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="due-row">
        <input
          type="date"
          className="input due-date"
          value={value !== null ? toDateInput(value) : ""}
          onChange={(e) => {
            const day = fromDateInput(e.target.value);
            if (day !== null) onPick(day);
          }}
          aria-label="Pick a day"
        />
        {value !== null && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => choose(null)}>
            No date
          </button>
        )}
      </div>
    </div>
  );
}

function DueBadge({ day, glass }: { day: number; glass?: boolean }) {
  const info = dueInfo(day);
  return (
    <span className={cx("badge task-due", `is-${info.tone}`, glass && "glass")} title={`Due ${fmtDay(day)}`}>
      <CalendarDays />
      {info.label}
    </span>
  );
}

/** The composer's due chip: a calendar until there's a day, then the day. */
function DueButton({ value, fromTitle, onPick }: { value: number | null; fromTitle: boolean; onPick: (day: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const info = value !== null ? dueInfo(value) : null;
  usePopover(open, () => setOpen(false), wrap, ".composer-due");

  return (
    <div className={cx("due-wrap", open && "open")} ref={wrap}>
      <button
        type="button"
        className={cx("composer-due", info && "is-set", info && `is-${info.tone}`)}
        aria-label={info ? `Due ${info.label}. Change the day` : "Add a due date"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={info ? (fromTitle ? `Due ${fmtDay(value!)}, from the title. Pick “No date” to keep those words` : `Due ${fmtDay(value!)}`) : "Due date"}
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarDays />
        {info && <span className="composer-due-label">{info.label}</span>}
      </button>
      {open && (
        <div className="task-menu due-pop" role="dialog" aria-label="Due date">
          <div className="task-menu-label">Due</div>
          <DueOptions value={value} onPick={onPick} onChose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** Close a popover on a click outside it or Escape (focus goes back to its button). */
function usePopover(open: boolean, close: () => void, wrap: React.RefObject<HTMLElement | null>, button: string) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && closeRef.current();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeRef.current();
      wrap.current?.querySelector<HTMLElement>(button)?.focus();
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open, wrap, button]);
}

/** One line of notes under a title: Enter saves, Escape cancels. */
function NoteEditor({ task, onDone, variant }: { task: Task; onDone: () => void; variant: "hero" | "row" }) {
  const [value, setValue] = useState(task.notes ?? "");
  const cancelled = useRef(false);
  const finish = () => {
    onDone();
    if (!cancelled.current) void actions.note(task, value);
  };
  return (
    <input
      className={cx("input pill task-note-edit", variant === "hero" && "on-brand")}
      value={value}
      maxLength={500}
      autoFocus
      placeholder="Add a note…"
      onChange={(e) => setValue(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      aria-label={`Note for ${task.title}`}
    />
  );
}

// ------------------------------------------------------------------ Calm list rows

interface Grip {
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

/** Drag rows by their handle (or use ↑ ↓ on it) to set the order. */
function SortableTasks({ tasks, order }: { tasks: Task[]; order: number[] }) {
  const list = useRef<HTMLUListElement>(null);
  type Drag = { id: number; from: number; to: number; dy: number; startY: number; height: number; mids: number[] };
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // A dropped order shows straight away, until the reload brings it.
  const [pending, setPending] = useState<number[] | null>(null);
  const refocus = useRef<number | null>(null);
  const key = tasks.map((t) => t.id).join(",");
  useEffect(() => setPending(null), [key]);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const shown = pending && pending.length === tasks.length && pending.every((id) => byId.has(id)) ? pending.map((id) => byId.get(id)!) : tasks;

  useLayoutEffect(() => {
    if (refocus.current === null) return;
    list.current?.querySelector<HTMLElement>(`[data-grip="${refocus.current}"]`)?.focus({ preventScroll: true });
    refocus.current = null;
  });

  const commit = (ids: number[]) => {
    setPending(ids);
    void run("reorder the tasks", () => backend.tasksReorder(reorderWithin(order, ids))).then((ok) => {
      if (!ok) setPending(null);
    });
  };
  const moved = (from: number, to: number) => {
    const ids = shown.map((t) => t.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    return ids;
  };

  const grip = (task: Task, index: number): Grip => ({
    onPointerDown(e) {
      if (e.button !== 0 || shown.length < 2) return;
      const rows = [...(list.current?.children ?? [])] as HTMLElement[];
      const rects = rows.map((r) => r.getBoundingClientRect());
      if (rects.length !== shown.length) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const d: Drag = {
        id: task.id,
        from: index,
        to: index,
        dy: 0,
        startY: e.clientY,
        height: rects[index].height,
        mids: rects.map((r) => r.top + r.height / 2),
      };
      dragRef.current = d;
      setDrag(d);
    },
    onPointerMove(e) {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      const centre = d.mids[d.from] + dy;
      let to = d.from;
      for (let i = d.from + 1; i < d.mids.length; i++) if (centre > d.mids[i]) to = i;
      for (let i = d.from - 1; i >= 0; i--) if (centre < d.mids[i]) to = i;
      const next = { ...d, dy, to };
      dragRef.current = next;
      setDrag(next);
    },
    onPointerUp() {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (d && d.to !== d.from) commit(moved(d.from, d.to));
    },
    onPointerCancel() {
      dragRef.current = null;
      setDrag(null);
    },
    onKeyDown(e) {
      const to = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : -1;
      if (to < 0 || to >= shown.length) return;
      e.preventDefault();
      refocus.current = task.id;
      commit(moved(index, to));
    },
  });

  // While dragging, the row follows the pointer and the ones it passes make room.
  const styleFor = (i: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (i === drag.from) return { transform: `translateY(${drag.dy}px)` };
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return { transform: `translateY(${-drag.height}px)` };
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return { transform: `translateY(${drag.height}px)` };
    return undefined;
  };

  return (
    <>
      <ul className={cx("task-list", drag && "is-sorting")} ref={list}>
        {shown.map((t, i) => (
          <TaskRow key={t.id} task={t} order={order} grip={grip(t, i)} style={styleFor(i)} dragging={drag?.id === t.id} />
        ))}
      </ul>
      <p id="task-grip-help" className="sr-only">
        Up and down arrow keys move the task.
      </p>
    </>
  );
}

function TaskRow({ task, order = [], grip, style, dragging }: { task: Task; order?: number[]; grip?: Grip; style?: CSSProperties; dragging?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [noting, setNoting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const toggle = () => {
    setLeaving(true);
    window.setTimeout(() => void actions.setDone(task, !task.done).finally(() => setLeaving(false)), 280);
  };

  const when = task.completedAt ? doneWhen(task.completedAt) : null;
  const rank = task.done ? null : rankOf(task, order);
  const busy = editing || noting;

  return (
    <li className={cx("task-row", task.done && "is-done", leaving && "is-leaving", busy && "is-editing", dragging && "is-dragging")} style={style}>
      {grip && !busy && (
        <button
          type="button"
          className="task-grip"
          data-grip={task.id}
          aria-label={`Reorder “${task.title}”`}
          aria-describedby="task-grip-help"
          title="Drag to reorder (or ↑ ↓)"
          {...grip}
        >
          <GripVertical />
        </button>
      )}
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
        <div className="task-title-line">
          {rank && (
            <span className="task-rank" title={`Press ${rank} on the timer to focus on this`}>
              {rank}
            </span>
          )}
          <TaskTitle task={task} editing={editing} setEditing={setEditing} variant="row" />
        </div>
        {noting ? (
          <NoteEditor task={task} onDone={() => setNoting(false)} variant="row" />
        ) : (
          !editing && (
            <>
              {task.notes && <p className="task-note">{task.notes}</p>}
              <div className="task-sub">
                {!task.done && task.dueDay !== null && <DueBadge day={task.dueDay} />}
                {task.done ? (
                  <span className="task-sub-text">
                    {[task.pomodoros > 0 && plural(task.pomodoros, "block"), task.focusMs > 0 && fmtDuration(task.focusMs), when ?? "Finished"].filter(Boolean).join(" · ")}
                  </span>
                ) : (
                  <span className="task-sub-text">
                    {task.pomodoros} of {plural(task.estimate, "block")}
                    {task.focusMs > 0 && <span className="task-sub-time"> · {fmtDuration(task.focusMs)}</span>}
                  </span>
                )}
              </div>
            </>
          )
        )}
      </div>

      {!busy && (
        <div className="task-actions">
          {!task.done && (
            <button className="circle-btn soft task-play" aria-label={`Focus on ${task.title}`} title="Focus on this" onClick={() => void actions.focus(task)}>
              <Play className="fill" />
            </button>
          )}
          <TaskMenu task={task} order={order} onRename={() => setEditing(true)} onNote={() => setNoting(true)} />
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
  const area = useRef<HTMLTextAreaElement>(null);

  // Grow the hero textarea with its text (WebKit has no field-sizing yet).
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, editing]);

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
  // Long hero titles step down a size and clamp to three lines (full title in the tooltip).
  const long = task.title.length > 40;

  if (editing && variant === "hero") {
    return (
      <textarea
        ref={area}
        className={cx("task-hero-title task-hero-edit", long && "is-long")}
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
    <h2 className={cx("task-hero-title", long && "is-long")} onDoubleClick={() => setEditing(true)} title={long ? task.title : "Double-click to rename"}>
      {task.title}
    </h2>
  ) : (
    <span className="task-title" onDoubleClick={() => canEdit && setEditing(true)} title={canEdit ? "Double-click to rename" : undefined}>
      {task.title}
    </span>
  );
}

// ------------------------------------------------------------------ Overflow menu (rename · estimate · delete)

function TaskMenu({
  task,
  order = [],
  onRename,
  onNote,
  onBrand,
}: {
  task: Task;
  order?: number[];
  onRename: () => void;
  onNote: () => void;
  onBrand?: boolean;
}) {
  const at = order.indexOf(task.id);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [estimate, setEstimate] = useState(task.estimate);
  const [due, setDue] = useState(task.dueDay);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  usePopover(open, () => setOpen(false), wrap, ".task-more");

  useLayoutEffect(() => {
    if (!open) {
      setUp(false);
      return;
    }
    // Open upwards when there's no room below (the floating nav covers the bottom).
    const el = menu.current;
    const anchor = wrap.current?.getBoundingClientRect();
    if (el && anchor && !up) {
      const below = window.innerHeight - anchor.bottom - 96;
      if (el.offsetHeight > below && anchor.top - 16 > below) setUp(true);
    }
  }, [open, up]);

  useEffect(() => {
    if (!open) return;
    setEstimate(task.estimate);
    setDue(task.dueDay);
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
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
        <div className={cx("task-menu", up && "up")} role="menu" ref={menu} aria-label={task.title}>
          {task.done ? (
            <button type="button" role="menuitem" onClick={pick(() => void actions.setDone(task, false))}>
              <RotateCcw /> Back to To do
            </button>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={pick(onRename)}>
                <Pencil /> Rename
              </button>
              <button type="button" role="menuitem" onClick={pick(onNote)}>
                <StickyNote /> {task.notes ? "Edit note" : "Add a note"}
              </button>
              {at > 0 && (
                <button type="button" role="menuitem" onClick={pick(() => void actions.move(task, order, "top"))}>
                  <ArrowUpToLine /> Move to top
                </button>
              )}
              <div className="task-menu-sep" role="separator" />
              <div className="task-menu-label">
                <CalendarDays /> Due
              </div>
              <DueOptions
                value={due}
                onPick={(day) => {
                  setDue(day);
                  void actions.due(task, day);
                }}
                onChose={() => setOpen(false)}
              />
              <label className="task-menu-field">
                <span>
                  <Music2 /> Sound
                </span>
                <select className="select" value={task.sound ?? ""} onChange={(e) => void actions.sound(task, e.target.value || null)} title="Plays when a focus block on this task starts">
                  <option value="">As it is</option>
                  <option value="off">Silence</option>
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
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
              <div className="task-menu-sep" role="separator" />
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
