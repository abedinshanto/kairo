import { Brain, CloudMoonRain, Coffee, Flame, Library, Sparkles, TrainFront, Trees, Waves } from "lucide-react";
import type { ReactNode } from "react";

/** One icon per soundscape preset (Home's sound card, the Sounds screen). */
export const PRESET_ICONS: Record<string, ReactNode> = {
  "deep-work": <Brain />,
  "rainy-night": <CloudMoonRain />,
  "ocean-calm": <Waves />,
  forest: <Trees />,
  campfire: <Flame />,
  flow: <Sparkles />,
  "corner-cafe": <Coffee />,
  "night-train": <TrainFront />,
  library: <Library />,
};
