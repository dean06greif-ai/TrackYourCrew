#!/usr/bin/env python3
"""Inhaltsverzeichnis einer großen Quelldatei mit Zeilennummern.

Die großen Dateien (UserCard.jsx 3300 Zeilen, Settings.jsx 2100, Dashboard.jsx
2000, server.py 1950) sollte niemand komplett lesen. Erst hiermit die Stelle
finden, dann gezielt den Bereich öffnen.

    python tools/outline.py frontend/src/components/UserCard.jsx
    python tools/outline.py backend/server.py --routes     # nur API-Routen
    python tools/outline.py frontend/src/pages/Dashboard.jsx --grep boost   # Volltextsuche,
                                                 # zeigt zu jedem Treffer die umgebende Funktion
"""
import re
import sys

PY = [
    (re.compile(r"^@(?:api_router|app)\.(get|post|put|delete|patch|websocket)\(\"([^\"]+)\""), "route"),
    (re.compile(r"^(?:async )?def (\w+)"), "def"),
    (re.compile(r"^class (\w+)"), "class"),
    (re.compile(r"^# -{5,} (.+?) -{5,}"), "section"),
]
JS = [
    (re.compile(r"^(?:export )?(?:default )?(?:async )?function (\w+)"), "function"),
    (re.compile(r"^(?:export )?const (\w+) = (?:React\.)?(?:memo|forwardRef)?\(?(?:async )?\(?[^=]*=>"), "const-fn"),
    (re.compile(r"^(?:export )?const ([A-Z][A-Z0-9_]+) ="), "konstante"),
    (re.compile(r"^  const (\w+) = (?:useCallback|useMemo)\("), "  fn"),
    (re.compile(r"^  (?:const|async function|function) (\w+)(?: = (?:async )?\([^)]*\) =>| ?\()"), "  fn"),
    (re.compile(r"^  (?:const \[(\w+), \w+\] = )useState"), "  state"),
    (re.compile(r"^  (useEffect|useLayoutEffect)\("), "  effect"),
    (re.compile(r"^\s*(?://|\{/\*) ?[-=─]{3,} ?(.+?) ?[-=─]*(?:\*/\})?$"), "section"),
]


def main():
    argv = sys.argv[1:]
    needle = None
    if "--grep" in argv:
        i = argv.index("--grep")
        needle = argv[i + 1].lower()
        del argv[i:i + 2]
    only_routes = "--routes" in argv
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 1
    path = args[0]
    rules = PY if path.endswith(".py") else JS
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()
    print(f"{path}  ({len(lines)} Zeilen)")
    pending_route = None
    top = scope = "(Dateianfang)"
    for no, line in enumerate(lines, 1):
        entry = None
        for rx, kind in rules:
            m = rx.match(line)
            if not m:
                continue
            if kind == "route":
                pending_route = f"{m.group(1).upper():6} /api{m.group(2)}"
                break
            label = m.group(m.lastindex) if m.lastindex else m.group(0).strip()
            if kind == "section" and not re.search(r"\w", label):
                break
            if kind == "def" and pending_route:
                label, pending_route, kind = f"{pending_route}  -> {label}", None, "route"
            entry = (kind, label)
            break
        if entry and entry[0] == "  fn":
            scope = f"{top} > {entry[1]}"
        elif entry and not entry[0].startswith(" ") and entry[0] != "section":
            top = scope = entry[1]
        if needle is not None:
            # Volltextsuche: jede Trefferzeile mit der Funktion, in der sie steht.
            if needle in line.lower():
                print(f"{no:5}  [{scope}]  {line.strip()[:110]}")
            continue
        if entry is None or (only_routes and entry[0] != "route"):
            continue
        print(f"{no:5}  {entry[0]:9} {entry[1]}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(0)
