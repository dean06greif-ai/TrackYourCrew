# TrackYourCrew

Fitness-Tracker: Wochenziele erreichen und sich mit der eigenen Crew vergleichen.

| Teil | Technik | Ordner | Hosting |
|---|---|---|---|
| Frontend | React 19, Vite, Tailwind, framer-motion | `frontend/` | Render (Static Site) |
| Backend | FastAPI, MongoDB (motor), Google-Login, WebSocket | `backend/` | Render |

## Lokal starten (Windows)

Schnellweg: `start-local.bat` doppelklicken. Öffnet Backend (Port 5000) und Frontend
(Port 3000) in zwei Fenstern und richtet beim ersten Start alles ein. Voraussetzung:
`backend/.env` existiert, Python 3.11+ und Node.js sind installiert.
Für den Google-Login muss in der Google Cloud Console beim OAuth-Client die
Weiterleitungs-URI `http://localhost:5000/api/auth/google/callback` eingetragen sein.

Manuell:

Backend (Terminal 1):
```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
copy .env.example .env      (Werte eintragen)
python server.py            (http://localhost:5000)
```

Frontend (Terminal 2):
```
cd frontend
npm ci
copy .env.example .env
npm start                   (http://localhost:3000)
```

## Prüfen, ob alles in Ordnung ist

```
bash tools/check.sh           # Backend-Lint + 21 Offline-Tests + Frontend-Build
bash tools/check.sh backend   # nur Backend, ca. 2 Sekunden
```

Weitere Doku: `CLAUDE.md` (Arbeitsregeln und Projektüberblick), `docs/BACKLOG.md` (offene Punkte nach Priorität).
