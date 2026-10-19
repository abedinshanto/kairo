import react from "@vitejs/plugin-react";
import process from "node:process";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// https://tauri.app/start/frontend/vite/
export default defineConfig(() => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Tauri ships modern engines: WebView2 (Chromium) on Windows, WebKit on macOS/iOS/Linux.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 900,
  },
}));
