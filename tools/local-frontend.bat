@echo off
rem Frontend lokal starten (http://localhost:3000). Wird von start-local.bat aufgerufen.
rem Die Variablen hier haben Vorrang vor frontend\.env, die Datei bleibt unveraendert.
cd /d "%~dp0..\frontend"
where npm >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Node.js wurde nicht gefunden. Bitte installieren: https://nodejs.org
  exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" (
  echo Installiere Frontend-Pakete ^(nur beim ersten Start, dauert 1-3 Minuten^) ...
  call npm ci --no-audit --no-fund
)
set REACT_APP_BACKEND_URL=http://localhost:5000
set PORT=3000
call npm start
