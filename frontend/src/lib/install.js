// "Als App installieren" (Plan 10): Geräteerkennung und Regeln, wann der Hinweis
// erscheint. Die Entscheidungsfunktionen sind rein (ohne Browser) und getestet.

// Welche Anleitung passt? "ios" | "android" | "inapp" | "desktop" | "installed"
export function installPlatform({ ua = "", standalone = false, touchMac = false } = {}) {
  if (standalone) return "installed";
  const s = String(ua);
  // In-App-Browser (Instagram, Facebook, WhatsApp, TikTok, Snapchat, LinkedIn, Line, Telegram-Webview)
  if (/Instagram|FBAN|FBAV|FB_IAB|WhatsApp|musical_ly|TikTok|Bytedance|Snapchat|LinkedInApp|\bLine\/|Telegram/i.test(s)) return "inapp";
  if (/iPhone|iPad|iPod/i.test(s) || touchMac) {
    // Nur Safari kann auf iOS zum Home-Bildschirm hinzufügen (Chrome/Firefox seit iOS 16.4 auch,
    // aber mit anderem Menü) – wir zeigen die Safari-Anleitung, andere Browser sehen den Umweg-Hinweis.
    return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(s) ? "inapp" : "ios";
  }
  if (/Android/i.test(s)) return "android";
  return "desktop";
}

export const REMIND_AFTER_DAYS = 14;

// Soll der Hinweis von selbst erscheinen? (Nie am PC, nie beim ersten Besuch.)
export function shouldAutoShow(platform, state = {}, now = Date.now()) {
  if (!["ios", "android", "inapp"].includes(platform)) return false;
  if (state.never) return false;
  if (state.snoozedUntil && now < state.snoozedUntil) return false;
  return (state.visits || 0) >= 2 || !!state.logged;
}

export function snoozedState(state = {}, now = Date.now()) {
  return { ...state, snoozedUntil: now + REMIND_AFTER_DAYS * 24 * 3600 * 1000 };
}

// ---- Browser-Teil ----------------------------------------------------------
const KEY = "tyc_install";
const SESSION_KEY = "tyc_install_counted";

export function readInstallState() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function writeInstallState(state) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* privater Modus: dann eben ohne Gedächtnis */
  }
}

// Besuch zählen (einmal pro Browser-Sitzung).
export function countVisit() {
  try {
    if (window.sessionStorage.getItem(SESSION_KEY)) return readInstallState();
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* egal */
  }
  const s = readInstallState();
  const next = { ...s, visits: (s.visits || 0) + 1 };
  writeInstallState(next);
  return next;
}

export function markLogged() {
  const s = readInstallState();
  if (!s.logged) writeInstallState({ ...s, logged: true });
}

export function currentPlatform() {
  const standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  const touchMac = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1; // iPad mit Desktop-Ansicht
  return installPlatform({ ua: navigator.userAgent, standalone, touchMac });
}

// Android: das Browser-Ereignis für den echten Installieren-Knopf früh abfangen.
let deferredPrompt = null;
const listeners = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn(true));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    writeInstallState({ ...readInstallState(), never: true });
    listeners.forEach((fn) => fn(false));
  });
}

export function canPromptInstall() {
  return !!deferredPrompt;
}

export function onPromptAvailable(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return "unavailable";
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice.catch(() => ({ outcome: "dismissed" }));
  deferredPrompt = null;
  return choice?.outcome || "dismissed";
}
