# Umsetzungsplan Runde 2 (Stand 2026-11-24)

> **START HIER (neue Sitzung):** 1) `CLAUDE.md` lesen. 2) Diese Datei ganz lesen.
> 3) Mit Punkt 1 (Ränge/Icons/Erkennung/Varianten) beginnen – Rang-Tabelle (`docs/RANG-TABELLE.md`)
> und Meilensteine (`docs/MEILENSTEINE.md`) sind freigegeben, Icon-Knopf statt Raster ist freigegeben.
> 4) Vor jedem Punkt mit ❓ kurz bei Dean nachfragen (mit Empfehlung, gern mit Bild).
> 5) Testmodus starten (`.claude/launch.json`: `frontend` + `backend-dev`), nie gegen die echte DB testen.
> 6) Nach jedem fertigen Punkt: `bash tools/check.sh`, Handy+PC optisch prüfen, lokal committen
>    (Backend-Änderungen im Repo `backend/`, Rest im Wurzel-Repo), Status hier auf ✅ setzen.
> Kein Push/Deploy, kein Git-Umzug ohne ausdrückliche Freigabe.

Grundlage: kritische Durchsicht der Website durch Claude + Deans Antworten darauf.
Diese Datei ist so geschrieben, dass eine neue Sitzung ohne Vorwissen weitermachen kann.
Zuerst `CLAUDE.md` lesen (Aufbau, Werkzeuge, Testmodus, Arbeitsweise).

**Arbeitsregeln für diese Runde**
- Vor wichtigen Produktentscheidungen kurz mit Dean abstimmen (mit Empfehlung, gern mit Bild).
- Pixelgenauer Anspruch: nach jeder UI-Änderung Handy (375 px) und PC prüfen, messen statt schätzen.
- Alle Texte über `t("…")` in allen 4 Sprachen (`frontend/src/i18n/*.js`, erzeugt aus einer Liste;
  siehe Abschnitt „Werkzeuge“ unten). Zahlen über `formatNumber(v, locale)`.
- Backend-Änderung = Test in `backend/tests/`. Vor Abgabe `bash tools/check.sh`.
- Testen im Browser nur im Testmodus (`backend/dev_server.py`, Login `/api/dev/login?as=dean|anton|mia|leo|neu`).
- Kein Push/Deploy ohne Freigabe. Git-Umzug wartet weiterhin auf Deans OK.

Reihenfolge = empfohlene Priorität. Status: ⬜ offen · 🟨 in Arbeit · ✅ fertig · ❓ Dean fragen

---

## 1. Ränge, Übungen, Icons, Erkennung, Progressionen ✅ (2026-11-24)

### 1a. Rang-Schwellen neu kalibrieren ✅ (Tabelle aus RANG-TABELLE.md, Test: E in Woche 3)
Problem: Schwellen in `frontend/src/lib/ranks.js` (`RANK_THRESHOLDS`) stammen aus der Zeit mit
10 km / 500 / 50 als Start. Mit den neuen Startwerten (5 km / 150 / 20, +5 %) bleibt ein neuer
Nutzer ~15 Wochen auf F.
Ziel (Dean):
- Erster Aufstieg nach 1–3 Wochen erreichbar, danach immer seltener.
- **S+ ist die Elite-Stufe** (Dean, 2026-11-24) und bleibt der höchste Rang. S+ nur für absolute
  Weltklasse in der Disziplin (realistische Wochenwerte, z. B. Laufen ~150+ km/Woche,
  Liegestütze ~5000+/Woche – vor Umsetzung recherchieren und Dean die Tabelle zeigen ❓).
- Keine Stufe über S+. Zusätzliche Zwischenstufen nur, falls die Abstände sonst zu groß werden
  (dann mit Dean abstimmen); Pyramide, Farben, Radar und Ranking müssen mitziehen.
- Kurve: eher logarithmisch (frühe Stufen dicht, späte weit), pro Übungsart eigene Tabelle.
- Wichtig: Rang basiert weiter auf `best_goals` vom Server (bester Wochenwert, gedeckelt aufs
  Wochenziel). Bestehende Nutzer: neue Schwellen gelten sofort (nur Anzeige, keine Daten).
- Rang-Up-Toasts: nach der Umstellung NICHT für alle auf einmal feuern
  (`consumeRankUp` – Speicher-Key `rankSeen_v3` auf `v4` heben, dann wird beim ersten Sehen nur gespeichert).

### 1b. Mehr Übungsarten + passende Icons ✅ (28 Icons, Erkennung in `lib/exercises.js`; Rudern, Kreuzheben, Bankdrücken, Schulterdrücken, Bergsteiger, Klettern, Boxen, Yoga, Treppen, Sprünge vorerst ohne Rang-Tabelle)
- Icons in `frontend/src/components/ExerciseIcon.jsx` (`ICON_KEYS`, `CORE_ICON_KEYS`,
  `EXTENDED_ICON_KEYS`). Jedes Icon gegen seine Bedeutung prüfen (passt Bild zu Name?) und
  fehlende ergänzen, z. B.: Kniebeugen, Ausfallschritte, Burpees, Seilspringen, Rudern,
  Bergsteiger (Mountain Climbers), Kreuzheben, Bankdrücken, Schulterdrücken, Dehnen/Yoga,
  Treppensteigen, Wandern, Boxen, Klettern, Plank-Varianten, Dips, Handstand, Schritte/Gehen.
- Für jede neue Art: Erkennungswörter in allen 4 Sprachen in `detectRankExercise` (ranks.js),
  Rang-Tabelle in `RANK_THRESHOLDS`, Einheiten-Familie in `RANK_BASE_UNITS`.

### 1c. Automatische Icon-Wahl beim Tippen ✅ (Icon-Knopf `IconPicker.jsx`; Tutorial hat kein Namensfeld, daher nur Einstellungen)
- In den Einstellungen (`pages/Settings.jsx`, Name-Feld der Übungskarte) und im Tutorial:
  sobald ein Wort erkannt wird (`detectRankExercise` + Icon-Zuordnung je Art), Icon automatisch
  setzen – aber nur, solange der Nutzer das Icon nicht selbst gewählt hat (Flag `iconManual`).
- Neue reine Funktion `iconForExercise(name)` in `lib/ranks.js` (oder `lib/exercises.js`), testbar.
- Erkennung prüfen: Groß/Klein, Umlaute, Bindestriche, Plural, EN/ES/FR, Tippfehler-tolerant
  wo sinnvoll. Kleine Testliste (Name → erwartete Art) als Kommentar/Test festhalten.

### 1d. Progressions-Varianten (z. B. „Liegestütze + 10 kg“) ✅ (Feld `variant`, `POST /goals/me/exercises/{key}/upgrade`, Dialog in den Einstellungen, Rang-Faktor `variantRankFactor`, Ranking getrennt)
Wunsch: ein Feld für die Erschwerung einer Übung (Zusatzgewicht o. Ä.).
- UI: in der Übungskarte ein optionales Feld „Variante / Zusatz“ (z. B. „+10 kg“, „Weste“,
  „einbeinig“). Bei neuer Übung einfach Teil der Übung.
- **Bei bestehender Übung**: Bestätigungsdialog, Text sinngemäß:
  „Willst du wirklich auf ‚Liegestütze + 10 kg‘ umsteigen? Die bisherige Übung ‚Liegestütze‘
  wird abgeschlossen und du startest mit der neuen Variante neu. Deine Erfolge bleiben gespeichert.“
  Technisch: alte Übung `complete` (vorhandener Endpunkt), neue Übung mit Name+Variante anlegen
  (neuer Schlüssel, Startwert frei wählbar, Vorschlag: z. B. 60 % des letzten Ziels ❓).
  Am besten ein Backend-Endpunkt `POST /goals/me/exercises/{key}/upgrade {variant, start_value}`,
  der beides atomar macht (Test!).
- Datenmodell: Feld `variant` (String, max. 30) an der Übung, Anzeige „Liegestütze · +10 kg“.
- ✅ Variante im Namen wird erkannt (Deans Wunsch): „Liegestütze +20 kg“, „Klimmzüge mit 10 kg Weste“,
  „Kniebeugen einbeinig“ → Name + Variante getrennt (`splitVariant` in `lib/exercises.js`). Neue Übung: wandert
  beim Verlassen des Namensfelds ins Varianten-Feld; bestehende Übung: Umstiegs-Dialog öffnet sich vorausgefüllt.
- **Ränge für Varianten**: sinnvolle Schwellen, z. B. Gewichts-Varianten über einen Faktor
  (Zusatzgewicht in kg → Schwellen um Faktor reduzieren, etwa +10 kg ≈ 0,6×, +20 kg ≈ 0,4×),
  mit Dean abstimmen ❓. Ranking gruppiert Varianten getrennt von der Grundübung.

**Fertig, wenn:** neuer Nutzer erreicht E nach 1–3 Wochen, Elite-Stufe ist realistisch hoch,
Icons passen, Auto-Icon beim Tippen klappt in 4 Sprachen, Varianten-Wechsel mit Dialog
funktioniert und ist getestet.

---

## 1e. Meilensteine: „Das hast du schon geschafft“ 🟨 (Deans Idee, 2026-11-24)
**Umgesetzt (2026-11-24):** alle Meilensteine aus `docs/MEILENSTEINE.md` (Distanz je Sportart, Wiederholungen,
bewegtes Gewicht, Zeit, regional je Sprache), Crew-Ziele ISS/Erde/Mond, Weg zum Mond auf der Kartenrückseite
(Reiter mit Flaggen-Symbol), Rang-Feiern A/S/S+ im Rang-Toast (S+ länger und größer).
Technik: Berechnung in `frontend/src/lib/milestones.js` (summiert je Übungsart, auch über Varianten und
abgeschlossene Übungen), Server merkt sich „wann zuerst erreicht“ (`POST /me/milestones`, erstes Melden still),
Freunde bekommen das Live-Event `milestone_reached`, Toast je Betrachter einmal (`seen-effects` Typ `milestone`,
nur ≤ 14 Tage alt). Eine eigene Live-Feed-Liste gibt es (noch) nicht – der Toast mit Namen ersetzt sie.
**✅ Prozent-Vergleiche umgesetzt 2026-11-25 (Dean: nur echte Daten):** schalten sich je Übungsart erst ab
`STATS_MIN_USERS` (50) Nutzern ein. Website meldet nur Art + Einheiten-Faktor (`POST /me/stat-kinds`), Werte (bester
Wochenwert, ohne Varianten) nimmt der Server aus den Einträgen; `GET /me/percentiles`, Gleichstand zählt konservativ.
Meldung höchstens 1× pro Besuch ab „obere 25 %“ (`hooks/usePercentiles.js`, gesehen in `users.percentile_seen`),
Zeile „Obere X % · von N Athleten“ in der Auswertung. Testmodus: schon ab 3 Spielern.
Früher offen: Prozent-Vergleiche („obere 20 %“) – brauchen echte Daten (≥ 50 Nutzer je Übungsart) oder eine
recherchierte Bevölkerungs-Grundlage für die Rang-Stufen; ohne das wäre die Zahl erfunden.
Ab und zu eine Nachricht, die die All-Time-Summe greifbar macht, z. B.:
- „Du bist jetzt schon einen **Marathon** gelaufen“ (ab 42,2 km Laufen gesamt)
- „Du bist mit dem Rad einmal **um die Welt** gefahren“ (40.075 km)
- „Du bist schon **1.000 Bahnen** im Schwimmbad geschwommen“ (25-m-Bahnen)
Regeln:
- **Nur Vergleiche, die man sich wirklich vorstellen kann**, nichts Langweiliges oder
  Unnahbares (z. B. auf Deutsch nicht „einmal durch Albanien gelaufen“).
- Zwei Arten von Vergleichen:
  1. **Weltweit bekannt** (für alle Sprachen): Marathon, Mount Everest (Höhenmeter/Treppen),
     Nil, Chinesische Mauer, Erdumfang, Erde→Mond (384.400 km), Eiffelturm-Höhe,
     Fußballfelder, Schwimmbad-Bahnen.
  - **Test für jeden Vergleich (Dean, 2026-11-24):** Kennt den Ort/das Ding wirklich jeder
    (auch ein 15-Jähriger), egal ob er die genaue Länge weiß? Berühmte Wahrzeichen wie Nil oder
    Chinesische Mauer sind gerade deshalb stark. Unbekanntes fliegt raus, z. B. Ärmelkanal.
  - **Spaßige Riesen-Ziele (Dean mag das, z. B. „einmal zum Mond“):** Für eine Person
    unerreichbar weit (384.400 km), deshalb als Fortschritt statt als einmalige Meldung:
    „Du hast schon 0,3 % der Strecke zum Mond geschafft“ und vor allem als **Crew-Ziel**:
    „Eure Crew ist zusammen schon bis zum Mond gelaufen/geradelt“ (Summe aller Crew-Kilometer).
    Weitere Ideen in dem Stil: einmal um die Erde, Erde→ISS (~400 km, gut erreichbar!),
    Liegestütze-Summe der Crew „so oft wie Stufen zum Eiffelturm“.
  2. **Passend zur Sprache/Region** (nur wenn wirklich bekannt): DE z. B. „einmal quer durch
     Deutschland“ (~880 km Flensburg–Oberstdorf), „einmal den Rhein entlang“; FR „Tour de France“
     (~3.400 km); ES „Camino de Santiago“ (~800 km); EN z. B. „London Marathon“-Distanz.
- Auch für Wiederholungs-Übungen: z. B. Liegestütze/Klimmzüge in „Körpergewicht hochgedrückt =
  so viel wie ein Auto / ein Elefant“ (Gewicht × Wiederholungen grob), Plank/Zeit in Filmlängen.
  Nur wenn die Rechnung plausibel ist, sonst weglassen.
- Wann: wenn eine Schwelle überschritten wird (einmalig, wie Rang-Up), als dezenter Toast oder
  kurze Animation auf der Karte; Freunde sehen es im Live-Feed („Dean ist einen Marathon gelaufen“).
  Nicht zu oft – lieber wenige, gute Meilensteine pro Übung (z. B. 5–8 Stufen).
- Technisch: Liste der Meilensteine je Einheiten-Familie (Distanz/Zeit/Wiederholungen) mit
  Schwelle, Text-Schlüssel (alle 4 Sprachen) und optional Sprach-/Regionsfilter; erreichte
  Meilensteine am Server speichern (nicht nur im Browser), damit sie auf allen Geräten gleich
  sind und nicht doppelt kommen. Optional „Meilensteine“-Liste auf der Kartenrückseite.
- Mit Dean vorher die Liste absegnen ❓.

**Erweiterung (Dean, 2026-11-24): Rang- und Vergleichs-Nachrichten**
- **Rang-Meilensteine** mit eigener, größerer Feier statt nur kleinem Toast, z. B. bei S+:
  „Herzlichen Glückwunsch – du gehörst jetzt zur Elite!“ (eigene Animation in S+-Farbe, Sound,
  Freunde sehen es live). Abgestufte Texte für A und S („Du spielst jetzt in der oberen Liga“ o. Ä.).
- **Prozent-Vergleiche**, z. B. „Bei Liegestützen gehörst du jetzt zu den oberen 20 %“.
  Ehrlich bleiben, woher die Zahl kommt:
  1. **Innerhalb von TrackYourCrew** (echte Daten aller Nutzer, gleiche Übungsart, Wochenbestwert):
     erst sinnvoll ab genügend Nutzern pro Übungsart (z. B. ≥ 50), Text „… der TrackYourCrew-Athleten“.
  2. **Vorher** über die Rang-Stufen abgeleitet, wenn die Schwellen auf recherchierten
     Bevölkerungswerten beruhen (z. B. Rang B ≈ oberes Drittel) – Text dann vorsichtig formulieren.
  Nur Stufen mit Aussagekraft melden (Top 50 / 25 / 10 / 5 / 1 %), jede nur einmal.
- Backend: Perzentil-Berechnung über alle Nutzer je Übungsart (anonym, nur Zahlen), gecacht.
  Datenschutz: keine Namen fremder Nutzer, nur die Prozentzahl.

## 2. Ton der Login-Seite ✅ entschieden: so lassen
- Dean will Druck behalten („man soll gezwungen sein, am Ball zu bleiben“).
- „WEEK FAILED“-Animation bleibt. Login-Texte („PUSH HARDER…“, „wer einknickt“) bleiben ❓
  (Claude hatte vorgeschlagen, sie zum entspannten Konzept passend zu machen; Dean fragte nur
  nach, was gemeint ist – Erklärung siehe Chat. Bei Gelegenheit kurz bestätigen lassen.)

---

## 3. Sprachmix in Überschriften ✅ (Dean: passt, 2026-11-24)
**Stand 2026-11-24:** Überschriften laufen über Schlüssel (`nav.*`, `hero.kicker/week/getToWork`, `log.title`,
`crew.title`, `card.week/weekTab/allTime/lastSync/next`, `insights.title`, `ranking.title`, „YOU“ → `common.you`).
EN = bisheriger Text, **DE neu** (Auswertung, Einstellungen, Abmelden, DAS CREW-DASHBOARD, WOCHE 09 · AN DIE ARBEIT,
WOCHE 9 EINTRAGEN, DIE CREW, ATHLETEN, Gesamt seit Start, STAND, NÄCHSTER, DEINE AUSWERTUNG, GESAMT-RANKING),
ES/FR inzwischen ebenfalls übersetzt (GET TO WORK bleibt überall englisch); FR mit geschützten Leerzeichen vor ? ! : ;. Zurückdrehen = DE-Werte dieser Schlüssel in `de.js` wieder auf Englisch.
**Dean (2026-11-24):** „GET TO WORK“ bleibt englisch (starker Spruch, auch auf Deutsch: „WOCHE 09 · GET TO WORK“).
„WEEK DONE/FAILED“ dagegen auf Deutsch: „WOCHE GESCHAFFT!“ / „WOCHE 12 VERFEHLT“ (`card.weekDone`, `card.weekFailed(N)`).
- Englische Überschriften in DE/ES/FR übersetzen: z. B. „LOG WEEK 9 PROGRESS“, „GET TO WORK“,
  „THE CREW DASHBOARD“, „ATHLETES“, Kopfzeile „Insights/Ranking/Settings/Logout“, „STATUS“,
  „ALL-TIME TOTAL“, „LAST SYNC“, „POWER INSIGHTS“.
- Bewusst englisch bleiben: Streak, Boost, Rank, Crew, Power-Day, Loser-Day, GET TO WORK (WEEK DONE/FAILED jetzt doch deutsch, s. u.).
- **Dean will zuerst nur die deutsche Variante ansehen**: Umsetzung so, dass sie leicht
  zurückzudrehen ist (Schlüssel in den Sprachdateien; EN-Text = bisheriger englischer Text).
  Screenshots vorher/nachher zeigen, dann entscheidet Dean.

---

## 4. Geführtes, interaktives Tutorial + Einladungslink ✅ (2026-11-24)
### 4a. Dynamisches Tutorial (statt nur Text) ✅ (überarbeitet 2026-11-24 nach Deans Feedback)
**Überarbeitung:** heißt jetzt „Tutorial“; Schritte mit Aufgabe weiß leuchtend/pulsierend umrandet, Erklärungen
mit ruhigem Neon-Rahmen; Pfeile weiter/zurück statt „Schritt überspringen“, Fortschrittsbalken, Tastatur ←/→/Esc;
neue Schritte zu den Eintrag-Einstellungen (Gesamt/Mo–So, Zahnrad, Live-Speichern, Schrittweiten); verschwindet
das Ziel (Formular zu), springt es zum passenden Schritt zurück. Website-Icon ohne schwarzen Hintergrund.
**Umgesetzt:** Nach dem Einführungs-Dialog (Sprache, Startwerte) startet eine Tour auf der echten Seite
(`components/GuidedTour.jsx`, Schritte in `lib/tour.js`): Eintragen öffnen → Wert speichern → Karte doppelt tippen →
Rückseite erklärt → Crew öffnen → Einladungslink teilen → Einstellungen. Rahmen + Abdunkeln, Klicks gehen durch,
weiter erst nach der echten Aktion (oder „Schritt überspringen“), „Tour beenden“ jederzeit, Neustart in den
Einstellungen. Fortschritt am Konto (`tour_step`, `PUT /me/tour`, -1 = fertig); Bestandsnutzer bekommen die Tour
nicht automatisch. Dazu „↻ Doppeltippen zum Umdrehen“ auf der eigenen Karte, bis man sie einmal umgedreht hat.
- Führt durch die echte Seite, hebt das jeweilige Element hervor (Spotlight/Abdunkeln) und geht
  **erst weiter, wenn der Nutzer die Aktion wirklich macht**, z. B.:
  1. Sprache wählen
  2. Startwerte setzen (wie bisher)
  3. „Fortschritt eintragen“ öffnen und einen Wert eintragen
  4. Karte doppelt antippen → Rückseite (Rang, Radar) erklären
  5. Freunde einladen (Link kopieren/teilen)
  6. Einstellungen kurz zeigen (Ziel ändern, Pausieren/Abschließen)
- Überspringen jederzeit möglich, später erneut startbar (Einstellungen → „Tour starten“).
- Technisch: eigene kleine Tour-Komponente (keine Bibliothek nötig), Ziele über `data-tour`-
  Attribute, Fortschritt am Konto speichern (`onboarding_step` statt nur `onboarding_done`).
- Bestehendes `components/Onboarding.jsx` wird Schritt 1–2 davon.
### 4b. Einladungslink ✅ (2026-11-24)
**Umgesetzt:** Hinzufügen per Name + Code = Anfrage (`POST /friends/add` → `friend_requests_in` beim Ziel),
Antworten „Annehmen & zurück hinzufügen“ / „Nur annehmen“ / „Ablehnen“ (`/friends/requests/{id}/accept|decline`),
rotes Badge am Crew-Knopf, „Wartet auf Antwort“-Liste, gekreuzte Anfragen verbinden beide sofort.
Einladungslink `/join/CODE` (`POST /friends/join`, sofort gegenseitig, merkt sich den Code bis nach dem Login),
Teilen-Knopf (Web Share am Handy, sonst Kopieren) im Crew-Panel und in den Einstellungen, Schalter
„Freundschaftsanfragen empfangen“ (`/me/friend-requests-setting`). Bestehende einseitige Freundschaften bleiben.
Offen aus 4b: Hinweis „Doppeltippen zum Umdrehen“ → kommt mit der Tour (4a).
- Link wie `https://trackyourcrew.de/join/DEAN1` (Handle). Wer ihn öffnet: Login → wird direkt
  zur Crew hinzugefügt (beide Richtungen? ❓ – aktuell sind Freundschaften einseitig).
- Teilen-Knopf (Web Share API am Handy, sonst Kopieren) im Crew-Panel, im Tutorial und in den Einstellungen.
- Backend: `POST /friends/join {handle}`; Frontend-Route `/join/:handle` (Handle bis nach dem
  Login merken). Render-Rewrite deckt `/join/*` schon ab.
- Hinweis „Doppeltippen zum Umdrehen“ dezent auf der eigenen Karte, bis man es einmal gemacht hat.

---

## 5. Langzeit-Mehrwert 🟨 (Verlauf + Crew-Gesamtwertung ✅, Erinnerungen später)
**Umgesetzt (2026-11-24):** „Deine Entwicklung“ je Übung in den Insights (`components/HistoryChart.jsx`, Daten
`history`/`best_week` aus `/insights/me`): Balken je Woche, Ziel als Strich, Bestwoche mit ★, verfehlte Wochen grau,
scrollbar bei vielen Wochen; erscheint auch ohne Tageswerte (Tages-Auswertung dann ausgeblendet, Wochenschnitt aus
dem Verlauf). Ranking: erster Reiter „Gesamt“ mit 10 Punkten je geschaffter Woche + 2 je Woche laufender Streak
(`lib/score.js`), Erklärung unter der Liste.
- **Verlauf**: „Deine Entwicklung“ je Übung, Wochenwert vs. Ziel über alle Wochen (Linie/Balken),
  Bestwert markiert. Ort: Kartenrückseite als weiterer Reiter oder im Insights-Panel ❓.
  Daten liegen vor (`state[key].progression` + `progress_entries`); evtl. Endpunkt `/history/me`.
- **Globales Crew-Ranking** (Deans Idee): Gesamtwertung der Crew über alle Übungen, z. B. Punkte
  aus geschafften Wochen, Streak, Rängen ❓ Formel abstimmen. Ins bestehende Ranking-Panel als
  erster Reiter „Gesamt“.
- **Erinnerungen ✅ umgesetzt 2026-11-25** (Dean: nur Push am Handy, Telegram nur für den Admin): Web Push ohne
  Zusatzbibliothek (`backend/webpush.py`, VAPID-Schlüssel per `tools/gen-vapid.py`), `users.reminder` (Tag + Uhrzeit in
  Ortszeit, Standard So 18 Uhr), Nachricht nur wenn noch etwas fehlt, 1× pro Woche; Schleife im Server alle 10 Min. +
  `POST /api/cron/reminders` für einen externen Wecker; Karte „Erinnerung am Handy“ (am PC unsichtbar, iPhone erst als App).
  Telegram meldet dem Admin Server- und Browser-Fehler (gedrosselt). Früher: z. B. Sonntag „Noch 1 Tag, dir fehlen 40 Liegestütze“. Optionen:
  Web-Push (PWA, Manifest existiert schon) oder Telegram/E-Mail ❓.

---

## 6. Lesbarkeit ✅ (Dean: behalten, 2026-11-24)
**Stand 2026-11-24:** Zwei zentrale Grau-Stufen in `frontend/tailwind.config.js` (`ink-2` #A0A0A0 Nebentext,
`ink-3` #7A7A7A leiser Text) ersetzen #444–#777 und #888–#BBB (≈200 Stellen); Schrift unter 10 px → 10 px.
Wochenziel auf der Karte („/ 6,7 km“) jetzt Nebentext-Stufe. Zurückdrehen: in der Config `ink-2` = #8A8A8A und
`ink-3` = #555 setzen (oder den Commit zurücknehmen).
- Kleine Texte (8–10 px) und dunkle Grautöne (#444/#555 auf #0A0A0A) anheben, **einheitlich**:
  feste Stufen definieren, z. B. Grau-Stufen 3 Töne (Text #E6E6E6 / sekundär #A0A0A0 / leise #7A7A7A)
  und Mindestgröße 10–11 px. Am besten als Tailwind-Farben/Klassen zentral, damit alles stimmig
  bleibt und leicht zurückzusetzen ist (ein Commit, Vorher/Nachher-Screenshots für Dean).

---

## 7. Entschlacken ✅ (2026-11-24)
- **✅ Entscheidung (Dean, 2026-11-24): Boost-Knöpfe bleiben wie sie sind** („0“). Sie verschwinden nach dem
  Boosten ohnehin, und wer Boost nicht will, schaltet ihn in den Einstellungen aus. Varianten A (Flamme je Zeile)
  und B (ein Knopf oben) wurden als Bilder gezeigt und verworfen.
- ~~**Boost-Knöpfe**~~: Dean hat recht – nach dem Boosten verschwinden sie. Vor dem Boosten stehen
  sie aber an jeder Übung. Vorschlag: nur ein kleines Flammen-Symbol je Zeile statt Knopf mit
  Text, oder ein Boost-Knopf oben auf der Karte mit Übungsauswahl ❓ (Bild zeigen).
- **Icon-Raster in den Einstellungen**: siehe Bild im Chat (2026-11-24). Statt 8 Icons + „Mehr Icons“
  in jeder Karte ein Icon-Knopf neben dem Namen, der eine Auswahl öffnet; Auto-Icon beim Tippen
  (1c). Spart ~40 % Kartenhöhe. ✅ freigegeben (Bild gesehen, siehe Entscheidungen).

---

## 8. Speichern vereinheitlichen ✅ entschieden (Dean, 2026-11-26): bleibt wie es ist; Profil-Knopf leuchtet nur bei Änderung
Heute 4 Muster: Profil (eigener Knopf), Schalter/Sprache (sofort), Ziele („Änderungen speichern“),
Pausieren/Abschließen (sofort). Ziel: ein klares Prinzip, Vorschlag:
- **Alles speichert automatisch** (kurz nach der Eingabe, ~600 ms), mit dezenter Rückmeldung
  „Gespeichert ✓“ direkt am Feld. Ziel-Änderungen bleiben „ab dieser Woche“.
- Ausnahme nur bei folgenschweren Aktionen (Löschen, Neustart, Varianten-Wechsel) → Dialog.
- „Änderungen speichern“-Leiste und „Profil speichern“-Knopf entfallen.
- Achtung: Live-Vorschau und Autosave nicht doppelt rechnen; Fehler sichtbar machen.

---

## 9. Technik/Leistung ✅ (2026-11-24, ohne P4)
**Umgesetzt:** Profilbilder beim Hochladen auf 256×256 JPEG (~15 KB, größte Anzeige 128 px → scharf auf
Retina; große Fotos werden nicht mehr abgelehnt). Board/Freunde/Anfragen schicken einen Link
`/api/users/{id}/avatar?v=<Fingerabdruck>` statt Base64 (Browser-Cache ein Jahr). Login-Bild WebP 114 KB statt
1,35 MB PNG (optisch gleich). Einstellungen per `React.lazy` (Start-Paket −13,7 kB gzip). Board lädt die
Einträge pro Nutzer einmal statt dreimal (P2).
**Bewusst nicht:** P4 (Live-Ereignisse gezielt einarbeiten statt Board neu laden) – das Board ist ohne
Base64-Bilder jetzt leicht, der Umbau wäre fehleranfällig bei kleinem Nutzen. Bestehende große Bilder werden
nicht serverseitig verkleinert (bräuchte Pillow im Backend); sie gehen dank Link + Cache nur noch einmal übers Netz
und schrumpfen beim nächsten Hochladen.
- **Profilbilder**: beim Hochladen im Browser auf 128×128 (WebP/JPEG ~10–20 KB) verkleinern;
  im Board nicht mehr als Base64 mitschicken, sondern eigener, cachebarer Endpunkt
  `/api/users/{id}/avatar` (BACKLOG P1). Bestehende Bilder einmalig verkleinern (Migration, Test).
- **Board**: nicht bei jedem Live-Event komplett neu laden; Events gezielt einarbeiten (P4).
  Board-Berechnung: Daten pro Nutzer nur einmal laden (P2).
- **Login-Bild** 1,35 MB PNG → WebP (~100–150 KB).
- **Settings per `React.lazy`** nachladen (P5), Bundle ist ~245 kB gzip.

---

## 10. „Als App installieren“-Anleitung ✅ (2026-11-24, Entwurf von Dean freigegeben)
**Umgesetzt:** `components/InstallSheet.jsx` (iPhone: 2 Schritte mit Teilen-Symbol; Android: Ein-Tipp-Knopf über
`beforeinstallprompt`, sonst Menü-Anleitung; Instagram/WhatsApp & Co.: „Im Browser öffnen“), Regeln in
`lib/install.js` (+ Tests): nie am PC, nie beim 1. Besuch, ab 2. Besuch oder nach dem 1. Eintrag, nie während
Einführung/Tour, „Später“ = 14 Tage, „Nicht mehr zeigen“ = nie, nicht wenn installiert. Einstellungen: Karte
„App auf dem Handy“ (PC: Hinweis mit Adresse). `public/sw.js` reicht nur durch, speichert nichts (nur im Build
registriert). Offen: QR-Code am PC (bräuchte eine Bibliothek), echter Android-Knopf erst auf der Live-Seite testbar.
Dezent und smart, mit kleinen Grafiken im Stil der Seite (schwarz, Neon-Akzent, Anton):
- **Erkennt das Gerät** und zeigt nur die passende Anleitung:
  - **Android (Chrome/Edge/Samsung):** echter Ein-Klick-Knopf „App installieren“ über das
    Browser-Ereignis `beforeinstallprompt` – keine Anleitung nötig.
  - **iPhone/iPad (Safari):** kleines Blatt von unten mit 2 Schritten als Grafik:
    1. Teilen-Symbol unten in Safari antippen (Symbol nachgezeichnet, Pfeil zeigt hin)
    2. „Zum Home-Bildschirm“ wählen → fertig. Hinweis, falls in Chrome/Instagram-Browser
       geöffnet: „Öffne die Seite in Safari“.
  - **PC:** nur in den Einstellungen anbieten, nicht von selbst einblenden.
- **Nicht nerven:** nie beim ersten Besuch; frühestens nach dem ersten Eintrag oder 2. Besuch,
  wegklickbar („Später“), danach erst nach ~2 Wochen wieder, nie mehr nach „Nicht mehr zeigen“.
  Nicht anzeigen, wenn die App schon installiert ist (`display-mode: standalone`).
- Immer erreichbar in den Einstellungen: „App auf dem Handy installieren“.
- Vorteile kurz nennen: startet wie eine App, Vollbild, später Push-Erinnerungen.
- Voraussetzung: Service Worker (siehe UMSETZUNGSPLAN 6.7 Stufe 1), sonst bietet Android den
  Installieren-Knopf nicht an. Grafiken als SVG im Code (scharf, mehrsprachig beschriftbar).
- Vor Umsetzung Entwurf als Bild zeigen ❓.

## 11. Körperprofil mit Figur ⬜ (Deans Idee, 2026-11-24)
- Kleines **Mensch-Symbol neben dem eigenen Namen** (Karte + Einstellungen). Antippen öffnet ein
  Panel mit einer **Strichfigur** (nur Linien, im Grau der Website, Gesicht nur aus Linien).
- Oben **♂ / ♀** zum Umschalten (zwei Figuren: männlich und weiblich).
- Unter der Figur ein Feld **Körpergewicht (kg)**. Wird gebraucht für die „gestemmt“-Meilensteine
  (Liegestütz ≈ 65 %, Klimmzug ≈ 100 % des Körpergewichts) statt der Schätzung mit 75 kg.
- **Gamification:** Die Figur wird mit steigenden Rängen **athletischer** (z. B. 4–5 Stufen:
  F/E → D/C → B → A/S → S+; Durchschnitt über die eigenen Ränge). Freunde sehen die Figur auf
  der Karte, **nicht das Gewicht**.
- Datenschutz: Gewicht und Geschlecht nur für einen selbst sichtbar, freiwillig, jederzeit löschbar.
- Figuren als SVG-Linienzeichnungen je Stufe und Geschlecht (scharf, animierbarer Übergang bei
  Stufenwechsel). Entwurf vorher als Bild zeigen ❓.
- **Verbinden-Symbol** im selben Panel für Gesundheits-/Sport-Apps (siehe 12a).
- **Eine Figur für alles (Dean, 2026-11-24):** Dieselbe Figur ist das Markenzeichen und läuft auch
  in den TikTok/Shorts-Videos (UMSETZUNGSPLAN 6.5), u. a. im Abspann vor dem Ausblenden ins
  Schwarz. Deshalb Figur von Anfang an als **ein gemeinsames Design** anlegen (gleiche
  Proportionen, Linienstil, männlich/weiblich, Athletik-Stufen), aus dem sich sowohl die
  App-Linienzeichnung als auch die Video-Version ableiten. Abstimmen ❓: Im Video war eine
  „schwarze, gesichtslose“ Figur geplant, in der App „Gesicht nur aus Linien“ – Vorschlag:
  gleiche Figur, im Video als schwarze Silhouette mit hellem Linien-Umriss, Gesichtslinien so
  reduziert, dass sie neutral bleibt (jeder kann sich darin sehen).
- **Stil-Referenz (Dean, 2026-11-24):** anatomische Comic-Linienzeichnung wie „Yellow Dude“
  (Gravgear) – realistische Muskeln, glatter Kopf – aber **nur Umrandungen**, neutrale Haltung,
  graue Linien auf Schwarz. **Kein Nachbau**: kein Gelb, kein Mittelstrich im Gesicht, keine
  Schlitzaugen, keine Armstulpen; eigenes Merkmal = Neon-Blitz. Skizzen: `docs/skizzen/figur-v1.svg`
  (zu simpel), `docs/skizzen/figur-v2.svg` (Richtung passt).
- Finale Figuren (♂/♀, 4–5 Athletik-Stufen, plus Video-Posen) am besten von Hand gezeichnet als
  Vektorgrafik (Illustrator/Inkscape oder Designer), Claude-Skizzen nur als Vorlage.
- **Alternative/Favorit (Dean überlegt, 2026-11-24): ein 3D-Modell für App und Videos.**
  Ein einziges Modell, aus dem alles entsteht:
  1. **MakeHuman** (kostenlos, Open Source): Körper per Regler bauen – männlich/weiblich,
     Muskel- und Fettanteil → genau die 4–5 Athletik-Stufen. Glatter Kopf, neutrales Gesicht.
  2. **Mixamo** (kostenlos, Adobe-Konto): automatisches Skelett + fertige Bewegungen
     (Joggen, Liegestütze, Kniebeugen, Gehen u. v. m.) für die Videos.
  3. **Blender** (kostenlos): Material grau/schwarz, Licht, Kamera; für die App dieselbe Figur
     als **Linien-Rendering** (Freestyle-Umrisse) → passt zum Website-Stil; fürs Video als
     schwarze/graue Silhouette mit Umriss, Ausblenden ins Schwarz.
  - Claude kann dafür **Blender-Python-Skripte** schreiben (Material, Licht, Kamera, Umriss-Render,
    Stapel-Export aller Stufen/Posen) und die App-Grafiken daraus erzeugen. Die Werkzeuge muss
    Dean installieren (Blender, MakeHuman) bzw. das Mixamo-Konto anlegen; aktuell ist nichts
    davon auf dem PC installiert.
  - Für Bewegungen, die Mixamo nicht hat (z. B. Schwimmen, Radfahren), eigene Animation oder
    Kauf/Freigabe-Bewegungen; Lizenzen vor Veröffentlichung prüfen.
  - Schnelle Alternative zum Ausprobieren: KI-3D-Generatoren (Text/Bild → 3D, z. B. Meshy,
    Tripo) – Qualität schwankt, Skelett meist nötig; eher für erste Tests.
- **✅ Entscheidung (Dean, 2026-11-24): Stil von „Yellow Dude“ übernehmen, Figur aber klar eigen
  machen** (Claudes Vorschläge unten übernommen). **Kein Name nötig** – die Figur ist nur ein
  stummes Markenzeichen nach außen (läuft/trainiert, redet nicht).
  Hintergrund der Entscheidung:
  - Yellow Dude ist das Markenzeichen von Gravgear (YouTube/TikTok, >1,5 Mio. Abos, eigener
    Shop). Eine fast gleiche Figur in Grau mit ähnlichem Namen kann als Nachahmung gelten
    (Urheberrecht an der Figur, Markenrecht am Namen) – Risiko: Video-Löschungen/Sperren auf
    TikTok/YouTube, Abmahnung, und Zuschauer halten es für eine Kopie, was der eigenen Marke schadet.
  - Unbedenklich ist der **Stil**: anatomische Comic-Linienzeichnung, glatter, haarloser Kopf,
    neutrale Haltung, kurze Hose, sachlich-witzige Fitness-Erklärvideos.
  - Empfehlung: Stil übernehmen, Figur klar eigen machen – eigene Kopfform/Gesicht (z. B. nur
    Augenlinien, kein Mittelstrich, keine Schlitzaugen), keine Armstulpen, eigenes Merkmal
    (Neon-Blitz, ggf. leuchtende Konturen im Rang-Farbton). Kein Name, also auch kein
    „… Dude“-Anklang.

## 12. Weitere smarte Funktionen (Vorschläge von Claude, 2026-11-24 – entschieden, siehe „Entscheidungen zu Punkt 12“)
a) **Verbindungen zu Sport-Apps** (Deans Idee): Läufe/Fahrten/Schritte automatisch eintragen.
   - **Strava**: offizielle Web-Schnittstelle (OAuth) – mit der Website machbar, beste erste Wahl
     (viele Uhren, Garmin, adidas Running u. a. können zu Strava synchronisieren).
   - **Apple Health / Google Health Connect**: nur aus einer echten App heraus möglich, also erst
     mit dem App-Release (UMSETZUNGSPLAN 6.7).
   - **adidas Running**: keine offene Schnittstelle bekannt → über Strava-Sync abdecken.
   - **Garmin**: Schnittstelle nur nach Freischaltung durch Garmin; ebenfalls über Strava.
b) **Tagesziel „auf Kurs“**: „Heute noch 30 Liegestütze, dann bist du im Plan“ – Restmenge der
   Woche geteilt durch verbleibende Tage, direkt auf der Karte. Großer Alltagsnutzen.
c) **Kudos/Reaktionen**: Freunden mit einem 🔥 auf ihren Eintrag reagieren (Live-Feed). Stärkt die Crew.
d) **Wochenrückblick** (Montag): kurze Karte „Deine Woche“ + Crew-Highlights (wer hat geliefert,
   neue Ränge, Meilensteine).
e) **Crew-Challenges**: gemeinsames Wochenziel der Crew (z. B. „zusammen 100 km“) oder 1-gegen-1-
   Duell über eine Woche.
f) **Smarter Ziel-Vorschlag**: „Du schaffst seit 3 Wochen 140 % – Ziel erhöhen?“ bzw. umgekehrt
   bei häufigem Verfehlen (ergänzt den automatischen −10-%-Abzug).
g) **Urlaub/Krank-Modus**: mit einem Klick alle Übungen für eine Woche pausieren, Streak bleibt
   erhalten (bewusst begrenzt, z. B. max. 2 Wochen am Stück, damit der Druck bleibt).
h) **Erinnerungen** (schon in Punkt 5 geplant): Push am Handy, z. B. Sonntag 18 Uhr, wenn noch etwas fehlt.
i) **Daten-Export** (CSV/JSON) und **Konto löschen** (Pflicht für DSGVO/Stores, steht im BACKLOG).

### Entscheidungen zu Punkt 12 (Dean, 2026-11-24)
- **b) Tagesziel „auf Kurs“: ✅ umgesetzt 2026-11-24** (`lib/pace.js`: Plan = Ziel × (Tag+1)/7; graue Zeile
  „Heute noch X, dann bist du im Plan“, Sonntag „… dann ist die Woche geschafft“; vorn im Plan = nichts; seit Deans Feedback nur als Hinweis beim Drüberfahren/Antippen der Übung) – dezent, nicht zu viel (z. B. kleine graue Zeile unter dem
  Balken der eigenen Karte, nur wenn noch etwas fehlt; kein Popup, keine Farbe außer bei „geschafft“).
- **c) Reaktionen: ✅ neu gebaut 2026-11-25 (Dean):** statt fester Leiste ein Sprechblasen-Knopf auf fremden Karten →
  Auswahl der 6 Emojis → schicken; Animation oben rechts auf der Karte (Absender sofort, Empfänger live per WebSocket
  oder beim nächsten Besuch, `db.emojis`, `POST /api/emoji`, `/me/emojis/unseen|seen`, Spam-Schutz 3 s je Paar / 60 am Tag).
  Herausfordern ebenfalls per Knopf auf der Karte (Dialog mit der Person vorausgewählt); der Bereich „Challenges“
  erscheint nur noch, wenn es welche gibt. Erste Version vom 24.11. (ersetzt): (`db.reactions`, `PUT /api/reactions`, Board-Feld `reactions` für diese +
  letzte Woche; Leiste unter „Gesamt seit Start“, Ereignis aus `lib/reactions.js`: geschafft / Vorwoche verfehlt /
  diese Woche; Namen nur von Bekannten, sonst „+N weitere“; Toast beim Empfänger) auf Einträge **und** auf „Week done“/„Week failed“ der Freunde.
  Auswahl von ~6: 😂 lachen · 😢 weinen · 🔥 Feuer · 😎 Sonnenbrille · 💪 Bizeps · 👏 Applaus.
  Kleine Leiste, Zähler je Reaktion, Live per WebSocket, eine Reaktion pro Person und Ereignis
  (änderbar). Wer reagiert hat, sieht man beim Antippen.
- **d) Wochenrückblick:** ❌ erstmal nicht.
- **e) Crew-Challenges: ✅ umgesetzt 2026-11-24, seit 2026-11-25 auch mit mehreren Leuten** (Dialog: Personen-Chips + „+“,
  bis 5 Eingeladene, `participants` je Challenge, Duell = wer am meisten, gemeinsam = Summe; alte 1:1-Einträge werden gelesen) (`db.challenges`, `/api/challenges` + accept/decline/withdraw;
  Kalenderwoche Mo–So, Duell oder gemeinsames Ziel, gleiche Einheit nötig, Ergebnis wird nach Wochenende
  eingefroren; Bereich „Challenges“ über der Crew, Historie mit Siegen in der Auswertung; Dev-Zeitreise
  verschiebt Challenges mit) **als Herausforderung**, die der andere **annehmen oder ablehnen** kann
  (z. B. „Wer schafft diese Woche mehr Liegestütze?“ oder gemeinsames Ziel). Ergebnis muss
  **richtig in der Historie** stehen (eigene Liste „Challenges“: gegen wen, was, Ergebnis,
  Datum; Sieger-Markierung; auch im Archiv/Verlauf sichtbar).
- **f) Smarter Ziel-Vorschlag: ✅ umgesetzt 2026-11-24** (`_goal_suggestion`: 3 Wochen ≥ 130 % → erhöhen auf den
  kleinsten dieser Werte; 3 von 4 verfehlt bei 20–70 % → senken auf den Schnitt. Hinweis unter „Eintragen“,
  `POST /goals/me/exercises/{key}/goal`, „Nein danke“ = 4 Wochen Ruhe je Übung im Browser)
- **g) Urlaub/Krank-Modus: ❌ wieder entfernt 2026-11-25 (Dean)** – ersetzt durch „Alle pausieren“ bei den pausierten
  Übungen (alle Übungen dürfen pausiert sein, Streak bleibt). Früher: ✅ umgesetzt 2026-11-24 (Dean: **max. 6 Wochen pro Kalenderjahr** statt 2 am Stück;
  `user_goals.away`, `GET/POST/DELETE /api/me/away`, Einstellungs-Karte `components/Away.jsx`, Karte zeigt Insel/Thermometer
  statt Werten, Streak überspringt solche Wochen). Die Crew sieht es (dezentes Symbol 🏖️/🤒 statt Werte, „im Urlaub
  bis Mo“), aber **es soll niemanden demotivieren**: pausierte Personen zählen nicht in
  Crew-Ziele/Challenges/Durchschnitte, keine „failed“-Animation, kein Abwärts-Ranking für sie.
  Begrenzung z. B. max. 2 Wochen am Stück, damit der Druck bleibt.

## 13. Einfacher tracken (Vorschläge von Claude, 2026-11-24 – entschieden, siehe unten)
Heute: Formular öffnen → Wert eintippen/+-Knöpfe → speichern. Ideen, wie es noch schneller geht:
a) **Schnell-Knöpfe auf der eigenen Karte**: z. B. „+10“ / „+1 km“ direkt an der Übung, ohne
   Formular; lange drücken = eigener Wert. Mit „Rückgängig“ für ein paar Sekunden.
b) **Per Telegram eintragen**: dem schon vorhandenen Bot „30 liegestütze“ schreiben → wird
   eingetragen und bestätigt (Konto einmal mit dem Bot verknüpfen). Sehr bequem unterwegs.
c) **Per Sprache**: Mikrofon-Knopf, „30 Liegestütze“ sagen → eingetragen (läuft im Browser).
d) **App-Kurzbefehle**: App-Symbol lange drücken → „Liegestütze eintragen“ (über das Manifest,
   sobald als Web-App installiert).
e) **Kamera-Zähler**: Handy hinstellen, die Kamera zählt Liegestütze/Kniebeugen automatisch
   (Bewegungserkennung läuft nur auf dem Gerät, kein Video verlässt das Handy). Spektakulär,
   aber Aufwand hoch → eher später.
f) **Eingebaute Stoppuhr** für Zeit-Übungen (Plank, Handstand): Start/Stopp trägt die Zeit ein.
g) **Automatisch über Strava** (12a) für Laufen/Rad/Schwimmen.

### Entscheidungen zu Punkt 13 (Dean, 2026-11-24)
- **a) Schnell-Knöpfe: ❌ verworfen** (Dean, 2026-11-25, Entwurf gesehen). Früher: skeptisch – Karte darf nicht voller werden. Höchstens testweise in einer
  Variante, die die Karte nicht belastet (z. B. erst beim Antippen einer Übungszeile einblenden);
  wenn es überladen wirkt, verwerfen. Vorher Bild zeigen ❓.
- **b–e:** erstmal nicht.
- **f) Stoppuhr für Zeit-Übungen: ✅ umgesetzt 2026-11-24** (im Eintrag-Formular bei Sek./Min./Std.; Startzeit im
  Browser, läuft bei Bildschirm aus weiter; „Stopp“ → mit ‹ › sekundengenau nachjustieren (halten = schneller) → „+X“ zählt dazu; optional
  Sprachsteuerung in ganzen Sätzen („starte die Stoppuhr“, „stoppe dich“, „von vorn“, „brich ab“, 4 Sprachen),
  3-2-1-Countdown, Sprachcoach per Lautsprecher-Knopf (Stimme des Geräts: Countdown, Halbzeit, noch 30/10 s, 3-2-1, Ziel
  geschafft, Zwischenzeiten; Ziel = Wochenrest), Mikrofon fragt vorher an und meldet Fehler (z. B. nur https);
  `lib/stopwatch.js`, `components/Stopwatch.jsx`)
- **g) Strava: ⏸ zurückgestellt** (Dean, 2026-11-25: für die API-App braucht es eine Strava-Mitgliedschaft; außerdem
  prüfen: neue Apps verbinden anfangs nur wenige Sportler, und die API-Regeln von Ende 2024 erlauben evtl. nur die
  Anzeige für den Nutzer selbst, nicht für die Crew). Geplantes Verhalten, falls es später kommt:
  - Jeder Strava-Eintrag wird mit **Quelle + Strava-Aktivitäts-ID** gespeichert → nie doppelt
    (gleiche Aktivität wird beim erneuten Abruf erkannt, auch nach Bearbeitung in Strava).
  - Manuelle und Strava-Werte werden **getrennt gespeichert und zusammengezählt**; in der
    Tagesansicht (Mo–So) ist ein Strava-Wert mit **Strava-Symbol** markiert, z. B. „5,2 km (Strava)“.
  - Manuelles Ändern überschreibt den Strava-Wert nicht, sondern kommt dazu; Strava-Werte lassen
    sich einzeln ausblenden/entfernen (falls man etwas doppelt eingetragen hat).
  - Hinweis beim Eintragen, wenn für den Tag schon ein Strava-Lauf existiert („Heute schon 5,2 km
    über Strava – wirklich zusätzlich eintragen?“).
  - Zuordnung: Strava-Sportart → passende Übung (Lauf/Rad/Schwimmen/Gehen), einstellbar.

## 14. Realistischer Formverlust bei Pausen ✅ einfach umgesetzt (Dean, 2026-11-25)
**Umgesetzt:** eine Kurve für alle Übungen (Kraft-Werte): bis 2 Wochen Pause 100 %, 3 Wo. 95 %, 4 Wo. 90 %, 5–6 Wo. 85 %,
ab 7 Wo. 80 % – nach Pausieren und Urlaub/Krank, ohne Comeback-Bonus. Info-Text + Tabelle bei den pausierten Übungen
und in der Urlaub-Karte, Vorschau „Jetzt fortsetzen: Ziel …“. Bestandsnutzer ab Update-Woche (`pause_loss_from_week`).
**Erste Antwort (verworfen):** keine Abbaukurve nach Pausen. Das Absenken bleibt nur für den Fall, dass man es wiederholt
nicht schafft (heutige Regel: verfehlt = eingefroren, nach 4 verfehlten Wochen × 0,9; dazu der Ziel-Vorschlag 12f).
Dean überlegt, Urlaub/Krank (12g) wieder zu entfernen, um die App schlanker zu machen.
Idee: Wenn man aussetzt, soll das Ziel so **realitätsnah wie möglich** sinken. Beispiel von Dean:
10 Wochen lang täglich mind. 100 Liegestütze, dann 1 Woche Pause – was passiert? Und nach 2, 3 … Wochen?
- **Heute:** verfehlte Woche = Ziel eingefroren, erst nach 4 verfehlten Wochen am Stück Ziel × 0,9
  (`_compute_progression`, `DELOAD_AFTER_MISSES`/`DELOAD_FACTOR`). Das ist grob, nicht realistisch.
- **Was die Sportwissenschaft grob sagt** (vor Umsetzung mit Quellen prüfen):
  - 1 Woche Pause: praktisch kein Verlust, oft sogar erholt (wie eine Deload-Woche).
  - Kraft/Wiederholungen: bleibt ca. 2–3 Wochen weitgehend erhalten, danach langsamer Abbau.
  - Ausdauer (Laufen/Rad/Schwimmen): sinkt früher und schneller (spürbar ab ca. 2 Wochen).
  - Wer lange trainiert hat, verliert langsamer und holt schneller wieder auf („Muskelgedächtnis“).
- **Möglicher Ansatz:** Abbaukurve je Übungsart (Kraft vs. Ausdauer), abhängig von Pausenlänge
  und wie lange vorher konstant trainiert wurde; nach der Pause ein **Comeback-Ziel**, das schneller
  wieder ansteigt als normal, bis das alte Niveau erreicht ist.
- **Zu klären mit Dean:** passt das zur Leitidee „Verfehlen wird nicht bestraft“? Vorschlag: positiv
  formulieren („Comeback-Woche, dein Körper braucht kurz zum Reinkommen“), nie als Strafe zeigen.
  Gilt das auch für bewusste Pausen (Pausieren, Urlaub/Krank aus 12) oder nur für verfehlte Wochen?
  Bestandsnutzer: wie bei `rules_from_week` erst ab der Update-Woche.
- Erst eine Tabelle „Pausenlänge → Ziel danach“ je Übungsart als Entwurf vorlegen, dann umsetzen.

## 15. Aktivitäten + Eintragen per Sprache ✅ (Dean, 2026-11-26)
- Eintragen per Sprache (Mikro im Formular, Bestätigung vor dem Speichern), Mikrofon-Funktionen pro Gerät abschaltbar.
- Aktivitäten („Gym 2× pro Woche“) als zweiter Typ neben Übungen: erst als Prototyp, dann auf eigenem Zweig in der
  echten App getestet und übernommen. Name „Aktivitäten“ (Dean).

## Danach: Promo-Phase (nicht Teil dieser Runde)
Wird gemeinsam geplant und durchgeführt, inkl. Statistik-Zugriff, Auswertung und Skill
„promo-analyse“ – siehe `docs/UMSETZUNGSPLAN.md` Abschnitte 6.4–6.6.

## Entscheidungen vom 2026-11-24 (Antworten auf die offenen Fragen)
- **Varianten-Start (1d):** Feld mit 60 % des letzten Ziels vorausgefüllt, frei änderbar.
- **Ränge für Varianten (1d):** eigene, leichtere Schwellen je nach Zusatzgewicht
  (Richtwert +10 kg ≈ 60 %, +20 kg ≈ 40 % der normalen Schwellen), S+ bleibt gleich schwer.
- **Freundschaften (4b) – neu:**
  - Hinzufügen per Name + Code = **Anfrage**, die der andere bestätigt (sichtbar mit Hinweis/Badge).
  - In der Anfrage ein Knopf **„Annehmen & zurück hinzufügen“** (gegenseitig mit einem Klick),
    außerdem „Nur annehmen“ und „Ablehnen“.
  - **Einladungslink** = direkt gegenseitig (der Besitzer teilt ihn bewusst).
  - **Einstellung „Freundschaftsanfragen empfangen“** an/aus (aus = keine neuen Anfragen per Code;
    der eigene Einladungslink funktioniert weiter).
  - Bestehende einseitige Freundschaften bleiben, wie sie sind.
- **Verlauf (5):** in die Insights (großes Diagramm je Übung), Karte bleibt schlank.
- **Globales Crew-Ranking (5):** Punkte für geschaffte Wochen + Bonus für Streaks
  (Formel-Vorschlag: 10 Punkte je geschaffte Woche, +2 je Woche laufender Streak, Pausen neutral).
- **Login-Texte (2):** bleiben so.
- **Icon-Auswahl (7) ✅ freigegeben:** Icon als Knopf links neben dem Übungsnamen (Rahmen in
  Akzentfarbe, kleiner Pfeil ▾), Antippen öffnet eine Auswahl mit allen Icons (Raster 6 Spalten,
  aktuelles Icon markiert, schließt bei Auswahl/Klick daneben). Das Raster unter „ICON“ in der
  Karte entfällt. Dazu Auto-Icon beim Tippen (1c). Dean hat Vorher/Nachher-Bilder gesehen.
- **Varianten ohne Gewicht (1d) ✅:** pauschal 60 % der Schwellen. Der Gewichtsfaktor gilt für **alle**
  Stufen inkl. S+ (wie RANG-TABELLE.md; „S+ bleibt gleich schwer“ = relativ gleich schwer).
- **Boost-Darstellung (7) ✅:** bleibt wie bisher.
- **Noch offen:** Logo-Text (8).

## Offene Punkte für Dean (Stand Ende Sitzung 2026-11-24)
Bereits entschieden: Rang-Tabelle, Meilensteine, Icon-Knopf, Varianten-Start 60 %, Varianten-Ränge,
Freundschaftsanfragen, Verlauf in Insights, Crew-Ranking-Formel, Login-Texte bleiben, Reaktionen,
Challenges, Ziel-Vorschlag, Urlaub/Krank, Stoppuhr, Strava, Figur-Stil (eigen, kein Name).
Noch offen – jeweils mit Bild/Entwurf vorlegen:
1. ~~**Boost-Darstellung**~~ ✅ bleibt wie bisher.
2. **Logo-Text** „TRACKER“ vs. „TRACK YOUR CREW“.
3. **Schnell-Knöpfe** (13a): nur testweise, Bild zeigen, verwerfen wenn überladen.
4. **Installations-Anleitung** (10): Entwurf als Bild.
5. ~~Varianten ohne Gewichtsangabe~~ ✅ entschieden: pauschal 60 %; Gewichtsfaktor gilt für alle Stufen inkl. S+.
6. **Überschriften übersetzen** (3) und **Lesbarkeit** (6): erst umsetzen, dann Vorher/Nachher zeigen.
7. **Figur**: 3D-Weg starten? Dafür installiert Dean Blender + MakeHuman und legt ein
   Mixamo-Konto an; Claude schreibt die Blender-Skripte. Weibliche Skizze steht noch aus.
8. **Realistischer Formverlust** (14): Tabelle „Pausenlänge → Ziel danach“ als Entwurf zeigen,
   klären ob auch bewusste Pausen betroffen sind.

## Werkzeuge für Übersetzungen
In Runde 1 wurden Texte über Hilfsskripte im Scratchpad gepflegt (nicht im Repo). Für Runde 2
einfacher: neue Schlüssel direkt in alle vier Dateien `frontend/src/i18n/{en,de,es,fr}.js`
eintragen (alphabetisch sortiert, gleiche Schlüssel überall). Fehlende Schlüssel zeigen im
Dev-Modus eine Konsolen-Warnung `[i18n] fehlender Text`. Optional ein kleines Prüfskript
`tools/check-i18n.py` anlegen, das gleiche Schlüsselmengen in allen vier Dateien prüft.
