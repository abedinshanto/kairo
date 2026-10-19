import { useEffect, useRef, useState } from "react";
import { useApp } from "./store";

/** Re-render on an interval (only while `active`). */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

/**
 * Run an async loader whenever `deps` or the global data version change.
 * The previous result stays on screen while refetching (no skeleton flash).
 */
export function useQuery<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean; error: string | null } {
  const version = useApp((s) => s.dataVersion);
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: string | null }>({
    data: undefined,
    loading: true,
    error: null,
  });
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    load()
      .then((data) => mine === seq.current && setState({ data, loading: false, error: null }))
      .catch((e) => mine === seq.current && setState((s) => ({ ...s, loading: false, error: String(e) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  return state;
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
