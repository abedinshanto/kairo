import type { Backend } from "../types";
import { createDemoBackend } from "./demo";
import { createNativeBackend } from "./native";

/** True inside the Tauri shell (desktop or mobile); false in a plain browser. */
export const isNative = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const backend: Backend = isNative ? createNativeBackend() : createDemoBackend();
