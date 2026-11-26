"""Erzeugt ein VAPID-Schlüsselpaar für Web Push (Erinnerungen am Handy).

Aufruf:  backend\.venv\Scripts\python tools\gen-vapid.py
Die beiden Zeilen in backend/.env (lokal) bzw. als Umgebungsvariablen bei Render eintragen.
Den privaten Schlüssel nie teilen oder committen. Einmal festlegen und behalten: neue Schlüssel
machen alle bestehenden Abos ungültig (Nutzer müssten die Erinnerung neu einschalten).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
import webpush  # noqa: E402

pub, priv = webpush.generate_vapid_keys()
print(f"VAPID_PUBLIC_KEY={pub}")
print(f"VAPID_PRIVATE_KEY={priv}")
