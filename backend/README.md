# Backend (FastAPI + MongoDB)

Eine Datei: `server.py`. Alle Routen liegen unter `/api`.

## Lokal starten

```
python -m venv .venv
.venv\Scripts\activate            # Windows (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt -r requirements-dev.txt
copy .env.example .env            # dann Werte eintragen
python server.py                  # läuft auf http://localhost:5000
```

## Tests

```
python -m pytest tests -q
```

Die Tests laufen komplett offline (mongomock statt MongoDB) und brauchen keine `.env`.
Details: `tests/conftest.py`.
