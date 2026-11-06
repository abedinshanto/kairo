// Kairo runs the same app in three windows: the main one, the menu bar panel
// and quick capture. The core tells the small ones which they are; in the
// browser preview, #panel or #capture opens them for a look.

export type WindowRole = "main" | "panel" | "capture";

const injected = (window as unknown as { __KAIRO_WINDOW__?: string }).__KAIRO_WINDOW__;
const fromHash = window.location.hash.replace(/^#\/?/, "");

export const windowRole: WindowRole =
  injected === "panel" || injected === "capture" ? injected : fromHash === "panel" || fromHash === "capture" ? fromHash : "main";

export const isMainWindow = windowRole === "main";
