"""Prüft die Sprachdateien frontend/src/i18n/{en,de,es,fr}.js:
- alle vier haben genau dieselben Schlüssel
- jeder im Code benutzte Schlüssel t("…") existiert (feste Schlüssel, keine zusammengesetzten)

Aufruf: python tools/check-i18n.py   (Exit-Code 1 bei Fehlern)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "frontend" / "src"
LANGS = ["en", "de", "es", "fr"]
KEY_RE = re.compile(r'^\s*"([^"]+)":', re.M)

keys = {}
for lang in LANGS:
    text = (ROOT / "i18n" / f"{lang}.js").read_text(encoding="utf-8")
    keys[lang] = set(KEY_RE.findall(text))

errors = []
base = keys["en"]
for lang in LANGS[1:]:
    missing = base - keys[lang]
    extra = keys[lang] - base
    if missing:
        errors.append(f"{lang}: fehlen {sorted(missing)}")
    if extra:
        errors.append(f"{lang}: zusätzlich {sorted(extra)}")

used = set()
for f in list(ROOT.rglob("*.jsx")) + list(ROOT.rglob("*.js")):
    if "i18n" in f.parts:
        continue
    for m in re.finditer(r'\bt\(\s*"([a-zA-Z0-9_.]+)"', f.read_text(encoding="utf-8")):
        used.add(m.group(1))
    for m in re.finditer(r'translate\(\s*getLang\(\)\s*,\s*"([a-zA-Z0-9_.]+)"', f.read_text(encoding="utf-8")):
        used.add(m.group(1))
unknown = used - base
if unknown:
    errors.append(f"im Code benutzt, aber nicht übersetzt: {sorted(unknown)}")

if errors:
    print("i18n FEHLER:\n  " + "\n  ".join(errors))
    sys.exit(1)
print(f"i18n ok: {len(base)} Schlüssel in {len(LANGS)} Sprachen, {len(used)} fest im Code benutzt")
