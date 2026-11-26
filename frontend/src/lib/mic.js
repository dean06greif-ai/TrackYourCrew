// Mikrofon-Funktionen an/aus (Dean 2026-11-26): pro Gerät (am Handy an, am PC vielleicht nicht).
// Aus = alle Mikro-Knöpfe verschwinden (Stoppuhr-Sprachsteuerung, Eintragen per Sprache).
import { useEffect, useState } from "react";

const KEY = "tyc_mic";
export const MIC_EVENT = "tyc:mic";

export const speechSupported = () =>
  typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function micEnabled() {
  try {
    return window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setMicEnabled(on) {
  try { window.localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* egal */ }
  try { window.dispatchEvent(new Event(MIC_EVENT)); } catch { /* egal */ }
}

// Für Komponenten: true, wenn der Browser Sprache erkennt UND der Nutzer es nicht ausgeschaltet hat.
export function useMicEnabled() {
  const [on, setOn] = useState(() => micEnabled());
  useEffect(() => {
    const h = () => setOn(micEnabled());
    window.addEventListener(MIC_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(MIC_EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return on && speechSupported();
}
