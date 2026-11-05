// Making sense of dictated text: lead-ins, task numbers, estimates, and which
// task (if any) the words name.

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

/** "Landing page redesign, three blocks" → title and estimate (focus blocks). */
export function parseSpokenTask(text: string): { title: string; estimate?: number } {
  const m = withoutLeadIn(text).match(
    /^(.*?)[\s,;:-]*\b(?:(?:for|in|about|takes?|taking|needs?|with|around)\s+)?(\d{1,2}|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:focus\s+)?(?:blocks?|pomodoros?|pomodori|sessions?)$/i,
  );
  if (m && m[1].trim()) {
    const n = toNumber(m[2]);
    if (n) return { title: tidy(m[1]), estimate: Math.min(12, Math.max(1, n)) };
  }
  return { title: withoutLeadIn(text) };
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
