import { useEffect, useState } from "react";
import { backend } from "./backend";

/**
 * Real app icons, fetched in batches and shared by every list on screen.
 * The core extracts an app's icon in the background the first time it sees the
 * app, so a miss is remembered only briefly and then asked for again.
 */
const MISS_RETRY_MS = 60_000;

const found = new Map<string, string>();
const missedAt = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
let queue = new Set<string>();
let scheduled = false;

function flush() {
  scheduled = false;
  const keys = [...queue];
  queue = new Set();
  backend
    .appIcons(keys)
    .then((icons) => {
      for (const k of keys) {
        if (icons[k]) found.set(k, icons[k]);
        else missedAt.set(k, Date.now());
      }
    })
    .catch(() => keys.forEach((k) => missedAt.set(k, Date.now())))
    .finally(() => keys.forEach((k) => listeners.get(k)?.forEach((notify) => notify())));
}

function request(key: string) {
  if (found.has(key) || queue.has(key)) return;
  const missed = missedAt.get(key);
  if (missed !== undefined && Date.now() - missed < MISS_RETRY_MS) return;
  queue.add(key);
  if (!scheduled) {
    scheduled = true;
    // Gather every avatar rendered this frame into one request.
    window.setTimeout(flush, 0);
  }
}

/** The core stored a new icon for `key`: fetch it now for anything showing that app. */
export function iconChanged(key: string) {
  missedAt.delete(key);
  found.delete(key);
  if (listeners.get(key)?.size) request(key);
}

/** The icon for an app key as a data URL, or null while unknown or when the app has none. */
export function useAppIcon(key: string | undefined): string | null {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!key) return;
    const notify = () => rerender((n) => n + 1);
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(notify);
    request(key);
    return () => {
      set.delete(notify);
    };
  }, [key]);
  return key ? (found.get(key) ?? null) : null;
}
