// Making sense of dictated (or typed) text: lead-ins, task numbers, estimates,
// due dates, and which task (if any) the words name.

import { addDays, startOfDay } from "./time";

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const toNumber = (w: string) => (/^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w.toLowerCase()]);

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Trim, drop a closing full stop, capitalise. */
const tidy = (s: string) => capitalise(s.trim().replace(/[\s.,;:!-]+$/, "").replace(/^[\s,;:-]+/, ""));

/** "I'm working on the landing page" → "The landing page": what was said, minus the lead-in. */
export function withoutLeadIn(text: string): string {
  return tidy(
    text
      .trim()
      .replace(/^(?:ok(?:ay)?|so|um|uh)[,\s]+/i, "")
      .replace(/^(?:(?:i'?m|i am|we'?re|we are|let'?s|i'?ll|i will|i want to|i need to|time to|going to|gonna)\s+)?(?:be\s+)?(?:working on|work on|focusing on|focus on|starting on|start on)\s+/i, ""),
  );
}

/** "Task two", "number 3" → 3. */
export function spokenTaskNumber(text: string): number | null {
  const m = text.trim().match(/^(?:task|number|#)\s*(\d|one|two|three|four)[.!]?$/i);
  return m ? toNumber(m[1]) ?? null : null;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
// Full names, plus abbreviations that aren't everyday words ("sun", "sat", "mon" are).
const WEEKDAY = "(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues?|weds?|thu(?:rs?)?|fri)";
const LEAD_WORDS = "due|by|for|on|over|before|until|till|next|coming";
const DUE_LEAD = `(?:(?:${LEAD_WORDS})\\s+)*`;
const DUE_WORDS = `(today|tonight|this\\s+(?:evening|afternoon|morning|week|weekend)|the\\s+weekend|tomorrow|tmrw|(?:the\\s+)?day\\s+after\\s+tomorrow|(?:the\\s+)?end\\s+of\\s+(?:the|this)\\s+week|next\\s+week|in\\s+(?:a|one|\\d{1,2}|two|three|four|five|six|seven)\\s+(?:days?|weeks?)|${WEEKDAY})`;
const DUE_AT_END = new RegExp(`^(.*?)[\\s,;:-]+${DUE_LEAD}${DUE_WORDS}$`, "i");
// At the start, a bare weekday is usually part of the title ("Monday standup notes").
const DUE_AT_START = new RegExp(
  `^(today|tonight|tomorrow|tmrw|this\\s+week(?:end)?|next\\s+week|(?:on|by|next|this)\\s+${WEEKDAY})[\\s,;:-]+(.+)$`,
  "i",
);

/**
 * The day a phrase means, as local midnight: "tomorrow", "by Friday", "next week"
 * (its Monday), "this week" (Friday, or Sunday at the weekend), "in 3 days".
 * A weekday always means the next one, not today; "next Friday" skips this week's.
 */
export function dueFromWords(phrase: string, now = Date.now()): number | null {
  const p = phrase.toLowerCase().replace(/\s+/g, " ").trim();
  const today = startOfDay(now);
  const dow = new Date(today).getDay();
  const ahead = (target: number, includeToday = false) => {
    const d = (target - dow + 7) % 7;
    return addDays(today, d === 0 && !includeToday ? 7 : d);
  };
  const lead = /^(next|coming) /.test(p);
  const core = p.replace(new RegExp(`^(?:(?:${LEAD_WORDS}) )+`), "").replace(/^(?:this|the) (?!day after)/, "");
  if (/^(today|tonight|evening|afternoon|morning)$/.test(core)) return today;
  if (/^(tomorrow|tmrw)$/.test(core)) return addDays(today, 1);
  if (/^(the )?day after tomorrow$/.test(core)) return addDays(today, 2);
  if (core === "week" && lead) return ahead(1);
  if (core === "weekend") return dow === 0 || dow === 6 ? today : ahead(6);
  if (core === "week" || /^end of (the|this) week$/.test(core)) return dow >= 1 && dow <= 5 ? ahead(5, true) : ahead(0, true);
  const inN = core.match(/^in (a|one|\d{1,2}|two|three|four|five|six|seven) (day|week)s?$/);
  if (inN) {
    const n = toNumber(inN[1]) ?? 1;
    return addDays(today, inN[2] === "week" ? n * 7 : n);
  }
  const wd = core.match(new RegExp(`^${WEEKDAY}$`));
  if (wd) {
    const i = WEEKDAYS.findIndex((d) => d.startsWith(wd[1].slice(0, 3)));
    if (i < 0) return null;
    const day = ahead(i);
    // "Next Friday" on a Thursday is a week on Friday, not tomorrow.
    const sunday = addDays(today, (7 - dow) % 7);
    return lead && day <= sunday ? addDays(day, 7) : day;
  }
  return null;
}

/** "Call the gym tomorrow" → "Call the gym" due tomorrow. Leaves text without a date alone. */
export function splitDue(text: string, now = Date.now()): { title: string; dueDay?: number } {
  const t = text.trim();
  const end = t.match(DUE_AT_END);
  // "Due tomorrow" alone has no title to keep.
  if (end && end[1].trim() && !new RegExp(`^(?:${LEAD_WORDS})$`, "i").test(end[1].trim())) {
    const day = dueFromWords(t.slice(end[1].length).replace(/^[\s,;:-]+/, ""), now);
    if (day !== null) return { title: end[1].trim().replace(/[\s,;:-]+$/, ""), dueDay: day };
  }
  const start = t.match(DUE_AT_START);
  if (start && start[start.length - 1].trim()) {
    const rest = start[start.length - 1];
    const day = dueFromWords(t.slice(0, t.length - rest.length).replace(/[\s,;:-]+$/, ""), now);
    if (day !== null) return { title: rest.trim(), dueDay: day };
  }
  return { title: t };
}

const ESTIMATE_AT_END =
  /^(.*?)[\s,;:-]*\b(?:(?:for|in|about|takes?|taking|needs?|with|around)\s+)?(\d{1,2}|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:focus\s+)?(?:blocks?|pomodoros?|pomodori|sessions?)$/i;

/**
 * "Landing page redesign, three blocks, by Friday" → title, estimate (focus
 * blocks) and due day, in either order at the end (or the day first).
 */
export function parseSpokenTask(text: string, now = Date.now()): { title: string; estimate?: number; dueDay?: number } {
  let rest = withoutLeadIn(text);
  let estimate: number | undefined;
  let dueDay: number | undefined;
  for (let pass = 0; pass < 2; pass++) {
    const m = estimate === undefined ? rest.match(ESTIMATE_AT_END) : null;
    if (m && m[1].trim()) {
      const n = toNumber(m[2]);
      if (n) {
        estimate = Math.min(12, Math.max(1, n));
        rest = m[1];
        continue;
      }
    }
    if (dueDay === undefined) {
      const due = splitDue(rest, now);
      if (due.dueDay !== undefined) {
        dueDay = due.dueDay;
        rest = due.title;
        continue;
      }
    }
    break;
  }
  return { title: tidy(rest) || withoutLeadIn(text), ...(estimate ? { estimate } : {}), ...(dueDay !== undefined ? { dueDay } : {}) };
}

const STOP_WORDS = new Set(["the", "a", "an", "on", "for", "to", "of", "my", "and", "with", "in"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));

/** The task these words name: the same words, give or take a few small ones. */
export function matchTask<T extends { title: string }>(text: string, tasks: T[]): T | undefined {
  const said = new Set(words(text));
  if (!said.size) return undefined;
  let best: T | undefined;
  let bestScore = 0;
  for (const t of tasks) {
    const titleWords = words(t.title);
    if (!titleWords.length) continue;
    // Numbers must agree: "Q3 planning" isn't "Q4 planning".
    if (titleWords.some((w) => /\d/.test(w) && !said.has(w))) continue;
    const hits = titleWords.filter((w) => said.has(w)).length;
    const score = hits / Math.max(titleWords.length, said.size);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return bestScore >= 0.75 ? best : undefined;
}
