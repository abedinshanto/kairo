import type { Productivity } from "./types";

export interface CategoryMeta {
  id: string;
  label: string;
  productivity: Productivity;
}

/** Same list and defaults as src-tauri/src/categories.rs. */
export const CATEGORIES: CategoryMeta[] = [
  { id: "development", label: "Development", productivity: 1 },
  { id: "design", label: "Design", productivity: 1 },
  { id: "writing", label: "Writing", productivity: 1 },
  { id: "productivity", label: "Planning & tools", productivity: 1 },
  { id: "learning", label: "Learning", productivity: 1 },
  { id: "communication", label: "Communication", productivity: 0 },
  { id: "meetings", label: "Meetings", productivity: 0 },
  { id: "browsing", label: "Browsing", productivity: 0 },
  { id: "utilities", label: "Utilities", productivity: 0 },
  { id: "other", label: "Other", productivity: 0 },
  { id: "social", label: "Social media", productivity: -1 },
  { id: "entertainment", label: "Entertainment", productivity: -1 },
  { id: "news", label: "News", productivity: -1 },
  { id: "shopping", label: "Shopping", productivity: -1 },
  { id: "games", label: "Games", productivity: -1 },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export const categoryLabel = (id: string) => byId.get(id)?.label ?? id;
export const defaultProductivity = (id: string): Productivity => byId.get(id)?.productivity ?? 0;

export const PRODUCTIVITY_LABEL: Record<Productivity, string> = {
  1: "Productive",
  0: "Neutral",
  [-1]: "Distracting",
} as Record<Productivity, string>;

export const productivityClass = (p: number) => (p > 0 ? "productive" : p < 0 ? "distracting" : "neutral");

const SITE_NAMES: Record<string, string> = {
  "youtube.com": "YouTube", "github.com": "GitHub", "x.com": "X", "twitter.com": "Twitter",
  "reddit.com": "Reddit", "mail.google.com": "Gmail", "docs.google.com": "Google Docs",
  "sheets.google.com": "Google Sheets", "calendar.google.com": "Google Calendar",
  "meet.google.com": "Google Meet", "stackoverflow.com": "Stack Overflow", "claude.ai": "Claude",
  "chatgpt.com": "ChatGPT", "news.ycombinator.com": "Hacker News", "netflix.com": "Netflix",
  "amazon.com": "Amazon", "linkedin.com": "LinkedIn", "instagram.com": "Instagram",
  "facebook.com": "Facebook", "notion.so": "Notion", "figma.com": "Figma", "twitch.tv": "Twitch",
  "wikipedia.org": "Wikipedia", "medium.com": "Medium", "open.spotify.com": "Spotify",
};

/** Friendly display name for an app or site entity. */
export function entityName(kind: "app" | "site", key: string, name: string): string {
  if (kind === "site") return SITE_NAMES[key] ?? key;
  return name;
}
