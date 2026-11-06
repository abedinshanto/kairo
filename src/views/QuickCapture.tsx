import { Check, CornerDownLeft, LoaderCircle, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";
import { cx } from "../components/ui";
import { backend } from "../lib/backend";
import { matchTask, parseSpokenTask, withoutLeadIn } from "../lib/spoken";
import { useApp } from "../lib/store";
import { dueInfo } from "../lib/time";
import { useDictation } from "../lib/voice";
import "../styles/small-windows.css";

/**
 * Quick capture: a box over whatever you're doing. Type or say a task ("call
 * the gym tomorrow, one block") and press Enter to add it, or Shift+Enter to
 * focus on it now. The shortcut again starts dictation; Escape closes.
 */
export function QuickCapture() {
  const [text, setText] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dictation = useDictation();
  const keys = useRef({ talk: async () => {}, dictation });

  const close = () => void backend.windowHide();

  const talk = async () => {
    if (dictation.state === "listening") return dictation.stop();
    if (dictation.busy) return;
    setMissed(false);
    const said = await dictation.listen();
    if (said === null) return;
    if (!said) return setMissed(true);
    setText(said);
    input.current?.focus();
  };
  keys.current = { talk, dictation };

  // Each time it opens: a clean box, ready to type. The shortcut again: talk.
  useEffect(
    () =>
      backend.subscribe((e) => {
        if (e.type === "shown") {
          setText("");
          setDone(null);
          setMissed(false);
          window.setTimeout(() => input.current?.focus(), 30);
        } else if (e.type === "capture-again" && keys.current.dictation.available) {
          void keys.current.talk();
        }
      }),
    [],
  );

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (keys.current.dictation.state === "listening") keys.current.dictation.cancel();
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const parsed = text.trim() ? parseSpokenTask(text) : null;
  const due = parsed?.dueDay !== undefined ? dueInfo(parsed.dueDay) : null;

  const finish = (message: string) => {
    setDone(message);
    setText("");
    window.setTimeout(close, 650);
  };

  const add = async () => {
    if (!parsed?.title) return;
    try {
      await backend.taskCreate(parsed.title, parsed.estimate ?? 2, parsed.dueDay ?? null);
      useApp.getState().bumpData();
      finish(`Added “${parsed.title}”`);
    } catch (err) {
      setDone(`Couldn't add it: ${String(err)}`);
    }
  };

  // Focus on it now: a task it names is linked; the timer starts if it's idle.
  const focus = async () => {
    const said = withoutLeadIn(text);
    if (!said) return;
    const tasks = (await backend.tasksList()).filter((t) => !t.done);
    const task = matchTask(said, tasks);
    const { setIntention, timerAction, timer } = useApp.getState();
    await setIntention(task?.title ?? said, task?.id ?? null);
    if (timer?.status === "idle" && timer.phase === "focus") await timerAction("start");
    finish(`Focusing on “${task?.title ?? said}”`);
  };

  const listening = dictation.state === "listening";
  const thinking = dictation.state === "thinking";

  return (
    <div className="mini capture">
      <form
        className="capture-row"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        {dictation.available && (
          <button
            type="button"
            ref={dictation.levelRef as Ref<HTMLButtonElement>}
            className={cx("capture-mic", `is-${dictation.state}`)}
            aria-label={listening ? "Done talking" : "Say it"}
            title={listening ? "Done talking (or just pause)" : "Say it (or press the shortcut again)"}
            onClick={() => void talk()}
          >
            {listening ? <Square className="fill" /> : thinking ? <LoaderCircle className="spin" /> : <Mic />}
          </button>
        )}
        <input
          ref={input}
          className="capture-input"
          value={text}
          maxLength={160}
          placeholder={listening ? "Listening…" : thinking ? "Writing it down…" : missed ? "Didn't catch that. Try again?" : "Add a task, or what you're working on…"}
          onChange={(e) => {
            setText(e.target.value);
            setDone(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              void focus();
            }
          }}
          aria-label="Task or focus"
        />
      </form>
      <div className="capture-foot">
        {done ? (
          <span className="capture-done">
            <Check /> {done}
          </span>
        ) : parsed?.title ? (
          <span className="capture-parsed">
            Task <strong>{parsed.title}</strong>
            {parsed.estimate ? ` · ${parsed.estimate} block${parsed.estimate === 1 ? "" : "s"}` : ""}
            {due ? ` · due ${due.tone === "later" || due.tone === "overdue" ? due.label : due.label.toLowerCase()}` : ""}
          </span>
        ) : (
          <span className="capture-parsed">Try “Call the gym tomorrow” or “Landing page, three blocks”.</span>
        )}
        <span className="capture-keys">
          <kbd>
            <CornerDownLeft />
          </kbd>{" "}
          add <kbd>⇧</kbd>
          <kbd>
            <CornerDownLeft />
          </kbd>{" "}
          focus now <kbd>esc</kbd> close
        </span>
      </div>
    </div>
  );
}
