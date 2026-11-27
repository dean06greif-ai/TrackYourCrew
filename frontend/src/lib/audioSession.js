// Eigene Musik (Spotify & Co.) nicht unterbrechen (Dean 2026-11-26).
// Safari ab iOS 17 kennt navigator.audioSession: „transient“ = kurze Ansage -> andere Musik wird
// leiser statt gestoppt, danach wieder „auto“ (Safari wählt selbst, z. B. fürs Mikrofon).
// Andere Browser: nichts zu tun (Web Audio holt sich unter Android keinen Audio-Fokus,
// die Gerätestimme senkt Musik dort von selbst ab).
const supported = () => typeof navigator !== "undefined" && !!navigator.audioSession;
let holds = 0;
let releaseTimer = 0;

// Eigene Workout-Musik (lib/musicPlayer) hört auf „tyc:duck“ und wird leiser
const signal = (on) => { try { window.dispatchEvent(new CustomEvent("tyc:duck", { detail: on })); } catch { /* egal */ } };

export function duckOthers() {
  holds += 1;
  window.clearTimeout(releaseTimer);
  signal(true);
  // Läuft unsere eigene Musik, nicht zusätzlich die Audio-Sitzung umstellen (würde sie unterbrechen)
  if (!supported() || window.__tycMusicPlaying || window.__tycLockAudio) return;
  try { if (navigator.audioSession.type !== "transient") navigator.audioSession.type = "transient"; } catch { /* egal */ }
}

// kurz nachlaufen lassen, damit die Musik bei schnell folgenden Ansagen nicht pumpt
export function releaseOthers(delay = 400) {
  holds = Math.max(0, holds - 1);
  if (holds) return;
  window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => {
    if (holds) return;
    signal(false);
    if (!supported()) return;
    try { if (navigator.audioSession.type === "transient") navigator.audioSession.type = "auto"; } catch { /* egal */ }
  }, delay);
}

// Für Gerätestimme: Utterance absenken lassen, solange sie spricht
export function duckDuring(utterance) {
  if (!utterance) return;
  duckOthers();
  let done = false;
  const end = () => { if (!done) { done = true; releaseOthers(); } };
  utterance.addEventListener("end", end);
  utterance.addEventListener("error", end);
}
