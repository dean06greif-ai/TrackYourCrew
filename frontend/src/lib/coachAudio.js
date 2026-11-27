// Abspielen der Coach-Aufnahmen über Web Audio: einmal laden + dekodieren, danach startet jede
// Ansage ohne Verzögerung (anders als die Sprachausgabe des Geräts). Fehlen die Dateien,
// liefert play…() false und die Stoppuhr nimmt die Gerätestimme.

import { duckOthers, releaseOthers } from "./audioSession";

let ctx = null;
const packs = {}; // "<paket>/<sprache>" -> { ready: Promise<boolean>, buffers: Map }
let indexPromise = null;
let current = null;
let endAt = 0;

export function getAudioCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  return ctx;
}

// Im Klick-Handler aufrufen: Browser erlauben Ton erst nach einer Berührung
export function unlockAudio() {
  const c = getAudioCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

const base = () => "/coach";

function decode(c, data) {
  return new Promise((resolve, reject) => {
    const p = c.decodeAudioData(data, resolve, reject); // Safari kennt nur die Rückruf-Form
    if (p && p.catch) p.catch(reject);
  });
}

// Stille vorne/hinten finden (die KI-Aufnahmen haben teils bis zu 2 s davon): ohne sie landet jede
// Ansage genau auf der Sekunde. Stumme Aufnahmen (peak ≈ 0) gelten als fehlend -> Gerätestimme.
export function trimInfo(buf) {
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  let peak = 0;
  for (let i = 0; i < d.length; i += 1) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  if (peak < 0.02) return null;
  const th = peak * 0.05;
  let a = 0;
  while (a < d.length && Math.abs(d[a]) < th) a += 1;
  let z = d.length - 1;
  while (z > a && Math.abs(d[z]) < th) z -= 1;
  const pad = 0.03 * sr; // kleiner Rand, damit nichts abgehackt klingt
  const start = Math.max(0, a - pad) / sr;
  const end = Math.min(d.length, z + 4 * pad) / sr;
  return { buf, offset: start, dur: Math.max(0.05, end - start) };
}

// Übersicht der Coach-Stimmen (public/coach/packs.json): [{ id, label, voice, style, langs }]
export function loadPackIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        const r = await fetch(`${base()}/packs.json`, { cache: "no-cache" });
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data.packs) ? data.packs : [];
      } catch {
        return [];
      }
    })();
  }
  return indexPromise;
}

export function loadCoachClips(packId, lang) {
  const k = `${packId}/${lang}`;
  if (packs[k]) return packs[k].ready;
  const pack = { buffers: new Map() };
  packs[k] = pack;
  pack.ready = (async () => {
    try {
      const c = getAudioCtx();
      if (!c || typeof fetch !== "function") return false;
      const r = await fetch(`${base()}/${packId}/${lang}/manifest.json`, { cache: "no-cache" });
      if (!r.ok) return false;
      const manifest = await r.json(); // Dev-Server liefert sonst index.html -> wirft -> false
      const entries = Object.entries(manifest.clips || {});
      await Promise.all(entries.map(async ([id, info]) => {
        try {
          const res = await fetch(`${base()}/${packId}/${lang}/${info.file}`);
          if (!res.ok) return;
          const clip = trimInfo(await decode(c, await res.arrayBuffer()));
          if (clip) pack.buffers.set(id, { ...clip, url: `${base()}/${packId}/${lang}/${info.file}` });
        } catch { /* einzelne Datei fehlt: dafür Gerätestimme */ }
      }));
      return pack.buffers.size > 0;
    } catch {
      return false;
    }
  })();
  return pack.ready;
}

export function hasCoachClips(packId, lang) {
  return (packs[`${packId}/${lang}`]?.buffers.size || 0) > 0;
}

// Sperrbildschirm / Hintergrund (Dean 2026-11-27): iPhone hält Web Audio dann an, ein <audio>-Element
// läuft aber weiter, solange die Seite Ton abspielt (Workout: stille Tonspur). Das Element muss einmal
// in einem Tipp „entsperrt“ werden (unlockBackgroundAudio), danach darf es auch im Hintergrund starten.
let bgEl = null;
let bgStop = 0;
export function unlockBackgroundAudio() {
  if (typeof Audio === "undefined") return;
  if (!bgEl) { bgEl = new Audio(); bgEl.preload = "auto"; bgEl.setAttribute("playsinline", ""); }
  try {
    bgEl.src = "/sounds/silence.mp3";
    bgEl.play().then(() => bgEl.pause()).catch(() => {});
  } catch { /* egal */ }
}
function playInBackground(clip) {
  if (!bgEl || !clip.url) return false;
  try {
    window.clearTimeout(bgStop);
    bgEl.src = clip.url;
    bgEl.currentTime = clip.offset;
    duckOthers();
    bgEl.play().catch(() => {});
    bgStop = window.setTimeout(() => { try { bgEl.pause(); } catch { /* egal */ } releaseOthers(); }, (clip.dur + 0.1) * 1000);
    return true;
  } catch {
    return false;
  }
}
const inBackground = (c) => (typeof document !== "undefined" && document.hidden) || (c && c.state !== "running" && c.state !== "suspended");

// interrupt: laufende Ansage abbrechen; sonst hinten anstellen (nichts überlagert sich)
export function playCoachClip(packId, lang, id, interrupt = false) {
  const clip = packs[`${packId}/${lang}`]?.buffers.get(id);
  const c = ctx;
  if (!clip || !c) return false;
  if (bgEl && inBackground(c)) return playInBackground(clip);
  try {
    if (c.state === "suspended") c.resume().catch(() => {});
    const now = c.currentTime;
    if (interrupt && current) {
      try { current.stop(); } catch { /* schon zu Ende */ }
      endAt = now;
    }
    const startAt = Math.max(now, endAt);
    const src = c.createBufferSource();
    src.buffer = clip.buf;
    src.connect(c.destination);
    src.start(startAt, clip.offset, clip.dur);
    // iPhone: eigene Musik währenddessen leiser statt gestoppt
    duckOthers();
    src.onended = () => releaseOthers();
    current = src;
    endAt = startAt + clip.dur;
    return true;
  } catch {
    return false;
  }
}

export function stopCoachClips() {
  if (current) {
    try { current.stop(); } catch { /* egal */ }
  }
  current = null;
  endAt = 0;
}
