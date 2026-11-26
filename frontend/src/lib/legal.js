// Betreiberangaben für Impressum + Datenschutz (Pflicht für eine öffentliche .de-Seite, § 5 DDG / Art. 13 DSGVO).
// Platzhalter in [eckigen Klammern] würden auf der Seite einen roten Hinweis auslösen.
export const OPERATOR = {
  name: "Dean Greif",
  street: "Zeithainer Straße 30",
  city: "01127 Dresden",
  country: "Deutschland",
  email: "dean06greif@gmail.com",
  // optional, aber empfohlen (zweiter schneller Kontaktweg); leer lassen = nicht anzeigen
  phone: "",
};

export const LEGAL_UPDATED = "26.11.2026";

export const legalComplete = () => !Object.values(OPERATOR).some((v) => /^\[.*\]$/.test(String(v)));
