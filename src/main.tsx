// Global styles first so per-view stylesheets (imported by each view) can refine them.
import "@fontsource-variable/plus-jakarta-sans";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/shell.css";
import "./styles/charts.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isNative } from "./lib/backend";
import { os } from "./lib/platform";
import { windowRole } from "./lib/windowRole";

const root = document.documentElement;
root.classList.add(`os-${os}`);
if (os === "macos") root.classList.add("is-mac");
if (isNative) root.classList.add("is-native");
root.classList.add(`win-${windowRole}`);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
