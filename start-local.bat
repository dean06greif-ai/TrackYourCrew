@echo off
rem Startet Backend (Port 5000) und Frontend (Port 3000) lokal in zwei Fenstern.
rem Beim ersten Start werden Python-Umgebung bzw. Node-Pakete eingerichtet.
cd /d "%~dp0"
if not exist "backend\.env" (
  echo FEHLER: backend\.env fehlt. Vorlage: backend\.env.example
  pause
  exit /b 1
)
start "TrackYourCrew Backend :5000" cmd /k call "%~dp0tools\local-backend.bat"
start "TrackYourCrew Frontend :3000" cmd /k call "%~dp0tools\local-frontend.bat"
echo Backend und Frontend starten in eigenen Fenstern.
echo Die Website oeffnet sich gleich unter http://localhost:3000
echo Beenden: in beiden Fenstern Strg+C druecken bzw. Fenster schliessen.
timeout /t 5 >nul
