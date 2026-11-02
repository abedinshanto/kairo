import {
  Clapperboard,
  Code,
  Gamepad2,
  Globe,
  GraduationCap,
  ListChecks,
  MessageCircle,
  Newspaper,
  Palette,
  PenLine,
  Shapes,
  ShoppingBag,
  Users,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

/** One glyph per category (same ids as categories.ts). */
const ICONS: Record<string, LucideIcon> = {
  development: Code,
  design: Palette,
  writing: PenLine,
  productivity: ListChecks,
  learning: GraduationCap,
  communication: MessageCircle,
  meetings: Video,
  browsing: Globe,
  utilities: Wrench,
  other: Shapes,
  social: Users,
  entertainment: Clapperboard,
  news: Newspaper,
  shopping: ShoppingBag,
  games: Gamepad2,
};

export function categoryIcon(id: string): ReactNode {
  const Icon = ICONS[id] ?? Shapes;
  return <Icon />;
}
