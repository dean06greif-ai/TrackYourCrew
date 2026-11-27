// Geführte Tour (Plan 4a): Schritte und Ereignisse.
// Die Seite meldet echte Aktionen per tourEvent("..."); die Tour geht weiter, wenn
// das Ereignis zum aktuellen Schritt passt. So bleibt der Rest des Codes unabhängig.
export const TOUR_EVENT = "tyc:tour";
// Umgekehrte Richtung: das Tutorial bittet einen Teil der Seite, etwas zu zeigen
// (z. B. die eigene Karte umdrehen), wenn man per Pfeil statt per Aktion weitergeht.
export const TOUR_NEED = "tyc:tour-need";

export function tourNeed(name) {
  try {
    window.dispatchEvent(new CustomEvent(TOUR_NEED, { detail: name }));
  } catch {
    /* egal */
  }
}

export function tourEvent(name) {
  try {
    window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: name }));
  } catch {
    /* sehr alte Browser: Tour geht dann eben per "Weiter" */
  }
}

// Schritte des Tutorials. id = Text-Schlüssel tour.<id>.title/.text, target = data-tour-
// Attribut, advance = Ereignis, das den Schritt abschließt (null = nur per Pfeil).
// Mit advance muss der Nutzer etwas tun -> Ziel leuchtet weiß. fallback = Schritt, zu dem
// es zurückgeht, wenn das Ziel verschwindet (z. B. Eintrag-Formular geschlossen).
// card: "bottom" = Erklärkarte unten (wenn oben das Erklärte steht).
// needs = was die Seite öffnen soll, wenn man per Pfeil hierher kommt (sonst fehlt das Ziel
// und es ginge sofort zum Rückfall-Schritt zurück).
// Erster Schritt (Dean 2026-11-26): Begrüßung ohne Ziel – Karte in der Mitte, erklärt kurz die Website.
export const TOUR_STEPS = [
  { id: "welcome", target: null, advance: null },
  { id: "log", target: "log-button", advance: "log-open", needs: "log-closed" },
  { id: "mode", target: "log-mode", advance: null, fallback: 1, needs: "log" },
  { id: "gear", target: "log-gear", advance: "log-settings-open", fallback: 1, needs: "log" },
  { id: "options", target: "log-form", advance: null, fallback: 1, card: "bottom", needs: "log" },
  { id: "save", target: "log-form", advance: "progress-saved", fallback: 1, needs: "log" },
  { id: "flip", target: "my-card", advance: "card-flipped", needs: "card-front" },
  { id: "back", target: "my-card", advance: null, needs: "card-back" },
  { id: "crew", target: "crew-toggle", advance: "crew-open" },
  { id: "invite", target: "invite", advance: null, fallback: 8, needs: "crew" },
  { id: "settings", target: "settings-link", advance: null },
];

// Nur von Hand als erledigt merken, ob die eigene Karte schon einmal umgedreht wurde
// (für den dezenten Hinweis "Doppeltippen zum Umdrehen").
const FLIP_KEY = "tyc_flipped";
export function flipHintDone() {
  try {
    return window.localStorage.getItem(FLIP_KEY) === "1";
  } catch {
    return true;
  }
}
export function markFlipped() {
  try {
    window.localStorage.setItem(FLIP_KEY, "1");
  } catch {
    /* egal */
  }
}
