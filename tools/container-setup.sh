#!/usr/bin/env bash
# Richtet eine frische Linux-Umgebung (Claudes Cloud-Container, CI, Codespace)
# so ein, dass tools/check.sh läuft. Aufruf im Projektwurzelverzeichnis:
#   bash tools/container-setup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt -r requirements-dev.txt
cd "$ROOT/frontend"
npm ci --no-audit --no-fund
echo "Fertig. Jetzt: bash tools/check.sh"
