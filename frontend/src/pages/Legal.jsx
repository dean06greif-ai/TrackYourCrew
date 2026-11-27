// Impressum (§ 5 DDG) + Datenschutzerklärung (Art. 13 DSGVO). Rechtstexte bewusst nur auf Deutsch
// (deutscher Anbieter); in anderen Sprachen steht ein kurzer Hinweis darüber.
// Betreiberdaten: lib/legal.js. Ohne Login erreichbar und ohne Server (lädt auch während Render aufwacht).
import { Link } from "react-router-dom";
import { Lightning, ArrowLeft, WarningCircle } from "@phosphor-icons/react";
import { useI18n } from "../i18n";
import { OPERATOR, LEGAL_UPDATED, legalComplete } from "../lib/legal";

const H = ({ children }) => <h2 className="font-anton text-xl tracking-tight text-white mt-8 mb-2">{children}</h2>;
const P = ({ children }) => <p className="text-sm text-ink-2 leading-relaxed mb-3">{children}</p>;
const L = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1 mb-3 text-sm text-ink-2 leading-relaxed">
    {items.map((x, i) => <li key={i}>{x}</li>)}
  </ul>
);

function Address() {
  const o = OPERATOR;
  return (
    <P>
      {o.name}<br />{o.street}<br />{o.city}<br />{o.country}<br />
      E-Mail: <a className="text-[#CCFF00] hover:underline" href={`mailto:${o.email}`}>{o.email}</a>
      {o.phone ? <><br />Telefon: {o.phone}</> : null}
    </P>
  );
}

function Imprint() {
  return (
    <>
      <H>Angaben gemäß § 5 DDG</H>
      <Address />
      <H>Verantwortlich für den Inhalt</H>
      <P>{OPERATOR.name}, Anschrift wie oben.</P>
      <H>Hinweis</H>
      <P>
        TrackYourCrew ist ein privates, nicht-kommerzielles Projekt. Inhalte, die Nutzer selbst eintragen
        (Namen, Bilder, Trainingswerte), stammen von den Nutzern. Wir sind nicht verpflichtet und nicht bereit,
        an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </P>
      <H>Haftung für Links</H>
      <P>
        Für Inhalte verlinkter fremder Seiten sind ausschließlich deren Betreiber verantwortlich. Bei Bekanntwerden
        von Rechtsverletzungen entfernen wir solche Links umgehend.
      </P>
    </>
  );
}

function Privacy() {
  return (
    <>
      <H>1. Verantwortlicher</H>
      <Address />
      <P>Kontakt für alle Datenschutzfragen: die oben genannte E-Mail-Adresse.</P>

      <H>2. Was wir verarbeiten und warum</H>
      <P><strong className="text-white">Konto (Google-Anmeldung).</strong> Wenn du dich mit Google anmeldest, erhalten
        wir von Google deinen Namen, deine E-Mail-Adresse, dein Profilbild und eine Google-Kennung. Ein Passwort
        sehen wir nie. Zweck: dein Konto anlegen und dich wiedererkennen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
        (Nutzungsvertrag).</P>
      <P><strong className="text-white">Deine Inhalte.</strong> Übungen, Ziele, Trainingswerte je Tag, Streaks,
        Meilensteine, Anzeigename, Code (Handle), selbst hochgeladenes Profilbild, Freunde und Anfragen, Emojis und
        Herausforderungen, Einstellungen. Zweck: die Funktionen der App, einschließlich der Anzeige für deine Crew.
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</P>
      <P><strong className="text-white">Sichtbarkeit.</strong> Deine Crew (Personen, die du hinzugefügt hast oder die
        dich hinzugefügt haben) sieht deinen Namen, dein Bild, deine Übungen, Werte, Streaks und Ränge. Deine
        E-Mail-Adresse sieht niemand außer dir. Prozent-Vergleiche („besser als x % der Nutzer“) beruhen auf
        zusammengefassten Werten und zeigen keine einzelnen Personen.</P>
      <P><strong className="text-white">Feedback.</strong> Was du über „Feedback“ schickst, wird mit deinem Namen
        gespeichert und dem Betreiber per Telegram zugestellt (Telegram Messenger Inc., Server auch außerhalb der EU).
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO (Bearbeitung deiner Nachricht).</P>
      <P><strong className="text-white">Fehlermeldungen.</strong> Bei technischen Fehlern erhält der Betreiber eine
        kurze Meldung per Telegram (Art des Fehlers, ggf. interne Nutzerkennung, keine Trainingsdaten).
        Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (stabiler Betrieb).</P>
      <P><strong className="text-white">Nutzungsstatistik.</strong> Damit wir sehen, welche Funktionen genutzt werden
        und was verbessert werden sollte, zählen wir, wenn du eingeloggt bist, wie oft du bestimmte Funktionen
        verwendest (z. B. Eintragen, Stoppuhr, Intervall-Timer, Musik) und wie lange du ungefähr auf welcher Seite
        bist – je Kalenderwoche, auf unserem eigenen Server, ohne Inhalte, ohne IP-Adresse und ohne Drittanbieter.
        Der Betreiber erhält daraus wöchentlich nur zusammengefasste Zahlen (z. B. „30 aktive Nutzer, Stoppuhr
        12× genutzt“) per Telegram. Die Zähler werden nach spätestens 12 Monaten gelöscht und mit deinem Konto
        entfernt. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (Verbesserung des Angebots).</P>
      <P><strong className="text-white">Zeitzone.</strong> Dein Gerät übermittelt seine Zeitzone (z. B.
        „Europe/Berlin“), damit deine Woche zur richtigen Uhrzeit endet. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</P>
      <P><strong className="text-white">Erinnerungen (optional).</strong> Wenn du Erinnerungen einschaltest, speichern
        wir die Push-Adresse deines Browsers und deine gewählte Uhrzeit. Die Nachricht wird über den Push-Dienst
        deines Browser- bzw. Geräteherstellers zugestellt (z. B. Google, Apple, Mozilla). Rechtsgrundlage:
        Art. 6 Abs. 1 lit. a DSGVO (Einwilligung, jederzeit in den Einstellungen abschaltbar).</P>
      <P><strong className="text-white">Spracheingabe (optional).</strong> Mikrofon-Funktionen nutzen die
        Spracherkennung deines Browsers. Je nach Browser wird das Gesprochene dafür an den Browser-Anbieter
        übertragen (bei Chrome z. B. an Google). Wir selbst erhalten keine Aufnahmen, nur das Ergebnis als Text, und
        speichern davon nur die eingetragenen Werte. Die Funktion startet nur, wenn du ein Mikrofon antippst, und ist
        in den Einstellungen abschaltbar. Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO.</P>

      <H>3. Hosting und Dienstleister</H>
      <L items={[
        "Render Services, Inc. (USA) – Betrieb von Website und Server, Rechenzentrum in Frankfurt am Main.",
        "MongoDB, Inc. (USA) – Datenbank „MongoDB Atlas“.",
        "Google Ireland Ltd. / Google LLC – Anmeldung („Mit Google fortfahren“).",
        "Telegram Messenger Inc. – Zustellung von Feedback, Fehlermeldungen und der wöchentlichen Nutzungsübersicht (nur zusammengefasste Zahlen) an den Betreiber.",
      ]} />
      <P>Mit diesen Anbietern bestehen bzw. gelten Auftragsverarbeitungsbedingungen. Für Übermittlungen in die USA
        stützen sich die Anbieter auf das EU-US Data Privacy Framework bzw. EU-Standardvertragsklauseln
        (Art. 45, 46 DSGVO). Beim Aufruf der Seite verarbeitet der Hoster technisch notwendig deine IP-Adresse und
        Browserdaten (Server-Logs); wir selbst speichern keine IP-Adressen.</P>
      <P>Schriften und Symbole werden von unserem eigenen Server geladen, nicht von Google Fonts oder anderen
        Drittanbietern. Es gibt keine Werbung, keine Analyse- oder Tracking-Dienste.</P>

      <H>4. Cookies und lokaler Speicher</H>
      <P>Wir verwenden nur, was für die App technisch nötig ist (§ 25 Abs. 2 TDDDG), daher gibt es keinen
        Cookie-Banner: ein Anmelde-Cookie und dasselbe Anmelde-Token im lokalen Speicher deines Browsers (bleibt
        1 Tag gültig oder 30 Tage bei „Angemeldet bleiben“), außerdem Einstellungen deines Geräts wie Sprache,
        Mikrofon an/aus, Stoppuhr- und Coach-Einstellungen sowie „schon gesehen“-Merker für Hinweise und Animationen.</P>

      <H>5. Speicherdauer</H>
      <P>Deine Daten speichern wir, solange dein Konto besteht. Abgelaufene Anmeldungen werden ungültig; Anmelde-
        Zwischenstände werden nach kurzer Zeit gelöscht. Wenn du dein Konto löschst, entfernen wir sofort alle
        Daten zu dir: Konto, Ziele, Einträge, Emojis, Herausforderungen, Feedback, Push-Adressen, Anmeldungen, und
        wir entfernen dich aus den Crews und Anfragen anderer. Bereits per Telegram zugestellte Feedback-Nachrichten
        löscht der Betreiber auf Wunsch.</P>

      <H>6. Deine Rechte</H>
      <P>Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18),
        Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO) sowie auf Widerruf erteilter Einwilligungen
        mit Wirkung für die Zukunft (Art. 7 Abs. 3). Vieles geht direkt in der App: In den Einstellungen kannst du
        alle deine Daten herunterladen und dein Konto vollständig löschen. Für alles andere genügt eine E-Mail.</P>
      <P>Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, z. B. bei der Behörde deines
        Wohnorts.</P>

      <H>7. Mindestalter</H>
      <P>Die Nutzung ist ab 16 Jahren gedacht. Jüngere brauchen die Zustimmung ihrer Eltern.</P>
    </>
  );
}

export default function Legal({ page }) {
  const { t, lang } = useI18n();
  const title = page === "imprint" ? t("legal.imprint") : t("legal.privacy");
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white" data-testid={`legal-${page}`}>
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="flex items-center gap-3 mb-8">
          <Link to="/" className="flex items-center gap-2 text-ink-2 hover:text-white text-xs uppercase tracking-widest" data-testid="legal-back">
            <ArrowLeft size={16} weight="bold" /> {t("legal.back")}
          </Link>
          <span className="ml-auto flex items-center gap-2"><Lightning size={20} weight="fill" className="text-[#CCFF00]" /><span className="font-anton tracking-widest">TRACKER</span></span>
        </div>
        <h1 className="font-anton text-4xl md:text-5xl tracking-tight">{title}</h1>
        <p className="text-[10px] uppercase tracking-[0.3em] text-ink-3 mt-2">{t("legal.updated", { date: LEGAL_UPDATED })}</p>
        {lang !== "de" && <p className="text-xs text-ink-3 mt-4 border-l-2 border-[#CCFF00] pl-3" data-testid="legal-german-only">{t("legal.germanOnly")}</p>}
        {!legalComplete() && (
          <p className="flex items-center gap-2 text-xs text-[#FF3B30] mt-4" data-testid="legal-incomplete">
            <WarningCircle size={16} weight="bold" /> Betreiberangaben fehlen noch (frontend/src/lib/legal.js).
          </p>
        )}
        <div className="mt-6" lang="de">{page === "imprint" ? <Imprint /> : <Privacy />}</div>
        <div className="mt-10 pt-6 border-t border-[#1A1A1A] flex gap-4 text-[10px] uppercase tracking-[0.3em] text-ink-3">
          <Link to="/impressum" className="hover:text-[#CCFF00]">{t("legal.imprint")}</Link>
          <Link to="/datenschutz" className="hover:text-[#CCFF00]">{t("legal.privacy")}</Link>
        </div>
      </div>
    </div>
  );
}

