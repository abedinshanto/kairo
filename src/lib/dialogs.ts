import { isNative } from "./backend";

/** Native confirmation sheet inside the app shell, browser confirm() in the preview. */
export async function confirmDialog(message: string, opts: { title?: string; okLabel?: string; destructive?: boolean } = {}): Promise<boolean> {
  if (isNative) {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return ask(message, {
      title: opts.title ?? "Kairo",
      kind: opts.destructive ? "warning" : "info",
      okLabel: opts.okLabel ?? "OK",
      cancelLabel: "Cancel",
    });
  }
  return window.confirm(opts.title ? `${opts.title}\n\n${message}` : message);
}
