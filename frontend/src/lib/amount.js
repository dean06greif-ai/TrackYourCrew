// Ein Wert mit Einheit für die Anzeige. Zeit-Übungen (Sek./Min./Std.) erscheinen als Uhrzeit
// („4:30 min“), alles andere als Zahl in Landesschreibweise mit Einheit („6,7 km“).
import { formatNumber } from "../i18n";
import { clockParts } from "./stopwatch";

export function amountParts(value, unit, locale, maxFrac) {
  const c = clockParts(value, unit);
  if (c) return { num: c.text, unit: c.suffix };
  return { num: formatNumber(value, locale, maxFrac), unit: unit || "" };
}

export function formatAmount(value, unit, locale, maxFrac) {
  const p = amountParts(value, unit, locale, maxFrac);
  return p.unit ? `${p.num} ${p.unit}` : p.num;
}
