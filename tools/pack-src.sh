#!/usr/bin/env bash
# Packt den Quellcode (ohne node_modules, .git, build, Secrets) in .cache/src.tgz.
# Zweck: Claude kann den Stand in Sekunden in seine eigene Arbeitsumgebung holen,
# statt über das langsame Laufwerk mit 90.000 node_modules-Dateien zu arbeiten.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .cache
TMP="${TMPDIR:-/tmp}/src.$$.tgz"
tar czf "$TMP" \
  --exclude=node_modules --exclude=.git --exclude=build --exclude=__pycache__ \
  --exclude=.pytest_cache --exclude=.ruff_cache --exclude=.venv --exclude=venv \
  --exclude='*.msi' --exclude='.env' --exclude='.env.local' --exclude='.env.*.local' \
  --exclude=.vercel --exclude=.cache --exclude=_archiv \
  backend frontend tools docs .github CLAUDE.md README.md .gitignore .gitattributes 2>/dev/null || \
tar czf "$TMP" \
  --exclude=node_modules --exclude=.git --exclude=build --exclude=__pycache__ \
  --exclude=.pytest_cache --exclude=.ruff_cache --exclude=.venv --exclude=venv \
  --exclude='*.msi' --exclude='.env' --exclude='.env.local' --exclude='.env.*.local' \
  --exclude=.vercel --exclude=.cache --exclude=_archiv \
  backend frontend
cp "$TMP" .cache/src.tgz
ls -la .cache/src.tgz
