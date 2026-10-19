const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

export type OS = "macos" | "windows" | "linux" | "android" | "ios";

export const os: OS = /Android/i.test(ua)
  ? "android"
  : /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document)
    ? "ios"
    : /Mac/i.test(ua)
      ? "macos"
      : /Win/i.test(ua)
        ? "windows"
        : "linux";

export const isMobileOS = os === "android" || os === "ios";
export const isMac = os === "macos";

/** Render an accelerator like "CommandOrControl+Shift+Space" for this platform. */
export function shortcutLabel(accelerator: string): string {
  const parts = accelerator.split("+");
  const map: Record<string, string> = isMac
    ? { CommandOrControl: "⌘", CmdOrCtrl: "⌘", Command: "⌘", Control: "⌃", Ctrl: "⌃", Shift: "⇧", Alt: "⌥", Option: "⌥", Space: "Space" }
    : { CommandOrControl: "Ctrl", CmdOrCtrl: "Ctrl", Control: "Ctrl", Ctrl: "Ctrl", Shift: "Shift", Alt: "Alt", Space: "Space" };
  return parts.map((p) => map[p] ?? p).join(isMac ? "" : "+");
}
