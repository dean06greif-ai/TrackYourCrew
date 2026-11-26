# TrackYourCrew – Arbeitsgrundlage

Diese Datei zuerst lesen. Sie ersetzt das erneute Erkunden des Projekts.
Stand: 2026-11-24 (Ende Sitzung 1). Bei größeren Änderungen hier nachziehen.

## Was das ist
Fitness-Tracker-Website. Jeder Nutzer hat Übungen mit Wochenzielen, die pro Woche
um einen Prozentsatz steigen ("Progression", optional "Boost" +25 %). Die "Crew"
(Freunde, hinzugefügt über Name + 5-stelliges Handle) sieht sich gegenseitig auf
einem Board, live per WebSocket. Dazu Streaks, Ränge, All-Time-Ranking, Animationen, Sounds.
Leitidee seit der Überarbeitung (2026-11-24): "entspannt nebenbei" – nichts ist gesperrt,
alles anpassbar, Verfehlen wird nicht bestraft.
UI-Sprachen: Englisch (Standard), Deutsch, Spanisch, Französisch – nie Texte fest einbauen,
immer `t("…")` + Eintrag in allen vier Dateien. Design: dunkel, Neon (#CCFF00), Schrift Anton/Manrope.

## Spielregeln (so ist es gedacht)
- **Start:** neue Nutzer bekommen ein Tutorial (`Onboarding.jsx`, `POST /me/onboarding`):
  Startwerte (vorgeschlagen Lauf 5 km, Liegestütze 150, Klimmzüge 20, +5 %), Start sofort
  ("Macher-Modus") oder ab Montag (`starts_on`, bis dahin kein Eintragen). 1–7 Übungen,
  alle jederzeit löschbar. Neue Übungen bekommen vom Server einen nie benutzten Schlüssel.
- **Progression** (`_compute_progression`, einzige Rechenstelle; die Einstellungen holen
  ihre Vorschau über `POST /goals/me/preview`): Ziel steigt je Woche um `progression_pct`
  (0–10 %, ab dieser Woche via `progression_overrides`). "Ziel jetzt" in den Einstellungen
  setzt `goal_overrides` ab dieser Woche (Vergangenheit bleibt). Startwert ist nur in der
  Startwoche der Übung änderbar. Rundung: km auf 0,1, sonst ganze Zahlen.
- **Verfehlt = eingefroren:** verfehlte Woche (0,5 % Toleranz) -> nächste Woche gleiches Ziel.
  Nach 4 verfehlten Wochen am Stück: Ziel x 0,9. Beides gilt erst ab `rules_from_week`
  (Update-Woche je Bestandsnutzer, neue Nutzer ab 1); davor die alte Rechnung.
- **Pausieren/Abschließen** (`POST /goals/me/exercises/{key}/status`): pausierte Wochen zählen
  nicht (kein Ziel, kein Verfehlen, keine Streak-Wirkung), danach geht es mit dem letzten
  Ziel weiter – mit Formverlust (`PAUSE_LOSS`: bis 2 Wo. 100 %, 3 Wo. 95 %, 4 Wo. 90 %, 5–6 Wo. 85 %, ab 7 Wo. 80 %;
  Bestandsnutzer erst ab `pause_loss_from_week`; Tabelle `components/PauseLossInfo.jsx`). Abgeschlossen = pausiert + `archived`: Historie bleibt, Freunde sehen sie auf
  der Kartenrückseite ("Archiv", `archived_exercises` im Board).
- **Alle pausieren** (`POST /goals/me/pause-all`, ersetzt Urlaub/Krank seit 2026-11-25): Knopf bei den pausierten Übungen,
  erst sichtbar, wenn eine pausiert ist. Alle Übungen dürfen pausiert sein (nur nicht alle abgeschlossen); Wochen ohne
  aktive Übung unterbrechen die Streak nicht; Board-Feld `all_paused`, Karte `PausedPanel`, Dashboard „Alle fortsetzen“.
- **Boost:** optional (Einstellung "Boost aktivieren", neue Nutzer: aus). 1× pro Woche +25 %,
  v2 ersetzt die Steigerung dieser Woche. Verfehlte Boost-Woche: Boost verfällt.
- **Varianten** (`POST /goals/me/exercises/{key}/upgrade`, leere Variante = zurück zur Grundübung): z. B. „Liegestütze · +10 kg“. Alte Übung wird
  abgeschlossen, Variante startet neu (Startwert-Vorschlag 60 %). Rang-Schwellen × Faktor
  (+5 kg 80 %, +10 kg 60 %, +20 kg 40 %, ab 30 kg 30 %, ohne Gewicht 60 %). Variante bestehender
  Übungen ändert sich nur über diesen Endpunkt.
- **Meilensteine** (`docs/MEILENSTEINE.md`): Frontend rechnet aus `all_time`, Server speichert Zeitpunkt
  (`POST /me/milestones`, `users.milestones`, erstes Melden still), Toast je Betrachter 1× (`seen-effects` Typ `milestone`).
- **Aktivitäten** (seit 2026-11-26, Feld `type: "activity"` an der Übung, `lib/activities.js`): z. B. „Gym 2× pro Woche“.
  Ziel = Mal pro Woche (1–7, `base_value`), Einheit „×“, erledigter Tag = Tageswert 1. Keine Steigerung, kein Abzug,
  kein Formverlust, kein Boost, keine Variante, kein Ziel-Vorschlag, kein Rang; eigene Obergrenze 7. Einstellungen:
  Umschalter Übungen/Aktivitäten + Glühbirne -> Ideen-Fenster (ACTIVITY_IDEAS / EXERCISE_IDEAS); Karte `card/ActivityRow.jsx` (Kästchen); Eintragen `ActivityLog.jsx`
  (Tage abhaken); Sprache „heute war ich im Gym“. Ranking/Meilensteine/Prozent/Challenges/Radar/Insights nur Übungen.
- **Streak:** aufeinanderfolgende Wochen, in denen alle aktiven Übungen und Aktivitäten geschafft sind.
- **Ränge F–S+** (`frontend/src/lib/ranks.js`, Tabelle `docs/RANG-TABELLE.md`): nur aus dem Serverwert `best_goals`
  (bester Wochenwert, gedeckelt aufs Wochenziel) -> auf allen Geräten gleich. Übungsart wird
  am Namen erkannt, Einheiten umgerechnet. Browser speichert nur "Rang-Up schon gezeigt".
- **Emojis + Herausfordern auf der Karte:** fremde Karten haben unten Sprechblasen-Knopf (`components/CardActions.jsx`)
  und „Herausfordern“; `POST /api/emoji`, Live-Event `emoji`, verpasste über `/me/emojis/unseen`, Animation `EmojiBurst`.
- **Prozent-Vergleiche:** nur echte Daten, je Übungsart erst ab `STATS_MIN_USERS` (50) Nutzern (`/me/stat-kinds`,
  `/me/percentiles`, `hooks/usePercentiles.js`); Werte rechnet der Server aus den Einträgen.
- **Ranking** (`Ranking.jsx`): All-Time-Summe je Übungsart in der Crew, aus Board-Daten.
- **Tutorial (Plan 4a, im Code noch „tour“):** nach dem Onboarding `tour_step` 0, 11 Schritte in `frontend/src/lib/tour.js` (Schritt 0 = Begrüßung ohne Ziel, Karte mittig)
  (inkl. Eintrag-Einstellungen), die Seite meldet echte Aktionen mit `tourEvent("…")`, Ziele per `data-tour`-Attribut.
  Wo man etwas tun muss: weiß leuchtender Rahmen; weiter/zurück per Pfeil. Neustart in den Einstellungen.
- **App installieren (Plan 10):** `lib/install.js` (Regeln, localStorage `tyc_install`), `InstallSheet.jsx`;
  Hinweis von selbst nur, wo man installieren kann (iPhone: nur echtes Safari, Android: normaler Browser).
- **Offline (2026-11-26):** `public/sw.js` speichert die App-Dateien (Seite: erst Netz, `/assets/`: Cache), registriert
  nur im Produktions-Build (Test: `.claude/launch.json` `frontend-alt-prod`). `lib/offline.js`: Snapshots `tyc_off_me`/`tyc_off_board`,
  Postausgang `tyc_outbox` (je Woche ein ganzer Wochenstand + Basis), senden beim Start/online/alle 30 s (Web Lock, ein Tab);
  409 -> `alreadyApplied` (Antwort verloren) sonst `mergeDays` (eigene Änderung auf Server-Stand). Netzfehler loggen nie aus.
- **Crew/Freunde (Plan 4b):** Hinzufügen per Name + Code ist eine Anfrage, die der andere annimmt (optional
  „zurück hinzufügen“). Einladungslink `/join/CODE` verbindet sofort gegenseitig. Freundschaft bleibt technisch
  einseitig (`users.friends`), Anfragen in `users.friend_requests_in`, Schalter `accept_friend_requests`.
- **Crew-Board:** Live-Events gehen nur an Betroffene (`_notify`/`_audience`), WebSocket nur
  mit Login. `week_completed` kommt beim Speichern von Fortschritt; "Woche verfehlt" erkennt
  das Frontend aus `missed_weeks` der Vorwoche. Animationen 1× pro Betrachter (`seen_effects`),
  der eigene Fail-Ton kommt mit der Animation nach dem ersten Antippen (Browser-Regel).
- **Erinnerungen (Plan 5):** Web Push nur am Handy (`backend/webpush.py`, `components/ReminderCard.jsx`, `public/sw.js`),
  `db.push_subscriptions`, `users.reminder`; Env `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`, optional `CRON_SECRET`.
  Testmodus erzeugt eigene Schlüssel. Telegram nur für den Admin: Feedback + Fehler (`_alert_admin`, gedrosselt).
- **Eintragen:** Wochensumme oder pro Tag (Mo–So), optional Live-Speichern, eigene Schrittweiten
  für die +/–-Knöpfe. **Per Sprache** (Mikro im Formular, `components/VoiceLog.jsx`, Erkennung `lib/voiceLog.js`):
  Übung/Zahl/Einheit/Tag in 4 Sprachen, Ende bei „das war's“ oder 2,5 s Stille, Bestätigung, dann normales Speichern.
  Mikrofon-Funktionen pro Gerät abschaltbar (`lib/mic.js`, localStorage `tyc_mic`).
  **Eine** Erkennung für alles (`lib/voiceHub.js`: Abnehmer melden sich an, Füllwörter raus). Dashboard-Mikro neben
  „Fortschritt eintragen“ (`components/GlobalVoice.jsx`, 10 s Stille = aus) schaltet Formular- (30 s) und Stoppuhr-Mikro (60 s) mit;
  „starte die Stoppuhr (für X)“ -> Ereignis `tyc:sw`, sonst Rückfrage „Für welche Übung?“. „fertig“ trägt direkt ein,
  Einstellung „Erst bestätigen“ (localStorage `tyc_voice_confirm`) zeigt vorher die Prüfen-Ansicht.
- **Speichern:** Profil (Name/Bild) speichert automatisch 0,9 s nach der letzten Änderung (kein Knopf, Dean 2026-11-26); Schalter speichern sofort; Übungen per Leiste unten (Dean 2026-11-26: so lassen).
- **Sprachcoach (Stoppuhr):** Ansagen mit fester ID in `lib/coachClips.js`; KI-Stimmen als Pakete `<stimme>-<stil>`
  in `public/coach/<paket>/<lang>/` + `packs.json` (erzeugt mit `node tools/gen-coach-voice.mjs`, Deans 10 Stimmen, Standard `de,en`; `ash-beast` voreingestellt;
  harte Ansagen `coach.hard.*` in `<lang>-hart` bei Stilen hart/beast, Schalter „Hart“; Coach-Sprache wählbar, Standard App-Sprache;
  Probe `--probe [--styles]`; Schlüssel fragt das Skript verdeckt ab), Auswahl in der Stoppuhr, Abspielen `lib/coachAudio.js`;
  ohne Aufnahmen oder bei Wahl „Gerätestimme“ spricht das Gerät.

## Aufbau
```
backend/server.py            setzt die App zusammen + exportiert alle Namen weiter (Routen unter /api)
backend/core.py              Konfiguration, DB, App/Router, Modelle, Live-Verbindungen (_notify), Login-Helfer, Admin-Meldungen
backend/goals.py             Ziele + Progression (_compute_progression), Übungen, Pausen, Varianten, Boost
backend/social.py            Freunde/Anfragen, Emojis, Challenges
backend/routes_auth.py       Google-Login, Konto, Einstellungen, Profil, Daten-Export/Löschen
backend/board.py             Fortschritt, Crew-Board (_board_entry), Ziel-Vorschläge, Animationen, Meilensteine, Insights
backend/push.py, stats.py    Erinnerungen (Web Push) + WebSocket; Prozent-Vergleiche
backend/dev_server.py        Testmodus: Spiel-DB im Speicher + Test-Login (siehe unten)
backend/tests/               Offline-Tests (mongomock, kein Netz) – test_smoke.py, test_progression.py
backend/tests/legacy_emergent/  alte, nicht lauffähige Tests (nur Ideensammlung)
frontend/src/App.js          Routen: / (Login), /dashboard, /settings
frontend/src/lib/api.js      axios-Instanz, Token-Speicher, WebSocket-URL
frontend/src/contexts/AuthContext.jsx   Login-Zustand, Wake-Screen für Render-Kaltstart
frontend/src/pages/Dashboard.jsx (2000 Z.), Settings.jsx (1800 Z.), Login.jsx
frontend/src/components/UserCard.jsx  Karte (Vorder-/Rückseite drehen, Animationen); Teile in components/card/
  (MetricRow, Rank = Pyramide/Badge, RadarChart, RankUpToast, CardBack = Rückseite/Archiv/Meilensteine)
frontend/src/components/NumInput.jsx  Eingabefeld beim Eintragen (+/–, Schrittweiten, Stoppuhr)
frontend/src/components/Ranking.jsx, Onboarding.jsx, Insights.jsx
frontend/src/lib/ranks.js    Rang-Schwellen, Einheiten-Umrechnung, Varianten-Faktor (reine Funktionen)
frontend/src/lib/exercises.js Übungserkennung aus dem Namen (Art + Icon, 4 Sprachen), exerciseLabel()
frontend/src/lib/*.test.js   Vitest-Tests (laufen in tools/check.sh frontend)
frontend/vite.config.js      Vite (seit 2026-11-25 statt Create React App): Port aus PORT, Ausgabe build/, Env weiter REACT_APP_… (im Code import.meta.env)
frontend/src/components/IconPicker.jsx  Icon-Knopf mit Auswahl (Einstellungen)
frontend/src/lib/milestones.js  Meilensteine + Crew-Ziele (reine Funktionen), hooks/useMilestones.js, components/MilestoneToast.jsx
tools/                       Hilfsskripte (siehe unten)
docs/BACKLOG.md              offene Punkte nach Priorität
docs/DEPLOYMENT.md           Render + Domain trackyourcrew.de + Google + Telegram, Schritt für Schritt
render.yaml                  Render-Blueprint (api.trackyourcrew.de + trackyourcrew.de)
frontend/src/i18n/           Sprachen (en Standard, de, es, fr), useI18n() -> t("schluessel")
backend/i18n_messages.py     Server-Meldungen + Standard-Übungsnamen je Sprache
docs/UMSETZUNGSPLAN.md       Runde 1 (umgesetzt): (Sperren/Tiers raus, Pausieren, Ranking)
docs/PLAN-RUNDE-2.md         **NÄCHSTE ARBEIT**: Ränge/Icons/Varianten, Tour, Verlauf, Lesbarkeit, Autosave, Leistung
```
Datenbank (MongoDB): `users`, `user_sessions`, `user_goals`, `progress_entries`,
`oauth_states`, `seen_effects`, `migrations`, `emojis` (Plan 12c, ersetzt `reactions`), `challenges` (Plan 12e), `push_subscriptions` (Plan 5).

Auth: Google OAuth (Redirect-Flow über das Backend). Session-Token liegt als
HttpOnly-Cookie UND in localStorage (`tracker_session_token`, als Bearer-Header),
weil Frontend und Backend auf verschiedenen Domains laufen und Cross-Site-Cookies
oft blockiert werden.

Ziel-Deployment: `render.yaml` + `docs/DEPLOYMENT.md` (Website trackyourcrew.de, Backend api.trackyourcrew.de).
Impressum/Datenschutz: `/impressum`, `/datenschutz` (`pages/Legal.jsx`, vor dem Login-Gate, Text nur Deutsch),
Betreiberdaten in `frontend/src/lib/legal.js` (Platzhalter bis Dean sie einträgt). Neuer Drittdienst -> Datenschutztext nachziehen.
Schriften lokal über `@fontsource` (kein Google Fonts, DSGVO).
Deployment bisher: Frontend als manuell hochgeladener Build auf Netlify
(trackyourfriends.netlify.app), Backend auf Render. Ziel: beides auf Render.
Es gibt zwei Render-Backends: der Live-Build nutzt `trackerapp-fr8f.onrender.com`,
die zuletzt genannte Backend-Konfiguration `tracker-07uz.onrender.com`. Klären, welches bleibt.
Lokal: `start-local.bat` (Backend :5000, Frontend :3000). `backend/.env` zeigt auf die
ECHTE Datenbank – lokale Änderungen sind live sichtbar.
Umgebungsvariablen: siehe `backend/.env.example` und `frontend/.env.example`.

## Werkzeuge (immer benutzen statt von Hand)
| Befehl | Zweck |
|---|---|
| `bash tools/check.sh [backend\|frontend]` | Lint + Tests + Build. Vor jeder Abgabe. Backend ~2 s, Frontend ~40 s |
| `python tools/outline.py <datei>` | Inhaltsverzeichnis einer großen Datei mit Zeilennummern |
| `python tools/outline.py backend/server.py --routes` | alle API-Routen |
| `python tools/outline.py <datei> --grep <text>` | Volltextsuche, zeigt je Treffer die umgebende Funktion |
| `bash tools/pack-src.sh` | Quellcode ohne node_modules/Secrets nach `.cache/src.tgz` packen |
| `start-local.bat` (Windows) | Website lokal starten, Backend + Frontend |
| `bash tools/container-setup.sh` | frische Linux-Umgebung vorbereiten (venv + npm ci) |
| Testmodus neben `start-local.bat`: in `.claude/launch.json` `backend-dev-alt` (5055) + `frontend-alt` (3055) | läuft parallel zum echten lokalen Server, ohne dessen Ports/DB (`DEV_PORT` im dev_server) |
| `backend\.venv\Scripts\python backend\dev_server.py` | **Testmodus** auf :5000 ohne echte DB. Login: `http://localhost:5000/api/dev/login?as=dean` (anton, mia, leo, neu). Zeitreise: `/api/dev/shift?days=7`. In `.claude/launch.json` als `backend-dev` |

## Arbeitsweise für Claude
1. Große Dateien nie komplett lesen. Erst `outline.py`, dann nur den Bereich.
2. Lokal unter Windows (Claude Code): Ordner `C:\Users\dean0\Desktop\Claude\Fit-Tracker`.
   Backend-Tests: `backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt`
   (einmalig), dann `cd backend && .venv\Scripts\python -m pytest tests -q`.
   Frontend-Build: `cd frontend && npm run build`. `tools/check.sh` braucht Git Bash.
   `find`/`du` ohne Ausschluss von `node_modules` vermeiden (90.000 Dateien).
   Arbeit über die Cloud-Umgebung: `tools/pack-src.sh` -> `.cache/src.tgz` -> entpacken ->
   `tools/container-setup.sh` -> `tools/check.sh`.
3. Jede Backend-Änderung bekommt einen Test in `backend/tests/`. Fixtures:
   `client` (anonym), `auth` (eingeloggt), `make_user(name, handle=...)`, `db`.
   Werte/Funktionen in Tests ersetzen: `patch_everywhere(monkeypatch, "NAME", wert)` (wirkt in allen Modulen).
4. Bekannte, noch offene Fehler als IST-Zustand in einer Klasse `TestKnownIssues` festhalten.
   Wird einer behoben, schlägt der Test fehl -> auf das richtige Verhalten umstellen
   und den Punkt in `docs/BACKLOG.md` abhaken. (S3/S4/B1 sind behoben -> `TestSecurity`.)
5. Zum Ausprobieren im Browser immer den Testmodus nehmen, nie `start-local.bat` (echte DB).
6. Bei wichtigen Produktentscheidungen vorher kurz mit Dean abstimmen.
7. Nie Secrets lesen, ausgeben oder committen (`.env`, `.env.local`). Nur Schlüsselnamen.
8. Kein Push, kein Deployment, keine Änderung an Produktionsdaten ohne ausdrückliche Freigabe.
   Achtung: Push auf den Deploy-Branch löst bei Vercel/Render ein Live-Deployment aus.

## Aktueller Stand (2026-11-24)
- Lokal lauffähig: `start-local.bat` -> Backend :5000 (Python 3.15 in `backend\.venv`), Frontend :3000.
  Google-Login lokal eingerichtet (Weiterleitungs-URI in der Google Console eingetragen).
- Lokaler Code = neuester Stand (Frontend identisch mit Netlify-Live-Build, Backend neuer als GitHub).
- Überarbeitung laut `docs/UMSETZUNGSPLAN.md` umgesetzt (lokal committet, nicht deployt).
- Danach: 4 Sprachen, Feedback→Telegram, Render-Blueprint, optischer Feinschliff (alles lokal committet).
- **Als Nächstes: `docs/PLAN-RUNDE-2.md` abarbeiten** – oben steht „START HIER“. Punkte 1, 1e (ohne Prozent-Vergleiche), 3 und 4 ✅, weiter mit Punkt 5.
  Freigegebene Vorlagen: `docs/RANG-TABELLE.md`, `docs/MEILENSTEINE.md`; Figur-Skizzen in `docs/skizzen/`.
  Danach (nicht jetzt): Deploy/Git-Umzug, Promo (UMSETZUNGSPLAN 6.4–6.6), App-Release (6.7).
  Übersetzungen: neue Schlüssel in alle 4 Dateien `frontend/src/i18n/*.js`, Prüfung `python tools/check-i18n.py`
  (läuft auch in `tools/check.sh frontend`).
- Git-Umzug erledigt (2026-11-26, siehe Abschnitt Git). Nächste Schritte laut `docs/BACKLOG.md`:
  1. ~~Git-Umzug~~ ✅
  2. Sicherheit S1/S1b (DB-Passwort + Google-Secret erneuern)
  3. Deployment komplett auf Render (D1-D3)

## Stolperfallen im Code
- `_load_goals` schreibt einmalig `rules_from_week` (Umstellung Bestandsnutzer), sonst liest das Board nur.
- Das Frontend lädt bei fast jedem WebSocket-Event das komplette Board neu (`fetchBoard`).
- Profilbilder liegen als data:-URL im User-Dokument (neue Uploads 256×256, ~15 KB). Board/Freunde bekommen
  einen Link `/api/users/{id}/avatar?v=…` (`_picture_ref`), im Frontend über `avatarSrc()` auflösen.
- Farben bleiben bei der Übung (`_normalize_exercise_colors` / `assignColors`, gleiche Palette in beiden).
- Alte Felder in der DB (`tier_state`, `last_streak`, `pending_failed_week`) werden nicht mehr gelesen.
- Wochenlogik: `_calc_week_number` in goals.py (Woche beginnt montags, zählt ab `start_date`).
- Emergent ist komplett entfernt (Skripte, PostHog, Visual Edits, Health-Check, Login-Bild liegt jetzt in `frontend/public/login-hero.webp`).
- In `App.js` steht die Warnung, keine Backend-URL fest einzutragen: nur `REACT_APP_BACKEND_URL`.

## Git
Repo: https://github.com/dean06greif-ai/TrackYourCrew (öffentlich, ein Repo für Backend + Frontend, Zweig `main`).
Seit 2026-11-26 (Git-Umzug) gibt es nur noch das Wurzel-Repo, ohne alte Historie. Alte Repos (`Tracker`,
`TrackerAPP`, `Frontend`) liegen lokal als Bundles + `.git`-Ordner in `_archiv/git-alt/`, die alte Wurzel-Historie
zusätzlich im lokalen Zweig `alt-main` (nie pushen: TrackerAPP-Historie enthält das alte DB-Passwort).
Render ist noch NICHT mit dem Repo verbunden; sobald doch, löst jeder Push auf `main` ein Live-Deployment aus.
Öffentlich -> vor jedem Commit an Secrets denken (`.env*` sind ignoriert).
Commit-Nachrichten: kurz, deutsch, was und warum (nicht "hjklö").
