import "@fontsource-variable/inter";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isNative } from "./lib/backend";
import { os } from "./lib/platform";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/layout.css";
import "./styles/views.css";
import "./styles/charts.css";

const root = document.documentElement;
root.classList.add(`os-${os}`);
if (os === "macos") root.classList.add("is-mac");
if (isNative) root.classList.add("is-native");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
