export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function startOfDay(t: number | Date): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Local-day buckets [start, end) — DST-safe because each day is computed from the calendar. */
export function dayBuckets(firstDay: number, days: number): [number, number][] {
  return Array.from({ length: days }, (_, i) => {
    const from = addDays(firstDay, i);
    return [from, addDays(firstDay, i + 1)];
  });
}

export function hourBuckets(day: number): [number, number][] {
  return Array.from({ length: 24 }, (_, h) => {
    const from = new Date(day);
    from.setHours(h, 0, 0, 0);
    const to = new Date(day);
    to.setHours(h + 1, 0, 0, 0);
    return [from.getTime(), to.getTime()];
  });
}

export const isSameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);

/** "5h 12m", "48m", "< 1m" */
export function fmtDuration(ms: number, opts: { compact?: boolean } = {}): string {
  const totalMin = Math.round(Math.max(0, ms) / MINUTE);
  if (ms > 0 && totalMin === 0) return "< 1m";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (opts.compact || m === 0) return m === 0 ? `${h}h` : `${h}.${Math.round((m / 60) * 10)}h`;
  return `${h}h ${m}m`;
}

/** Hours with one decimal for chart axes: 0, 0.5h, 2h */
export function fmtHours(ms: number): string {
  const h = ms / HOUR;
  if (h === 0) return "0";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

/** "24:13" or "1:02:03" */
export function fmtClock(ms: number): string {
  const secs = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const hourFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const shortDayFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });

export const fmtTime = (t: number) => timeFmt.format(t);
export const fmtHour = (h: number) => {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return hourFmt.format(d).replace(/\s?([AP])M/i, (_, p: string) => p.toLowerCase() + "m");
};
export const fmtDay = (t: number) => dayFmt.format(t);
export const fmtShortDay = (t: number) => shortDayFmt.format(t);
export const fmtWeekday = (t: number) => weekdayFmt.format(t);

export function relativeDayLabel(day: number): string {
  const today = startOfDay(Date.now());
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(day);
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** A due day as a task shows it: "Today", "Tomorrow", "Fri", "Nov 12"; past days are overdue. */
export function dueInfo(day: number, now = Date.now()): { label: string; tone: "overdue" | "today" | "soon" | "later" } {
  const today = startOfDay(now);
  if (day < today) return { label: "Overdue", tone: "overdue" };
  if (day === today) return { label: "Today", tone: "today" };
  if (day === addDays(today, 1)) return { label: "Tomorrow", tone: "soon" };
  if (day < addDays(today, 7)) return { label: weekdayFmt.format(day), tone: "later" };
  return { label: shortDayFmt.format(day), tone: "later" };
}

/** `<input type="date">` values, in local time. */
export const toDateInput = (day: number) => {
  const d = new Date(day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fromDateInput = (value: string): number | null => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
};
