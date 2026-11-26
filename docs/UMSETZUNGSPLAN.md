# Umsetzungsplan: Überarbeitung „entspannt nebenbei“

Stand: 2026-11-24. Grundlage: Deans alte Notizen, mit dem Code abgeglichen.
Leitidee: **Nichts ist gesperrt, alles lässt sich anpassen.** Die App soll motivieren,
nicht bestrafen. Was dieser Idee widerspricht (Tiers, Sperren, harte Startwerte), fliegt raus.

Legende: ✅ schon im Code erledigt · 🔧 umsetzen · ❓ unklar, Dean fragen · ⏳ später

**Stand 2026-11-24: Phase 1–5 umgesetzt** (lokal committet, nicht deployt). Entscheidungen:
Ziel-Änderung gilt ab dieser Woche · Abgeschlossene Übungen sehen auch Freunde · Startwerte
5 km / 150 / 20, +5 % · neue Regeln erst ab Update-Woche · Tutorial in 4 Schritten.
Abweichungen: Tiers ganz raus (6.1 entfällt, Erschweren = Übung anpassen/neu anlegen),
"Abbrechen" war schon korrekt. Offen: Radar (unkonkret), Logo-Text, Phase 6.

---

## Phase 0 – Vorher erledigen (Fundament)
Ohne das keine Veröffentlichung, und jede weitere Änderung wird riskanter.
- 🔧 Aktuellen Stand committen, Git-Umzug nach TrackYourCrew (BACKLOG „Git-Umzug“).
- 🔧 Sicherheit S1/S1b (Passwörter erneuern), S3 (Board gibt E-Mails heraus),
  S4 (WebSocket ohne Login). **Pflicht, bevor die Seite auf Reddit/TikTok geht.**

## Phase 1 – Freiheit statt Sperren (Kern der Überarbeitung)

### 1.1 Wochenziel jederzeit frei setzen, ohne Rückwirkung 🔧
Notizen: „Werte/Startwerte anpassbar, nicht ab Woche 2 locken“, „alles manuell anpassen“.
- Ist: Die Sperre für Startwert und Steigerung ist schon entfernt ✅. **Aber:** Der Startwert
  gilt rückwirkend ab Woche 1. Wer ihn in Woche 8 erhöht, hat plötzlich alte Wochen
  „verfehlt“, und die Streak ist weg. Wer ihn senkt, schafft alte Wochen nachträglich.
- Neu: In den Einstellungen steht pro Übung **„Ziel diese Woche: [Wert]“**. Eine Änderung
  gilt ab der aktuellen Woche (Liste `goal_overrides: [{from_week, value}]`, genauso wie
  die bestehenden `progression_overrides`). Vergangene Wochen bleiben, wie sie waren.
- Ort: `server.py` `_compute_progression`, `update_my_goals`; Live-Vorschau in
  `Settings.jsx` `computeProgressionLive` (muss dieselbe Rechnung haben). Tests dazu.

### 1.2 Übungen löschen, ersetzen, pausieren 🔧
Notizen: „Übung pausieren / löschen und dafür ne andere rein“, „Bei pausieren in
Einstellungen ‚pausiert‘ anzeigen, auf der Usercard weg“, „Löschen von Übungen“.
- Sperre „Standard-Übung ab Woche 2 nicht löschbar“ entfernen (`update_my_goals`, `is_default`).
- Mindestanzahl 3 Übungen auf 1 senken (Höchstzahl 7 bleibt).
- **Pausieren:** neues Feld `paused_from_week` pro Übung. Pausierte Wochen zählen wie
  „Übung gab es noch nicht“: kein Ziel, kein Verfehlen, keine Auswirkung auf die Streak.
  Auf der Karte ausgeblendet, in den Einstellungen grau mit Schild „Pausiert“ und Knopf
  „Fortsetzen“. Beim Fortsetzen geht es mit dem letzten Ziel weiter.
- Löschen: Bestätigungsdialog. Daten bleiben in `progress_entries` (für All-Time-Werte).

### 1.3 Tiers komplett raus 🔧
Notiz: „auch die tiers kommt raus“. Damit erledigen sich: „Wenn nur Tier 1, dann 1 weg“,
„Tier-Hover mit Freischaltung“, „zwischen Tiers wechseln“, „Tiers ausgrauen“, die
Gewichtsliste (Klimmzug +20/+40 kg …).
- Frontend: Tier-Logik aus `UserCard.jsx` (Tier-Store, Tier-Anzeige, Popup) und
  `Settings.jsx` (Tier-Editor) entfernen. Großer Gewinn an Übersicht, beide Dateien werden
  deutlich kürzer.
- Backend: `tier_state` aus Board und Streak-Berechnung nehmen, Endpunkte `/api/tiers/me`
  entfernen. Daten in der DB bleiben liegen (nichts löschen), werden nur nicht mehr gelesen.
- Ersatz für die Idee „schwerer werden“: siehe 6.1 „Variante wechseln“.

### 1.4 Niedrigere Startwerte 🔧 ❓
Notiz: „Startwerte runtersetzen“, „viel zu hoch für entspannt nebenbei“.
- Ist: Lauf 10 km, Liegestütze 500, Klimmzüge 50 pro Woche, +10 % pro Woche.
- Vorschlag: Lauf 5 km, Liegestütze 150, Klimmzüge 20, Steigerung 5 %. **Dean entscheidet.**
- Gilt nur für neue Nutzer. Bestehende passen ihr Ziel selbst an (1.1).
- Login-Text („10 % mehr Laufen …“, „Woche 1: 10 km · 500 Pushups · 50 Pullups“) anpassen.

### 1.5 Automatisch leichter nach 4 verfehlten Wochen 🔧
Notiz: „Nachdem man 4 Wochen lang ein Ziel nicht erreicht hat, geht es um 10 % runter.“
- Passt gut zum Konzept: Verfehlen friert das Ziel heute schon ein. Neu: Nach 4 verfehlten
  Wochen am Stück sinkt das Ziel dieser Übung um 10 %, der Zähler beginnt von vorn.
- Ort: `_compute_progression` (Zähler verfehlter Wochen, Faktor 0,9). Gleiche Logik in der
  Live-Vorschau. Tests: 4× verfehlt → −10 %, 3× verfehlt + geschafft → kein Abzug.
- Kurzer Hinweis auf der Karte: „Ziel um 10 % gesenkt – du schaffst das“.

### 1.6 Boost nur auf Wunsch 🔧
Notiz: „Statt Hide boost umdrehen und activate boost machen.“
- Einstellung „Boost-Knöpfe ausblenden“ wird zu **„Boost aktivieren“** (Standard: aus).
  Bestehende Nutzer: Wert wird umgedreht übernommen, damit sich für sie nichts ändert.
- Ort: `hide_boost_buttons` in `server.py`, `Dashboard.jsx`, `Settings.jsx`.

### 1.7 „Steigerung zurücksetzen“ 🔧
Notiz: „Löschen von Übungen oder Steigerung zurücksetzen.“
- Pro Übung ein Knopf, der das aktuelle Ziel wieder auf den Startwert setzt (nutzt 1.1).
  Den Knopf „Programm komplett neu starten“ (löscht alles) hinter eine deutlichere Warnung legen.

## Phase 2 – Fehler beheben

### 2.1 Ränge falsch / PC und iPhone zeigen andere Werte 🔧
Notizen: „Ranks funktionieren nicht mehr“, „PC und iPhone zeigt andere Werte“.
- Ursache (im Code belegt): Rang und Tier-Stand werden zusätzlich im Browser gespeichert
  (localStorage `rankSystem_v2`, `tierSystem_v1`) und mit dem Serverwert per Maximum
  gemischt. Jedes Gerät hat seinen eigenen Speicher, also eigene Ränge. Alte, falsch
  berechnete Werte bleiben dort für immer hängen.
- Lösung: Rang **nur** aus den Serverwerten (`best_goals` im Board) berechnen. Browser-
  Speicher nur noch für „Rang-Up schon gefeiert“ verwenden. Mit 1.3 (Tiers raus) fällt
  der zweite Speicher ohnehin weg. Danach auf PC und iPhone gegenprüfen.

### 2.2 „Week failed“-Sound 🔧 ❓
- Was genau falsch ist, steht nicht in der Notiz. Wahrscheinliche Ursachen laut Code:
  (a) Der Sound soll beim Öffnen der Seite spielen, Browser (vor allem iPhone) erlauben
  Ton aber erst nach dem ersten Antippen, also bleibt es still. (b) Der Fail wird nur
  erkannt, wenn die Streak von über 0 auf 0 fällt. Wer schon bei 0 war, bekommt keinen.
  (c) Er wird beim Laden des Boards ausgelöst (BACKLOG B1), also manchmal doppelt oder spät.
- Lösung: Dean fragt sich, was er beobachtet hat. Für (a): Sound nachholen beim ersten Tippen.

### 2.3 „Abbrechen“ setzt Eingabe zurück ✅ (prüfen)
- Der Code setzt beim Abbrechen schon auf den gespeicherten Wert zurück (`savedLogForm`).
  Einmal am Handy durchklicken, ob es auch im Tagesmodus stimmt.

## Phase 3 – All-Time-Ranking statt Boost-Ranking 🔧
Notizen: „Boost Ranking weg, dafür All-Time-Ranking deiner Übungen im Vergleich zu
Freunden mit selben Übungen“, „bei Ranking dann auch Ränge hin“.
- Neues Fenster „Ranking“: pro Übung eine Liste der Crew, sortiert nach Gesamtsumme
  aller Wochen, mit Rang-Buchstaben (F–S+) daneben.
- „Gleiche Übung“ wird über die vorhandene Namenserkennung (`detectRankExercise`: Lauf,
  Liegestütze, Klimmzüge, Sit-ups …) zugeordnet, auch bei anderer Schreibweise oder
  Einheit (m/km). Übungen ohne Gegenstück bei Freunden: nur der eigene Wert.
- Daten sind im Board schon da (`all_time` pro Nutzer). Kein neuer Endpunkt nötig.
- `BoostRanking.jsx` und `/api/boost/ranking` entfernen (behebt nebenbei S5).

## Phase 4 – Kleine Verbesserungen an der Oberfläche 🔧
- „I“-Popup: erneutes Antippen des „I“ schließt es wieder.
- Blitz-Symbol im Radar: schwarzer Rand etwas dicker.
- Radardiagramm verbessern: konkret abstimmen (Vorschlag: Achsenbeschriftung lesbarer,
  Rang-Farben als Füllung, Wert beim Antippen anzeigen).
- Rang-Pyramide (Popup) auf dem PC breiter.
- Boost-Flamme ein Stück nach rechts.
- Übungsreihenfolge in den Einstellungen per Drag & Drop so flüssig machen wie bei der Crew.

## Phase 5 – Neue Nutzer abholen 🔧
- **Start-Auswahl:** Wer sich ab Dienstag anmeldet, wählt „Ab nächstem Montag starten“
  oder „Macher-Modus: jetzt starten“. Im Macher-Modus wird angezeigt „Noch X Tage
  diese Woche“. Montags gibt es die Frage nicht. (Technisch: `start_date` auf nächsten Montag.)
- **Kurzes Tutorial** (3–4 Karten): Wochenziel, Eintragen, Crew hinzufügen, Streak.
  Startwerte direkt im Tutorial wählbar (passt zu 1.4).
- Sprache: siehe 6.3.

## Phase 6 – Später / Wachstum ⏳
### 6.1 „Variante wechseln“ ab Rang A (Ersatz für Tiers)
Notiz: „ab Rang A Möglichkeit, Übung zu ändern/zu erschweren“. Statt Tiers: Bei Rang A
bietet die Karte an, die Übung durch eine schwerere Variante zu ersetzen (alte Übung wird
pausiert, neue startet). Vorschläge aus Deans Liste: Klimmzüge/Dips/HSPU +20 kg bzw.
+40 kg, Liegestütze +10 kg bzw. +20 kg. Baut komplett auf 1.2 auf.
### 6.2 Lauf live tracken (Strava)
Strava-Anbindung: Läufe automatisch als km eintragen. Braucht Strava-API-App, OAuth und
regelmäßigen Abruf. Großer Brocken, erst nach Phase 1–3.
### 6.3 Mehrsprachigkeit
Alle Texte sind fest auf Deutsch in sehr großen Dateien. Englisch lohnt sich, wenn die
Seite auf englischsprachigen Reddit-Seiten beworben wird. Sonst weglassen.
### 6.4 Veröffentlichen und Werbung
- Reddit (Fitness-Subreddits), TikTok, Instagram. Vorher: Phase 0, Impressum und
  Datenschutzerklärung (Pflicht in DE, die Seite speichert Google-Konten und E-Mails).
- BodyLab24-Code/Affiliate-Link: muss als „Werbung“/„Anzeige“ gekennzeichnet sein.
- „Freunde werben“: Einladungslink mit Handle, der die Freundschaft direkt anlegt.

### 6.7 App im Google Play Store und App Store (nach der Promo, Deans Idee 2026-11-24)
Stufenweise, damit es erst Geld kostet, wenn es sich lohnt:
1. **Kostenlos: Web-App (PWA)** – Manifest und Icons sind schon da. Noch ergänzen: Service
   Worker (Offline-Grundgerüst), „Zum Homebildschirm hinzufügen“-Hinweis, Push-Benachrichtigungen
   (Android und iPhone ab iOS 16.4, wenn die App auf dem Homebildschirm liegt). Fühlt sich wie
   eine App an, ohne Store.
   Installations-Anleitung für Android/iPhone: siehe `docs/PLAN-RUNDE-2.md` Punkt 10.
2. **Google Play (einmalig 25 $ Entwicklerkonto):** die PWA als „Trusted Web Activity“ verpacken
   (z. B. mit Bubblewrap/PWABuilder) – kaum Zusatzaufwand, gleiche Codebasis.
3. **App Store (99 $ pro Jahr):** mit Capacitor verpacken; Apple verlangt echten Mehrwert
   gegenüber einer Website (z. B. Push, Widgets, Apple-Health-Anbindung für Schritte/Läufe).
   Erst angehen, wenn genug iPhone-Nutzer da sind.
- Voraussetzungen: Datenschutzerklärung, Impressum, Store-Texte/Screenshots, ggf. Konto löschen
  in der App (Pflicht in beiden Stores).
- Kosten zuletzt geprüft 2026-11-24 aus dem Gedächtnis – vor dem Start aktuell nachsehen.

### 6.6 Promo-Phase gemeinsam mit Claude (Deans Wunsch, 2026-11-24)
Die komplette Promotion planen und machen Dean und Claude **zusammen**:
- **Planung:** Plattformen (Reddit, TikTok, YouTube Shorts, Instagram), Zielgruppen, Posting-Plan,
  Texte/Hooks pro Plattform und Sprache, Video-Konzepte (siehe 6.5), Reddit-Regeln je Subreddit.
- **Auswertung:** Claude holt sich Zugriff auf die Statistiken und wertet aus, **warum** etwas
  funktioniert hat oder nicht (Hook, Länge, Uhrzeit, Thema, Plattform), und leitet die nächsten
  Posts daraus ab. Wege zum Zugriff, je nachdem was verfügbar ist:
  - offizielle Schnittstellen: TikTok (Display/Business API), YouTube Analytics API, Reddit API,
    Instagram Graph API; Zugangsschlüssel legt Dean an und hinterlegt sie sicher (nie im Repo/Chat);
  - Dean meldet sich selbst im Browser-Fenster der App an, Claude liest dort die Statistik-Seiten;
  - Fallback: Export/Screenshots der Statistiken.
  - Dazu eigene Kennzahlen der Website: Neuanmeldungen pro Quelle (z. B. `?ref=tiktok` an Links),
    damit klar ist, welcher Kanal echte Nutzer bringt.
- **Skill:** wiederverwendbaren Claude-Skill „promo-analyse“ bauen (Daten einsammeln → Kennzahlen
  vergleichen → Erkenntnisse + Vorschläge für die nächsten Posts als Bericht). Optional als
  wiederkehrende Aufgabe, z. B. wöchentlicher Bericht.
- **Zwei Accounts zum Testen** (Deans Idee, 2026-11-24): Videos auf zwei Accounts hochladen.
  Variante A: gleichzeitig (zwei Fassungen gegeneinander, z. B. anderer Hook/Länge).
  Variante B: versetzt – erst auf Account 1 testen, auswerten, dann die verbesserte Fassung auf
  Account 2. Pro Test nur **eine** Sache ändern, damit klar ist, was den Unterschied macht.
  Vorher Plattformregeln prüfen (doppelte Inhalte/mehrere Accounts können als Spam gelten).
- **Regel:** Claude veröffentlicht oder kommentiert nichts ohne Deans ausdrückliche Freigabe pro Post.

### 6.5 Video-Idee für TikTok / YouTube Shorts / Reels (Deans Idee, 2026-11-24)
Erst angehen, wenn die Website komplett steht und die Promo-Phase beginnt.
- **Konzept:** ca. 1 Minute aus kurzen Sequenzen: joggen, Fahrrad fahren, schwimmen,
  Liegestütze, Klimmzüge usw. Immer dieselbe **schwarze, gesichtslose Figur**, ganz
  entspannt „in der Zone“, ohne Miene. Kein Gesicht, damit sich jeder darin wiedererkennt
  („das könnte ich sein“).
- **Musik:** durchgehend ein entspannter, wiederkehrender Beat mit gleichbleibendem BPM,
  der bei jedem Auftritt der Figur wieder einsetzt, damit man Lust hat dranzubleiben.
  Schnitte auf den Takt legen.
- **Ende:** Die Figur blendet langsam aus, bis das Bild komplett schwarz ist.
- **Gleiche Figur wie in der App** (Körperprofil, `docs/PLAN-RUNDE-2.md` Punkt 11): ein gemeinsames
  Figuren-Design als Markenzeichen, auch im Abspann.
- **3D-Variante** (Dean überlegt): Figur als 3D-Modell (MakeHuman → Mixamo → Blender), grau/schwarz
  gefüllt; Details in `docs/PLAN-RUNDE-2.md` Punkt 11.
- **Umsetzung (von Dean am 2026-11-24 so bestätigt):**
  - Look passend zur Seite: schwarzer Hintergrund, Figur als Silhouette, dezente
    Neon-Akzente (#CCFF00), z. B. die Bewegungslinie oder der Blitz.
  - Hochformat 9:16, die ersten 1–2 Sekunden müssen sofort fesseln. Kurzer Text-Hook
    oben (z. B. „Jede Woche ein bisschen mehr.“), am Ende kurz Name/Domain
    `trackyourcrew.de`, bevor alles schwarz wird.
  - Länge testen: neben der 1-Minuten-Version auch eine 15–20-Sekunden-Schnittfassung.
  - Musik nur lizenzfrei bzw. aus der kommerziellen Musikbibliothek der Plattform
    (bei Werbung für eine eigene Seite gelten strengere Regeln als bei privaten Videos).
  - Erstellung: 3D/Animation (z. B. Blender, Mixamo-Bewegungen) oder echte Aufnahmen,
    die als Silhouette bearbeitet werden.

## Unklar – Dean fragen ❓
- „Ass“ – keine Ahnung, was gemeint war.
- „siehe Chat mit Anton“ – Inhalt liegt nicht vor.
- „Für mich Dips rushen an einem Tag, um schnell auf Tier 2 zu kommen“ – klingt nach
  persönlicher Trainingsnotiz, kein Website-Punkt. Mit Tiers raus erledigt.

## Empfohlene Reihenfolge
1. Phase 0 (Commit, Git, Sicherheit)
2. 1.3 Tiers raus + 2.1 Ränge nur vom Server (zusammen: entfernt den meisten Ballast)
3. 1.1, 1.2, 1.7 (Ziele frei, Pausieren, Löschen)
4. 1.4, 1.5, 1.6 (Startwerte, −10 %, Boost opt-in)
5. Phase 3 (Ranking), 2.2 (Sound)
6. Phase 4 und 5
7. Phase 6 nach Bedarf
