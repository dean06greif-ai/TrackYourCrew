# Backlog

Ergebnis der Analyse vom 2026-11-23. Reihenfolge = empfohlene Priorität.
Erledigtes abhaken und Datum dazuschreiben. "Geprüft" heißt: per Test oder Code-Stelle belegt.

## Sofort: Sicherheit und Datenschutz

- [ ] **S1 – Datenbank-Passwort steht in der Git-Historie.** Im Repo `TrackerAPP`
  (Branch `main`, mehrere Commits) wurde `backend/.env` mit der MongoDB-Atlas-URI
  inklusive Passwort eingecheckt. Löschen der Datei entfernt sie nicht aus der Historie.
  Das Repo war am 2026-11-23 ohne Anmeldung lesbar.
  Lösung: Passwort des Datenbank-Users in MongoDB Atlas ändern, `MONGO_URI` bei Render
  aktualisieren, altes Repo auf privat stellen oder löschen. Historie nicht ins neue Repo übernehmen.
- [ ] **S1b – Google-Client-Secret und DB-Passwort wurden am 2026-11-23 im Chat geteilt.**
  Beim Erledigen von S1 auch ein neues Client-Secret in der Google Cloud Console erzeugen
  und bei Render sowie in `backend/.env` eintragen.
- [x] 2026-11-24 (lokal, noch nicht deployt) **S2 – Fremdskripte auf der Live-Seite.** `frontend/public/index.html` lädt
  `assets.emergent.sh/scripts/emergent-main.js` und PostHog mit Session-Aufzeichnung,
  das an ein PostHog-Projekt von Emergent sendet. Folge: ein Dritter zeichnet
  Nutzersitzungen auf (DSGVO), und das Skript kann den Login-Token im localStorage lesen.
  Lösung: beide Skripte entfernen, Titel ("Emergent | Tracker App") und Beschreibung ersetzen.
  Erledigt: Skripte, Titel, Beschreibung, ungenutzte Inter-Schrift entfernt.
- [x] 2026-11-24 **S2b – Login-Hintergrundbild liegt auf dem Emergent-CDN** (`Login.jsx`, `heroBg`,
  `static.prod-images.emergentagent.com`). Bild nach `frontend/public/` übernehmen und lokal einbinden.
- [x] 2026-11-24 **S3 – Board gibt E-Mail-Adressen heraus.** (E-Mail nur noch im eigenen Eintrag; Freundschaftsanfrage mit Bestätigung bleibt offen) `GET /api/board` liefert `email`
  jedes Crew-Mitglieds. Freunde werden einseitig ohne Zustimmung hinzugefügt (Name + Handle
  genügt). Wer beides kennt, sieht E-Mail und alle Trainingsdaten. (Geprüft: `TestKnownIssues`)
  Lösung: `email` nur im eigenen Eintrag; Freundschaftsanfrage mit Bestätigung.
- [x] 2026-11-24 **S4 – WebSocket ohne Login offen.** `/api/ws` nimmt anonyme Verbindungen an und
  `manager.broadcast` sendet jedes Event (Fortschritt, Boosts, Namen) an alle Verbundenen,
  nicht nur an die Crew. (Geprüft: `TestKnownIssues`)
  Lösung: Verbindung ohne gültige Session ablehnen; Events nur an Betroffene und deren Freunde.
- [x] 2026-11-24 (Endpunkt entfernt) **S5 – `/api/boost/ranking` listet alle Nutzer** (Name, Bild, bis 100), nicht nur die Crew.
- [x] 2026-11-24 (Standard = FRONTEND_URL, Werte in render.yaml) **S6 – CORS-Standardwert `*` bei aktivierten Credentials.** Prüfen, dass `CORS_ORIGINS`
  bei Render auf die Vercel-Domain gesetzt ist; den Standardwert `*` aus dem Code entfernen.
- [x] 2026-11-24 (ohne Rate-Limit) **S7 – Eingaben ungeprüft.** `PUT /api/progress/me`: beliebige Wochennummer (auch
  Zukunft), negative/riesige Werte, Nicht-Zahlen führen zu Fehler 500. Kein Rate-Limit.
- [ ] **S8 – Token-Handling (mittelfristig, erst NACH dem Deploy):** sobald Website und API unter trackyourcrew.de laufen (gleiche Site), Cookie reicht – dann localStorage-Token abschaffen. Session-Token liegt in localStorage, im
  URL-Fragment nach dem Login und als `?token=` in der WebSocket-URL. Sauberer: Backend unter
  derselben Domain wie das Frontend erreichbar machen (Vercel-Rewrite `/api` -> Render), dann
  genügt das HttpOnly-Cookie.

## Fehler

- [x] 2026-11-24 **B1 – `GET /api/board` verändert Daten.** Der Endpunkt speichert `last_streak` und
  sendet `week_completed`/`streak_ended`. Mit `?week=N` wird der Streak dieser alten Woche
  gespeichert (geprüft: 4 -> 1), beim nächsten normalen Aufruf folgt erneut "Woche geschafft".
  Das Frontend nutzt `?week` derzeit nicht, der Fehler ist also latent. Unabhängig davon
  lösen parallele Board-Aufrufe mehrerer Nutzer doppelte Events aus.
  Lösung: Streak-Übergänge nur beim Speichern von Fortschritt bzw. beim Wochenwechsel
  berechnen, nicht beim Lesen. Bei `?week` nie schreiben.
- [x] 2026-11-24 **B2 – Einmal-Migration für einen bestimmten Nutzer** steht fest im Startcode
  (`restore_streak_user_..._v1`). Ist gelaufen, kann entfernt werden.
- [x] 2026-11-24 (mit Tier-Code entfernt) **B3 – ESLint-Warnung** `UserCard.jsx` Zeile ~2612: `useEffect` mit fehlender
  Abhängigkeit `entry.tier_state` (möglicher veralteter Zustand).

## Geschwindigkeit

- [x] 2026-11-24 (Plan 9: 256-px-Upload, Board mit Avatar-Link + Cache) **P1 – Profilbilder als Base64 im Board.** Bis ~700 KB pro Nutzer, bei jedem
  Board-Abruf für jeden Nutzer mitgeschickt; das Board wird bei fast jedem Live-Event neu geladen.
  Lösung: Bild beim Hochladen im Browser auf z. B. 128 px verkleinern; Board ohne Bilddaten,
  Bilder über eigenen, cachebaren Endpunkt.
- [x] 2026-11-24 (Plan 9) **P2 – Board lädt pro Nutzer mehrfach dieselben Daten** (Ziele, alle Fortschritte in
  `_compute_user_state`, `_progress_by_week` und noch einmal direkt). Einmal laden, weiterreichen.
- [x] 2026-11-23 **P3 – `requirements.txt` enthielt rund 60 unnötige Pakete** (pandas, numpy, boto3, black,
  mypy, flake8 …). Verlängert Render-Builds und Kaltstarts. Gebraucht werden: fastapi, uvicorn,
  motor/pymongo, httpx, pydantic, python-dotenv, google-auth, requests, websockets.
- [x] 2026-11-25 **P4 – Live-Events gezielter verarbeiten** statt jedes Mal das ganze Board zu laden. (`GET /board/users/{id}`, `refreshUser` in `useBoardState`, Events gebündelt)
- [x] 2026-11-24 (Plan 9, Einstellungen per `React.lazy`) **P5 – Ein einziges JS-Bundle (217 kB gzip).** Settings-Seite per `React.lazy` nachladen.

## Wartbarkeit

- [x] 2026-11-25 (server.py 3534 → 344 Zeilen + Module core/goals/social/routes_auth/board/push/stats; UserCard.jsx 2172 → 690 + `components/card/`; Eingabefeld aus Dashboard in `components/NumInput.jsx`; totes Varianten-Fenster aus Settings entfernt. Dashboard/Settings bleiben je eine große Komponente – weiter zerlegen nur bei Bedarf) **W1 – Sehr große Dateien aufteilen.** `UserCard.jsx` 3300, `Settings.jsx` 2100,
  `Dashboard.jsx` 2000, `server.py` 1950 Zeilen. Erster Schritt: Rang-/Tier-Logik aus
  `UserCard.jsx` in `src/lib/` (reine Funktionen, testbar); `server.py` in Router-Module.
- [x] 2026-11-24 **W2 – Toten Code entfernen.** (ui/, tote Dateien, 41 Pakete) 46 ungenutzte shadcn-Komponenten in `components/ui/`
  samt ~30 Radix-Paketen; ungenutzte Pakete `recharts`, `zod`, `@hookform/resolvers`,
  `@react-oauth/google`, `cra-template`; ungenutzte Dateien
  `AuthCallback.jsx`, `use-toast.js`, `useIntersectionObserver.js`.
  (2026-11-24 erledigt: `@emergentbase/visual-edits` und `plugins/health-check/` entfernt.)
- [x] 2026-11-25 (Vite 6 + Vitest, eigene ESLint-Regeln ohne Warnungen, Dev-Server ~1 s statt ~30 s, Ausgabe weiter `build/`, Env-Namen unverändert) **W3 – Create React App wird nicht mehr gepflegt.** Umstieg auf Vite (schnellere
  Builds, aktuelle Werkzeuge). Erst nach W2 sinnvoll.
- [x] 2026-11-24 **W4 – `packageManager: yarn` in package.json**, obwohl npm genutzt wird. Feld entfernen.
- [x] 2026-11-25 (geprüft: Rang kommt nur aus dem Serverwert `best_goals`; im Browser liegt nur noch „Rang-Up schon gezeigt“, `RANK_SEEN_KEY` – harmlos) **W5 – Rang/Tier-Stand im Browser.** Liegt teils in localStorage und wird vom Client
  gesetzt: geräteabhängig und manipulierbar. Auf dem Server berechnen.
- [x] 2026-11-25 (`tests/test_rules.py`: 28 Regel-Tests, Gegenprobe mit geändertem Boost schlägt an) **W6 – Tests ausbauen.** Brauchbare Fälle aus `tests/legacy_emergent/` übernehmen;
  Progressions-/Boost-/Streak-Logik gezielt testen; erste Frontend-Tests für reine Funktionen.
- [x] 2026-11-25 **W7 – `@app.on_event` ist veraltet**, auf `lifespan` umstellen (erledigt; FastAPI-Update ist damit möglich).
- [x] 2026-11-25 (Installer nach `_archiv/`, pyc + leerer Eintrag aus dem Backend-Repo) **W8 – Aufräumen im Ordner.** `backend/node-v24.18.0-x64.msi` (32 MB, im alten Repo
  eingecheckt), leerer Ordner `backend/backend/`, eingecheckte `__pycache__`-Dateien,
  `frontend/build/`.

## Offen aus der Überarbeitung (2026-11-24)
- [x] 2026-11-25 **Logo-Text:** bleibt "TRACKER" (Dean, Entwürfe A/B/C gesehen).
- [x] 2026-11-24 (Testmodus, Zeitreise 7 Tage: Woche 9→10, geschafft = +Steigerung und Streak bleibt,
  verfehlt = Ziel eingefroren + Streak 0 + Fail-Animation, keine Konsolenfehler) **Vor dem Deploy:** Wochenwechsel einmal im Testmodus mit Zeitreise (`/api/dev/shift?days=7`)
  durchspielen (Week-failed-Animation + Ton, Streak, -10 %). Die Umstellung `rules_from_week`
  passiert automatisch beim ersten Laden je Nutzer (per Test abgesichert).
- [ ] **Radardiagramm verbessern:** Wunsch aus Deans Notizen, aber unkonkret. Mit Dean abstimmen.
- [x] 2026-11-24 **Mehrsprachigkeit:** EN (Standard), DE, ES, FR. Neue Sprache = Datei in `frontend/src/i18n/`
  + Eintrag in `backend/i18n_messages.py`. Texte von ES/FR ohne Muttersprachler-Check.
- [x] 2026-11-24 **Feedback-Button → Telegram** (Bot einrichten: docs/DEPLOYMENT.md Schritt 5).
- [ ] **Kaltstart Backend:** später entscheiden (Wecker-Dienst oder Render Starter), docs/DEPLOYMENT.md Schritt 6.
- [ ] **Strava** ⏸ zurückgestellt (braucht Strava-Mitgliedschaft; API-Regeln zur Anzeige für die Crew prüfen).
- [ ] **Variante wechseln ab Rang A, Veröffentlichung:** UMSETZUNGSPLAN Phase 6.
- [ ] **Promo-Video (TikTok/Shorts/Reels):** gesichtslose schwarze Figur, entspannter Beat, Ausblenden ins Schwarz.
  Erst in der Promo-Phase, Details: UMSETZUNGSPLAN 6.5.
- [ ] **Promo gemeinsam planen + auswerten:** Claude holt Zugriff auf TikTok/YouTube/Reddit-Statistiken,
  analysiert was funktioniert, Skill „promo-analyse“. Details: UMSETZUNGSPLAN 6.6.
- [ ] **App-Release:** erst PWA (kostenlos), dann Google Play (25 $ einmalig), App Store (99 $/Jahr)
  erst bei Bedarf. Details: UMSETZUNGSPLAN 6.7.
- [x] 2026-11-24 **Konto löschen** in den Einstellungen (Pflicht für Stores und DSGVO): „Weitere Einstellungen → Deine Daten“,
  Bestätigung mit eigenem Code, `POST /api/me/delete` räumt alle Sammlungen + Crews/Anfragen anderer auf; dazu Daten-Export `GET /api/me/export` (JSON).
- [x] 2026-11-24 (Plan 4b: Hinzufügen per Code ist eine Anfrage, die angenommen werden muss) **Freundschaften einseitig:** wer Name + Handle kennt, sieht alles. Bestätigung einbauen.
- [x] 2026-11-25 **Eintrage-Formular offen auf zwei Geräten gleichzeitig:** das zuletzt gespeicherte gewann still.
  Jetzt schickt das Formular `base_updated_at` mit; hat ein anderes Gerät inzwischen gespeichert, antwortet der Server 409
  und das Formular bietet „Neuen Stand laden“ an. Speichervorgänge eines Geräts laufen nacheinander (kein Fehlalarm bei Live-Speichern).

## Deployment auf Render (Ziel)

- [ ] **D1 – Frontend als Render Static Site** (vorbereitet: `render.yaml`, Anleitung `docs/DEPLOYMENT.md`) aus demselben Repo: Root `frontend`,
  Build `npm ci && npm run build`, Publish `build`, Rewrite `/*` -> `/index.html`,
  Umgebungsvariable `REACT_APP_BACKEND_URL`. Danach im Backend `FRONTEND_URL` und
  `CORS_ORIGINS` auf die neue Adresse, in Google die neue Weiterleitungs-URI eintragen.
- [ ] **D2 – Eines der zwei Render-Backends stilllegen** (`trackerapp-fr8f` vs. `tracker-07uz`).
- [ ] **D3 – Netlify abschalten**, sobald D1 läuft.

## Git-Umzug nach TrackYourCrew ✅ (2026-11-26)
Erledigt: ein Repo `TrackYourCrew` (öffentlich), erste Version ohne alte Historie. Alte `.git`-Ordner + Bundles in
`_archiv/git-alt/` (Wurzel-`.git` war gesperrt -> alte Wurzel-Historie als lokaler Zweig `alt-main`).
Offen: Render auf das neue Repo umstellen (DEPLOYMENT Schritt 1), danach alte Repos `Tracker`, `TrackerAPP`,
`Frontend` auf GitHub archivieren bzw. auf privat stellen (TrackerAPP enthält das alte DB-Passwort -> S1).

## Erledigt

- [x] 2026-11-24 Lokaler Start repariert: Python 3.15 unterstützt (Pakete angehoben, FastAPI bewusst
  auf 0.110.1), DB-Aufgaben beim Start im Hintergrund (Health antwortet sofort), Google-Token-Prüfung
  mit 30 s Uhrtoleranz und geloggtem Ablehnungsgrund.

- [x] 2026-11-23 Abgleich: lokaler Frontend-Code = Live-Build auf Netlify (main.dfaabf37.js,
  per Source-Map geprüft). Lokales `server.py` ist neuer als GitHub `TrackerAPP` (Tier-Grenze 3
  statt 5, Tier-Completion im Streak) und passt zum Frontend (MAX_TIERS = 3).
- [x] 2026-11-23 Lokaler Start: `start-local.bat`, `tools/local-*.bat`; ungenutztes `proxy`-Feld
  aus package.json entfernt (brachte den Dev-Server teils zum Absturz); Visual Edits opt-in.

- [x] 2026-11-23 Offline-Testumgebung fürs Backend (21 Tests, ~0,3 s), `tools/`, CI-Workflow, Doku.
- [x] 2026-11-23 `requirements.txt` von UTF-16 nach UTF-8 umgewandelt (Inhalt unverändert).
- [x] 2026-11-23 Fünf unbenutzte Importe und eine unbenutzte Variable aus `server.py` entfernt.
