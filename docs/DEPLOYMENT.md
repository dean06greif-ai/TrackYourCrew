# Deployment: Render + trackyourcrew.de

Ziel: Website unter **https://trackyourcrew.de**, Backend unter **https://api.trackyourcrew.de**,
beides bei Render, aus einem GitHub-Repo. Die Konfiguration steht in `render.yaml` (Blueprint).

Warum die api-Subdomain? Website und Backend liegen dann unter derselben Domain. Das Login-Cookie
gilt damit als "eigenes" Cookie und wird auch von Safari/iPhone nicht mehr blockiert.

Reihenfolge: 0 → 6. Schritte mit 🔑 brauchen deine Zugangsdaten, die mache ich nicht für dich.

---

## 0. Voraussetzung: Code auf GitHub
✅ Erledigt (2026-11-26): Code liegt in `dean06greif-ai/TrackYourCrew`, Zweig `main`.
Render baut immer aus GitHub. **Jeder Push auf `main` löst danach ein Live-Deployment aus.**

## 0b. 🔑 Impressum + Datenschutz ausfüllen (Pflicht, 2 Minuten)
Die Seiten `/impressum` und `/datenschutz` sind fertig und überall verlinkt (Login, Dashboard-Fußzeile).
Es fehlen nur deine Angaben: `frontend/src/lib/legal.js` öffnen und alles in `[eckigen Klammern]` ersetzen
(Name, ladungsfähige Anschrift – kein Postfach, E-Mail; Telefon optional). Solange etwas fehlt, zeigen die
Seiten einen roten Hinweis. Danach committen; das Datum steht in `LEGAL_UPDATED`.
Die Datenschutzerklärung beschreibt den Stand vom 26.11.2026 (Render Frankfurt, MongoDB Atlas, Google-Login,
Telegram, Web Push, Browser-Spracherkennung, keine Analyse/Werbung, Schriften lokal). Kommt ein neuer Dienst
dazu, den Text in `frontend/src/pages/Legal.jsx` nachziehen.

## 1. 🔑 Render: Blueprint anlegen
1. render.com → *New* → *Blueprint* → Repo `TrackYourCrew` wählen.
2. Render liest `render.yaml` und schlägt zwei Dienste vor:
   - `trackyourcrew-api` (Backend, Frankfurt)
   - `trackyourcrew-web` (Website, statisch, schläft nie ein)
3. Render fragt die geheimen Werte ab (stehen nicht im Repo):

| Variable | Woher |
|---|---|
| `MONGO_URI` | MongoDB Atlas → *Connect* → Drivers. **Vorher Passwort erneuern (BACKLOG S1)!** |
| `DB_NAME` | wie bisher (siehe deine `backend/.env`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs → Anmeldedaten. **Neues Secret erzeugen (S1b)!** |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | siehe Schritt 5 (optional, kann später) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | siehe Schritt 5b (optional, kann später) |

`CRON_SECRET` erzeugt Render selbst (Zufallswert, im Dashboard unter *Environment* ablesbar).

4. MongoDB Atlas → *Network Access*: Render braucht Zugriff. Am einfachsten `0.0.0.0/0`
   (Schutz kommt dann über das starke DB-Passwort).
5. Bis die Domain fertig ist, laufen die Dienste unter `…onrender.com`. Zum Testen vorübergehend
   `FRONTEND_URL`, `BACKEND_PUBLIC_URL`, `CORS_ORIGINS` und `REACT_APP_BACKEND_URL` auf diese
   Adressen setzen und danach wieder auf die Domain umstellen.

> Die beiden alten Render-Backends (`trackerapp-fr8f`, `tracker-07uz`) erst abschalten, wenn
> alles läuft (BACKLOG D2). Netlify danach ebenfalls (D3).

## 2. 🔑 Domain bei INWX verbinden
In Render bei beiden Diensten unter *Settings → Custom Domains* stehen die Domains schon
(aus `render.yaml`). Render zeigt dort die genauen Ziel-Einträge an. Bei INWX unter
*Domains → trackyourcrew.de → DNS* anlegen:

| Typ | Name | Wert | Wofür |
|---|---|---|---|
| A | (leer / @) | `216.24.57.1` (Wert aus Render übernehmen) | trackyourcrew.de |
| CNAME | www | `trackyourcrew-web.onrender.com` | www.trackyourcrew.de |
| CNAME | api | `trackyourcrew-api.onrender.com` | Backend |

- Vorhandene A/AAAA-Einträge für `@` und `www` (z. B. INWX-Parkseite) vorher löschen.
- Danach in Render auf *Verify* klicken. DNS braucht ein paar Minuten bis Stunden.
  Das HTTPS-Zertifikat stellt Render automatisch aus.
- `www` leitet Render automatisch auf `trackyourcrew.de` um.

## 3. 🔑 Google-Login auf die neue Domain umstellen
Google Cloud Console → *APIs & Dienste → Anmeldedaten* → OAuth-Client:
- **Autorisierte JavaScript-Quellen:** `https://trackyourcrew.de`
- **Autorisierte Weiterleitungs-URIs:** `https://api.trackyourcrew.de/api/auth/google/callback`
- Die lokalen Einträge (`http://localhost:5000/...`) für die Entwicklung drinlassen.
- Zustimmungsbildschirm: App-Name "TrackYourCrew", Startseite `https://trackyourcrew.de`.

## 4. Testen
1. `https://api.trackyourcrew.de/api/health` → `{"ok": true}`
2. `https://trackyourcrew.de` → Login-Seite in deiner Browser-Sprache
3. Mit Google anmelden → Dashboard. Auf dem iPhone in Safari ebenfalls testen.
4. Einstellungen → Feedback senden → kommt auf Telegram an (wenn Schritt 5 erledigt).

## 5. 🔑 Telegram-Bot für Feedback (2 Minuten)
1. In Telegram **@BotFather** öffnen → `/newbot` → Namen vergeben (z. B. "TrackYourCrew Feedback").
   BotFather schickt dir den **Token** (sieht aus wie `123456:ABC-DEF…`). Geheim halten!
2. Deinen neuen Bot öffnen und ihm irgendeine Nachricht schicken (z. B. "hi").
3. Im Browser öffnen (Token einsetzen): `https://api.telegram.org/bot<TOKEN>/getUpdates`
   → in der Antwort steht `"chat":{"id":123456789,…}` → das ist deine **Chat-ID**.
4. In Render beim Backend `TELEGRAM_BOT_TOKEN` und `TELEGRAM_CHAT_ID` eintragen → speichern
   (Render startet das Backend neu).
5. Feedback geht auch ohne Telegram nicht verloren: Es steht immer in der Datenbank
   (Collection `feedback`, Feld `telegram_sent` zeigt, ob die Weiterleitung geklappt hat).

Lokal zum Ausprobieren: dieselben zwei Werte in `backend/.env` eintragen.
Derselbe Bot meldet dir auch Fehler (Server-Abstürze und Abstürze im Browser), gedrosselt:
gleiche Ursache höchstens 1× pro Stunde, höchstens 30 Meldungen pro Tag, ohne Nutzerdaten.

## 5b. 🔔 Erinnerungen am Handy (Web Push, 3 Minuten)
1. Lokal einmal ausführen: `backend\.venv\Scripts\python tools\gen-vapid.py`
   → zwei Zeilen `VAPID_PUBLIC_KEY=…` und `VAPID_PRIVATE_KEY=…`.
2. In Render beim Backend eintragen: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` = `mailto:` + eine Adresse von dir. Privaten Schlüssel nie teilen.
   **Einmal festlegen und behalten** – neue Schlüssel machen alle Abos ungültig.
3. Damit Erinnerungen auch kommen, wenn das Backend schläft (Free-Tarif): `CRON_SECRET` (von Render
   erzeugt, siehe Schritt 1) ablesen und einen Wecker einrichten, der alle 15 Minuten
   `POST https://api.trackyourcrew.de/api/cron/reminders` mit Header `X-Cron-Secret: <CRON_SECRET>` aufruft
   (z. B. Render Cron Job oder cron-job.org). Läuft das Backend dauerhaft, reicht die eingebaute Schleife.
4. Testen: am Handy Einstellungen → Weitere Einstellungen → „Erinnerung am Handy“ an → „Test“.
   iPhone: geht nur, wenn die Seite zum Home-Bildschirm hinzugefügt wurde (iOS 16.4+).

## 6. Einschlafen des Backends (Free-Tarif)
Render Free legt das Backend nach 15 Minuten ohne Anfrage schlafen, das Aufwachen dauert
30–60 Sekunden. Die Website selbst (statisch) schläft nie. Die Login-Seite weckt das Backend
schon beim Öffnen im Hintergrund und zeigt währenddessen den Boot-Bildschirm.

Optionen (später gemeinsam entscheiden, BACKLOG):
- **Wecker-Dienst** (kostenlos, z. B. cron-job.org oder UptimeRobot): alle 10 Minuten
  `https://api.trackyourcrew.de/api/health` aufrufen. Mögliche Gründe, warum das bei dir früher
  nicht ging, sind inzwischen behoben: Die Hauptadresse `/` lieferte Fehler 404, und `/api/health`
  kannte keine HEAD-Anfragen (405). Beides wird von solchen Diensten als Ausfall gewertet, und
  cron-job.org schaltet den Job nach mehreren Fehlschlägen automatisch ab. Wichtig: das
  **Backend** anpingen, nicht die Website. Intervall unter 15 Minuten.
- **Render Starter** (ca. 7 $/Monat): in `render.yaml` beim Backend `plan: starter`.

## Checkliste vor dem ersten Live-Gang
- [ ] S1/S1b: DB-Passwort und Google-Secret erneuert, alte Werte nirgends mehr im Einsatz
- [ ] Impressum + Datenschutz: Angaben in `frontend/src/lib/legal.js` ausgefüllt (Schritt 0b),
      `/impressum` zeigt keinen roten Hinweis mehr
- [x] Schriften lokal statt Google Fonts (keine IP-Weitergabe an Google)
- [ ] Wochenwechsel einmal im Testmodus mit Zeitreise durchgespielt (`/api/dev/shift?days=7`)
