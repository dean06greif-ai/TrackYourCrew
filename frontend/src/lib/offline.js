// Offline-Eintragen (Dean 2026-11-26): letzter Stand lokal, Einträge ohne Netz in einen Postausgang,
// beim nächsten Netz automatisch senden. Reine Funktionen oben (getestet in offline.test.js).
import { useEffect, useState } from "react";

// Netzfehler = keine Antwort vom Server (axios: kein e.response). 4xx/5xx sind KEINE Netzfehler.
export const isNetworkError = (e) => !!e && !e.response && e.code !== "ERR_CANCELED";

const round2 = (n) => Math.round(n * 100) / 100;

// Konflikt beim Senden (anderes Gerät hat inzwischen gespeichert): nichts überschreiben, sondern
// je Tag und Übung die eigene Änderung (lokal − Basis) auf den Server-Stand aufrechnen.
export function mergeDays(serverDays = {}, baseDays = {}, localDays = {}) {
  const out = JSON.parse(JSON.stringify(serverDays || {}));
  const dayKeys = new Set([...Object.keys(baseDays || {}), ...Object.keys(localDays || {})]);
  for (const d of dayKeys) {
    const keys = new Set([...Object.keys(baseDays?.[d] || {}), ...Object.keys(localDays?.[d] || {})]);
    for (const k of keys) {
      const delta = (Number(localDays?.[d]?.[k]) || 0) - (Number(baseDays?.[d]?.[k]) || 0);
      if (!delta) continue;
      const cur = Number(out?.[d]?.[k]) || 0;
      out[d] = { ...(out[d] || {}), [k]: Math.max(0, round2(cur + delta)) };
    }
  }
  return out;
}

// Schon angekommen? (Antwort ging verloren, Anfrage kam aber an): alle eigenen Änderungen stehen
// bereits genau so auf dem Server -> nicht noch einmal aufrechnen (sonst doppelt gezählt).
export function alreadyApplied(serverDays = {}, baseDays = {}, localDays = {}) {
  const dayKeys = new Set([...Object.keys(baseDays || {}), ...Object.keys(localDays || {})]);
  let changed = 0;
  for (const d of dayKeys) {
    const keys = new Set([...Object.keys(baseDays?.[d] || {}), ...Object.keys(localDays?.[d] || {})]);
    for (const k of keys) {
      const local = Number(localDays?.[d]?.[k]) || 0;
      if (local === (Number(baseDays?.[d]?.[k]) || 0)) continue;
      changed += 1;
      if (round2(Number(serverDays?.[d]?.[k]) || 0) !== round2(local)) return false;
    }
  }
  return changed > 0;
}

// Neuer Offline-Eintrag in den Postausgang: je Woche nur ein Eintrag (der Server bekommt immer den
// ganzen Wochenstand). Basis (Stand vor der ersten Offline-Änderung) bleibt beim ersten Eintrag.
export function queueEntry(outbox = [], entry) {
  const prev = outbox.find((o) => o.userId === entry.userId && o.payload.week_number === entry.payload.week_number);
  const next = prev
    ? { ...entry, baseDays: prev.baseDays, payload: { ...entry.payload, base_updated_at: prev.payload.base_updated_at } }
    : entry;
  return [...outbox.filter((o) => o !== prev), next];
}

// Wochensummen aus den Tagen (für die Anzeige der eigenen Karte, solange offline)
export function sumsFromDays(days = {}) {
  const sums = {};
  for (const d of Object.keys(days || {})) {
    for (const [k, v] of Object.entries(days[d] || {})) sums[k] = round2((sums[k] || 0) + (Number(v) || 0));
  }
  return sums;
}

// ── Browser-Teil ────────────────────────────────────────────────────────
const SNAP = "tyc_off_";
const OUTBOX = "tyc_outbox";
export const OUTBOX_EVENT = "tyc:outbox";

export function saveSnapshot(key, data) {
  try { window.localStorage.setItem(SNAP + key, JSON.stringify({ at: Date.now(), data })); } catch { /* voll/privat: egal */ }
}
export function loadSnapshot(key) {
  try { return JSON.parse(window.localStorage.getItem(SNAP + key) || "null"); } catch { return null; }
}
export function readOutbox() {
  try { return JSON.parse(window.localStorage.getItem(OUTBOX) || "[]") || []; } catch { return []; }
}
export function writeOutbox(list) {
  try {
    if (list.length) window.localStorage.setItem(OUTBOX, JSON.stringify(list));
    else window.localStorage.removeItem(OUTBOX);
  } catch { /* egal */ }
  try { window.dispatchEvent(new Event(OUTBOX_EVENT)); } catch { /* egal */ }
}
// Beim Abmelden: nichts vom Konto auf dem Gerät lassen
export function clearOffline() {
  try {
    Object.keys(window.localStorage).filter((k) => k.startsWith(SNAP)).forEach((k) => window.localStorage.removeItem(k));
  } catch { /* egal */ }
  writeOutbox([]);
}

export function useOnline() {
  const [on, setOn] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

export function useOutboxCount(userId) {
  const count = () => readOutbox().filter((o) => !userId || o.userId === userId).length;
  const [n, setN] = useState(count);
  useEffect(() => {
    const h = () => setN(count());
    h();
    window.addEventListener(OUTBOX_EVENT, h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener(OUTBOX_EVENT, h); window.removeEventListener("storage", h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  return n;
}
