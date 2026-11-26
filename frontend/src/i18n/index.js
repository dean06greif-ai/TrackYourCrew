// Mehrsprachigkeit ohne Zusatzbibliothek.
// - Sprache: gespeicherte Wahl (localStorage "tyc_lang") > Konto-Sprache > Browser-Sprache > Englisch.
// - t("bereich.schluessel", { name: "Dean" }) ersetzt {name} im Text.
// - Fehlt ein Text in einer Sprache, wird Englisch angezeigt (nie ein leerer Text).
// Neue Sprache: Datei in diesem Ordner anlegen (Kopie von en.js) und unten eintragen.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "./en";
import de from "./de";
import es from "./es";
import fr from "./fr";

export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
];
const DICTS = { en, de, es, fr };
const SUPPORTED = Object.keys(DICTS);
const STORAGE_KEY = "tyc_lang";

export function normalizeLang(code) {
  const c = String(code || "").slice(0, 2).toLowerCase();
  return SUPPORTED.includes(c) ? c : null;
}

export function detectLanguage() {
  try {
    const stored = normalizeLang(window.localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    /* Speicher gesperrt */
  }
  const list = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
  for (const l of list) {
    const n = normalizeLang(l);
    if (n) return n;
  }
  return "en";
}

// Aktuelle Sprache auch außerhalb von React (z. B. für API-Header).
let currentLang = typeof window !== "undefined" ? detectLanguage() : "en";
export const getLang = () => currentLang;

export function translate(lang, key, vars) {
  let s = DICTS[lang]?.[key] ?? DICTS.en[key];
  if (s === undefined) {
    if (!import.meta.env.PROD) console.warn(`[i18n] fehlender Text: ${key}`);
    return key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}

// Locale für Datums-/Zahlenformate
export const LOCALES = { en: "en-GB", de: "de-DE", es: "es-ES", fr: "fr-FR" };

const LanguageContext = createContext({
  lang: currentLang,
  setLang: () => {},
  t: (k, v) => translate(currentLang, k, v),
  locale: LOCALES[currentLang],
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(currentLang);

  const setLang = useCallback((code, { remember = true } = {}) => {
    const n = normalizeLang(code);
    if (!n) return;
    currentLang = n;
    setLangState(n);
    if (remember) {
      try { window.localStorage.setItem(STORAGE_KEY, n); } catch { /* egal */ }
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
    locale: LOCALES[lang],
  }), [lang, setLang]);

  return React.createElement(LanguageContext.Provider, { value }, children);
}

export const useI18n = () => useContext(LanguageContext);

// Hat der Nutzer die Sprache auf diesem Gerät schon selbst gewählt?
export function hasStoredLanguage() {
  try { return !!normalizeLang(window.localStorage.getItem(STORAGE_KEY)); } catch { return false; }
}

// Wochentage Mo..So in der jeweiligen Sprache ("short" = Mo, "long" = Montag).
export function weekdayNames(locale, style = "long") {
  const monday = new Date(Date.UTC(2024, 0, 1)); // 1.1.2024 war ein Montag
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * 86400000);
    const s = d.toLocaleDateString(locale, { weekday: style, timeZone: "UTC" }).replace(".", "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}

// Zahl im Format der Sprache (de: 2,7 / 1.357 · en: 2.7 / 1,357), max. 2 Nachkommastellen.
export function formatNumber(value, locale, maxFrac = 2) {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString(locale, { maximumFractionDigits: maxFrac });
}
