import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Service Worker nur im fertigen Build (Plan 10: "Als App installieren").
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Abstürze im Browser an den Admin melden (Telegram, serverseitig gedrosselt).
// Nur im fertigen Build, höchstens 3 Meldungen pro Seitenaufruf, ohne Nutzerdaten.
if (import.meta.env.PROD) {
  import("@/lib/api").then(({ API }) => {
    let left = 3;
    const report = (message, source) => {
      if (left-- <= 0 || !message) return;
      try {
        const body = JSON.stringify({ message: String(message).slice(0, 300), source: String(source || "").slice(0, 300), path: window.location.pathname });
        fetch(`${API}/client-error`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      } catch (e) { /* nie selbst abstürzen */ }
    };
    window.addEventListener("error", (e) => report(e.message, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : ""));
    window.addEventListener("unhandledrejection", (e) => {
      const r = e.reason;
      // Netzwerk-/HTTP-Fehler (axios) sind keine Bugs im Code
      if (r && (r.isAxiosError || r.response)) return;
      report(r && (r.message || String(r)), r && r.stack ? String(r.stack).split("\n")[1] : "");
    });
  });
}
