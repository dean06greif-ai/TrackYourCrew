// Nutzungsstatistik (Dean 2026-11-27): zählt nur, welche Funktion wie oft genutzt wird und wie lange
// man auf welcher Seite ist – keine Inhalte. Wird gesammelt und höchstens jede Minute (und beim
// Verlassen) an den eigenen Server geschickt; daraus entsteht der Wochenbericht für den Betreiber.
import { api, API, tokenStore } from "./api";

const getToken = () => tokenStore.get();

let events = {};
let pages = {};
let curPage = null;
let since = 0;
let started = false;

const pageOf = (path) => {
  if (path.startsWith("/dashboard")) return "dashboard";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/impressum") || path.startsWith("/datenschutz")) return "legal";
  if (path.startsWith("/join")) return "join";
  if (path === "/" || path === "") return "login";
  return null;
};

export function track(name, n = 1) {
  events[name] = (events[name] || 0) + n;
}

function stopTimer() {
  if (curPage && since) pages[curPage] = (pages[curPage] || 0) + (Date.now() - since) / 1000;
  since = 0;
}
function startTimer() {
  if (curPage && document.visibilityState === "visible") since = Date.now();
}

export function setPage(path) {
  stopTimer();
  curPage = pageOf(path || "");
  startTimer();
}

function take() {
  stopTimer();
  startTimer();
  const body = { events, pages };
  events = {};
  pages = {};
  const has = Object.keys(body.events).length || Object.keys(body.pages).some((k) => body.pages[k] >= 1);
  return has ? body : null;
}

function flush(leaving = false) {
  if (!getToken()) { events = {}; pages = {}; return; } // nur mit Login
  const body = take();
  if (!body) return;
  if (leaving) {
    // Beim Schließen: fetch mit keepalive (axios kann das nicht)
    try {
      fetch(`${API}/usage`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      }).catch(() => {});
    } catch { /* egal */ }
    return;
  }
  api.post("/usage", body).catch(() => {});
}

export function startUsage() {
  if (started || typeof window === "undefined") return;
  started = true;
  setPage(window.location.pathname);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { stopTimer(); flush(true); } else startTimer();
  });
  window.addEventListener("pagehide", () => flush(true));
  window.setInterval(() => flush(false), 60000);
}
