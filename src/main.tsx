import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

document.addEventListener('contextmenu', (e) => { if (import.meta.env.PROD || (window as unknown as { __TAURI_INTERNALS__?: boolean }).__TAURI_INTERNALS__) e.preventDefault(); });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
