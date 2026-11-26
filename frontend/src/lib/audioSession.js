// Eigene Musik (Spotify & Co.) nicht unterbrechen (Dean 2026-11-26).
// Safari ab iOS 17 kennt navigator.audioSession: „transient“ = kurze Ansage -> andere Musik wird
// leiser statt gestoppt, danach wieder „auto“ (Safari wählt selbst, z. B. fürs Mikrofon).
// Andere Browser: nichts zu tun (Web Audio holt sich unter Android keinen Audio-Fokus,
// die Gerätestimme senkt Musik dort von selbst ab).
const supported = () => typeof navigator !== "undefined" && !!navigator.audioSession;
let holds = 0;
let releaseTimer = 0;

export function duckOthers() {
  if (!supported()) return;
  holds += 1;
  window.clearTimeout(releaseTimer);
  try { if (navigator.audioSession.type !== "transient") navigator.audioSession.type = "transient"; } catch { /* egal */ }
}

// kurz nachlaufen lassen, damit die Musik bei schnell folgenden Ansagen nicht pumpt
export function releaseOthers(delay = 400) {
  if (!supported()) return;
  holds = Math.max(0, holds - 1);
  if (holds) return;
  window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => {
    try { if (!holds) navigator.audioSession.type = "auto"; } catch { /* egal */ }
  }, delay);
}

// Für Gerätestimme: Utterance absenken lassen, solange sie spricht
export function duckDuring(utterance) {
  if (!supported() || !utterance) return;
  duckOthers();
  let done = false;
  const end = () => { if (!done) { done = true; releaseOthers(); } };
  utterance.addEventListener("end", end);
  utterance.addEventListener("error", end);
}
