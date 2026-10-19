import { Check, ChevronDown, Play, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PageHeader } from "../components/PageHeader";
import { Stepper, cx } from "../components/ui";
import { backend } from "../lib/backend";
import { useQuery } from "../lib/hooks";
import { useApp } from "../lib/store";
import { fmtDuration } from "../lib/time";
import type { Task } from "../lib/types";

export function TasksView() {
  const { data } = useQuery(() => backend.tasksList(), []);
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState(2);
  const [showDone, setShowDone] = useState(false);
  const bump = useApp((s) => s.bumpData);
  const timer = useApp((s) => s.timer)!;

  const open = (data ?? []).filter((t) => !t.done);
  const done = (data ?? []).filter((t) => t.done);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await backend.taskCreate(title.trim(), estimate);
    setTitle("");
    bump();
  };

  return (
    <div className="narrow">
      <PageHeader title="Tasks" subtitle="Plan your focus blocks. Each completed block counts toward its task." />

      <form className="card task-add" onSubmit={add}>
        <input className="input" placeholder="Add a task, e.g. Draft the launch email" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New task" />
        <div className="task-add-row">
          <span className="faint" style={{ fontSize: 12.5 }}>
            Estimate
          </span>
          <Stepper label="blocks" value={estimate} onChange={setEstimate} min={1} max={12} format={(v) => `${v} block${v > 1 ? "s" : ""}`} />
          <button className="btn btn-primary" type="submit" disabled={!title.trim()}>
            <Plus /> Add
          </button>
        </div>
      </form>

      <div className="card flush">
        {open.length ? (
          <ul className="task-list">
            {open.map((t) => (
              <TaskRow key={t.id} task={t} current={timer.taskId === t.id} />
            ))}
          </ul>
        ) : (
          <div className="empty">
            <strong>Nothing on your plate</strong>Add a task above and link focus blocks to it.
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div className="done-section">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            <ChevronDown style={{ transform: showDone ? "none" : "rotate(-90deg)", transition: "transform .2s" }} />
            Completed · {done.length}
          </button>
          {showDone && (
            <div className="card flush" style={{ marginTop: 10 }}>
              <ul className="task-list">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} current={false} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, current }: { task: Task; current: boolean }) {
  const bump = useApp((s) => s.bumpData);
  const setIntention = useApp((s) => s.setIntention);
  const setView = useApp((s) => s.setView);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);

  const save = async () => {
    setEditing(false);
    if (title.trim() && title !== task.title) {
      await backend.taskUpdate(task.id, { title: title.trim() });
      bump();
    } else setTitle(task.title);
  };

  return (
    <li className={cx("task", task.done && "is-done", current && "is-current")}>
      <button
        className={cx("task-check", task.done && "done")}
        aria-label={task.done ? "Mark as not done" : "Mark as done"}
        onClick={async () => {
          await backend.taskUpdate(task.id, { done: !task.done });
          bump();
        }}
      >
        {task.done && <Check />}
      </button>
      <div className="task-main">
        {editing ? (
          <input
            className="input task-edit"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") {
                setTitle(task.title);
                setEditing(false);
              }
            }}
            aria-label="Task title"
          />
        ) : (
          <button className="task-title" onDoubleClick={() => !task.done && setEditing(true)} title="Double-click to rename">
            {task.title}
          </button>
        )}
        <div className="task-meta faint">
          <span className="pomos">
            {Array.from({ length: Math.max(task.estimate, Math.min(task.pomodoros, 16)) }, (_, i) => (
              <span key={i} className={cx("pomo", i < task.pomodoros && "done", i >= task.estimate && "over")} />
            ))}
          </span>
          <span>
            {task.pomodoros}/{task.estimate} blocks
          </span>
          {task.focusMs > 0 && <span>· {fmtDuration(task.focusMs)} focused</span>}
          {current && <span className="badge accent">In focus</span>}
        </div>
      </div>
      {!task.done && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            await setIntention(task.title, task.id);
            setView("focus");
          }}
        >
          <Play /> Focus
        </button>
      )}
      <button
        className="icon-btn sm"
        aria-label="Delete task"
        onClick={async () => {
          await backend.taskDelete(task.id);
          bump();
        }}
      >
        <Trash2 />
      </button>
    </li>
  );
}
