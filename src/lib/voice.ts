import { useEffect, useRef, useState } from "react";
import { backend } from "./backend";
import { useApp } from "./store";
import type { VoiceState } from "./types";

let availability: Promise<boolean> | null = null;
/** Whether on-device dictation works here (desktop, with the model and a microphone). */
export const voiceAvailable = () => (availability ??= backend.voiceAvailable().catch(() => false));

/** Only one place listens at a time (Home's Kai or the task composer). */
let owner: symbol | null = null;

/**
 * Dictation for one spot in the UI. `listen()` resolves to what was said ("" when
 * nothing was, null when it couldn't listen). The microphone level goes straight
 * to a `--level` CSS variable on `levelRef`, so listening doesn't re-render 20×/s.
 */
export function useDictation() {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<"idle" | VoiceState>("idle");
  const me = useRef(Symbol("dictation"));
  const levelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let live = true;
    void voiceAvailable().then((a) => live && setAvailable(a));
    return () => {
      live = false;
    };
  }, []);

  useEffect(
    () =>
      backend.subscribe((e) => {
        if (owner !== me.current) return;
        if (e.type === "voice") setState(e.state);
        else if (e.type === "voice-level") levelRef.current?.style.setProperty("--level", e.level.toFixed(3));
      }),
    [],
  );

  // Leaving the screen mid-sentence throws the recording away.
  useEffect(() => {
    const mine = me.current;
    return () => {
      if (owner === mine) void backend.voiceCancel();
    };
  }, []);

  const listen = async (): Promise<string | null> => {
    if (owner) return null;
    owner = me.current;
    setState("listening");
    try {
      return await backend.voiceListen();
    } catch (err) {
      useApp.getState().toast({ title: "Couldn't listen", body: String(err), tone: "warning" });
      return null;
    } finally {
      owner = null;
      setState("idle");
      levelRef.current?.style.setProperty("--level", "0");
    }
  };

  return {
    available,
    state,
    busy: state !== "idle",
    levelRef,
    listen,
    /** Done talking: transcribe now. */
    stop: () => void backend.voiceStop(),
    /** Never mind: discard. */
    cancel: () => void backend.voiceCancel(),
  };
}
