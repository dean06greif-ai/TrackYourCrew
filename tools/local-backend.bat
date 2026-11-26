@echo off
rem Backend lokal starten (http://localhost:5000). Wird von start-local.bat aufgerufen.
rem Nutzt Python 3.11 bis 3.15 (getestet mit 3.11 und 3.15).
rem Eine unpassende oder kaputte backend\.venv wird automatisch neu angelegt.
setlocal
cd /d "%~dp0..\backend"
set "VPY=.venv\Scripts\python.exe"
set "OKVER=import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] <= (3,15) else 1)"

if exist "%VPY%" "%VPY%" -c "%OKVER%" >nul 2>nul || call :reset_venv "falsche Python-Version"
if exist "%VPY%" "%VPY%" -m pip --version >nul 2>nul || call :reset_venv "pip fehlt"
if not exist "%VPY%" call :make_venv
if not exist "%VPY%" goto :fail

"%VPY%" -m pip --version >nul 2>nul || "%VPY%" -m ensurepip --upgrade
"%VPY%" -m pip --version >nul 2>nul || goto :fail_pip

"%VPY%" -c "import sys; print('Python', sys.version.split()[0])"
echo Pruefe Python-Pakete ...
"%VPY%" -m pip install -q --disable-pip-version-check -r requirements.txt
if errorlevel 1 (
  echo FEHLER bei der Paketinstallation ^(siehe Meldung oben^).
  exit /b 1
)
echo Starte Backend auf http://localhost:5000 ...
"%VPY%" server.py
exit /b

:reset_venv
echo Vorhandene Python-Umgebung ist unbrauchbar ^(%~1^), lege sie neu an ...
rmdir /s /q .venv
exit /b

:make_venv
set "PYCMD="
for %%V in (3.15 3.14 3.13 3.12 3.11) do if not defined PYCMD py -%%V -c "import sys" >nul 2>nul && set "PYCMD=py -%%V"
if not defined PYCMD python -c "%OKVER%" >nul 2>nul && set "PYCMD=python"
if not defined PYCMD (
  echo Es ist kein Python 3.11 bis 3.15 installiert. Vorhanden:
  py -0p 2>nul
  exit /b
)
echo Erstelle Python-Umgebung mit %PYCMD% ^(nur beim ersten Start^) ...
%PYCMD% -m venv .venv
exit /b

:fail
echo FEHLER: Konnte keine passende Python-Umgebung anlegen.
echo Bitte Python 3.13 von https://www.python.org/downloads/ installieren
echo und danach start-local.bat erneut starten.
exit /b 1

:fail_pip
echo FEHLER: In backend\.venv fehlt pip. Ordner backend\.venv loeschen und erneut starten.
exit /b 1
