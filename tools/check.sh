#!/usr/bin/env bash
# Ein Befehl, der zeigt, ob das Projekt in Ordnung ist.
#   tools/check.sh            -> alles
#   tools/check.sh backend    -> nur Backend (Lint + Tests, ~2 s)
#   tools/check.sh frontend   -> nur Frontend (Tests, ESLint, Build mit Vite, ~1 min)
# Läuft unter Linux/macOS/Git-Bash und in der CI. Benötigt installierte
# Abhängigkeiten (backend: requirements*.txt, frontend: npm ci).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WHAT="${1:-all}"
FAIL=0

if [ -z "${PYTHON:-}" ]; then
  for c in "$ROOT/backend/.venv/bin/python" "$ROOT/backend/.venv/Scripts/python.exe" python3 python; do
    if command -v "$c" >/dev/null 2>&1; then PYTHON="$c"; break; fi
  done
fi

step() { printf '\n== %s ==\n' "$1"; }
run()  { if "$@"; then echo "OK"; else echo "FEHLER: $*"; FAIL=1; fi; }

if [ "$WHAT" = all ] || [ "$WHAT" = backend ]; then
  cd "$ROOT/backend"
  step "Backend: Lint (ruff)";   run "$PYTHON" -m ruff check .
  step "Backend: Tests (pytest)"; run "$PYTHON" -m pytest tests -q -p no:cacheprovider -W ignore::DeprecationWarning
fi

if [ "$WHAT" = all ] || [ "$WHAT" = frontend ]; then
  cd "$ROOT/frontend"
  step "Frontend: Übersetzungen (4 Sprachen vollständig)"; run "$PYTHON" "$ROOT/tools/check-i18n.py"
  step "Frontend: Tests (Vitest, reine Funktionen in src/lib)"
  run npx vitest run --reporter=dot
  step "Frontend: ESLint (Fehler + Hook-Regeln, Warnungen zählen als Fehler)"
  run npx eslint --ext .js,.jsx --max-warnings 0 src
  step "Frontend: Build (Vite)"
  # Der Build braucht nur irgendeine Backend-URL; die echte kommt aus .env / Render.
  export REACT_APP_BACKEND_URL="${REACT_APP_BACKEND_URL:-http://localhost:5000}"
  LOG="$(mktemp)"
  if npm run build >"$LOG" 2>&1; then
    grep -E "built in|kB" "$LOG" || true
    echo "OK"
  else
    tail -40 "$LOG"; echo "FEHLER: Frontend-Build"; FAIL=1
  fi
  rm -f "$LOG"
fi

echo
if [ "$FAIL" = 0 ]; then echo "ALLES OK"; else echo "ES GIBT FEHLER"; fi
exit "$FAIL"
