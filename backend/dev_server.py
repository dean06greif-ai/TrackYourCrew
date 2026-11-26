"""Lokaler Testmodus: Backend mit Spiel-Datenbank im Arbeitsspeicher.

Start:  backend\\.venv\\Scripts\\python dev_server.py      (Port 5000)
Login:  http://localhost:5000/api/dev/login?as=dean   (oder anton, mia, leo, neu)

- Die echte MongoDB wird NIE angefasst: der Mongo-Client wird vor dem Import von
  server.py durch mongomock ersetzt, die MONGO_URL ist ein Dummy.
- Beim Start werden Demo-Nutzer mit 9 Wochen Verlauf angelegt.
- Alles ist nach einem Neustart wieder weg.
- Zeitreise zum Testen von Wochenwechseln: /api/dev/shift?days=7
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Port frei wählbar (DEV_PORT), damit der Testmodus neben einem normalen lokalen Server laufen kann.
DEV_PORT = int(os.environ.get("DEV_PORT", "5000"))

os.environ.update({
    "MONGO_URL": "mongodb://dev-in-memory.invalid:27017",
    "DB_NAME": "tracker_dev",
    "GOOGLE_CLIENT_ID": "dev-client-id",
    "GOOGLE_CLIENT_SECRET": "dev-client-secret",
    "FRONTEND_URL": os.environ.get("DEV_FRONTEND_URL", "http://localhost:3000"),
    "BACKEND_PUBLIC_URL": f"http://localhost:{DEV_PORT}",
    "CORS_ORIGINS": os.environ.get("DEV_FRONTEND_URL", "http://localhost:3000"),
})

# Push im Testmodus: jedes Mal frische Test-Schlüssel (nie die echten aus .env)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import webpush  # noqa: E402

_vp, _vk = webpush.generate_vapid_keys()
os.environ.update({"VAPID_PUBLIC_KEY": _vp, "VAPID_PRIVATE_KEY": _vk, "DISABLE_REMINDER_LOOP": "1"})
# Prozent-Vergleiche im Testmodus schon ab 3 Spielern zeigen (echt: 50)
os.environ.setdefault("STATS_MIN_USERS", "3")

import motor.motor_asyncio  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

motor.motor_asyncio.AsyncIOMotorClient = AsyncMongoMockClient
sys.path.insert(0, str(Path(__file__).resolve().parent))
import server  # noqa: E402

assert isinstance(server.client, AsyncMongoMockClient), "Testmodus darf nie gegen echtes MongoDB laufen"

from fastapi import HTTPException, Query  # noqa: E402
from fastapi.responses import RedirectResponse  # noqa: E402

db = server.db

DEMO_USERS = {
    "dean":  {"name": "Dean",  "handle": "DEAN1", "start_weeks_ago": 8, "skill": [1.05, 1.1, 0.7, 1.0, 1.02, 1.0, 0.5, 1.1, 0.4]},
    "anton": {"name": "Anton", "handle": "ANTON", "start_weeks_ago": 8, "skill": [1.0, 1.0, 1.1, 1.0, 1.05, 1.0, 1.0, 1.0, 0.8]},
    "mia":   {"name": "Mia",   "handle": "MIA22", "start_weeks_ago": 5, "skill": [1.2, 1.0, 0.6, 0.6, 1.0, 0.3]},
    "leo":   {"name": "Leo",   "handle": "LEO33", "start_weeks_ago": 2, "skill": [1.0, 0.9, 0.2]},
}


def _monday_weeks_ago(n: int) -> datetime:
    now = datetime.now(timezone.utc)
    monday = (now - timedelta(days=now.weekday())).replace(hour=9, minute=0, second=0, microsecond=0)
    return monday - timedelta(weeks=n)


async def seed():
    now = datetime.now(timezone.utc)
    for key, spec in DEMO_USERS.items():
        uid = f"user_dev_{key}"
        await db.users.insert_one({
            "user_id": uid, "email": f"{key}@dev.localhost", "name": spec["name"],
            "handle": spec["handle"], "picture": None, "created_at": now.isoformat(),
            "remember_me": True, "friends": [], "friend_order": [],
        })
        start = _monday_weeks_ago(spec["start_weeks_ago"])
        g = {
            "user_id": uid,
            "exercises": [dict(e) for e in server.DEFAULT_EXERCISES],
            "boosts": [],
            "weekly_increase": server.BASE_INCREASE,
            "start_date": start.isoformat(),
            "rules_from_week": 1,
            "pause_loss_from_week": 1,
        }
        await db.user_goals.insert_one(dict(g))
        cur_week = server._calc_week_number(start)
        # Woche für Woche: Ziel berechnen, dann Wert = Ziel x Faktor eintragen.
        for w in range(1, cur_week + 1):
            g = await server._load_goals(uid)
            state = await server._compute_user_state(uid, g, w)
            factor = spec["skill"][min(w - 1, len(spec["skill"]) - 1)]
            values = {}
            for ex in g["exercises"]:
                goal = state[ex["key"]]["current_goal"]
                values[ex["key"]] = server._round_goal(goal * factor, ex.get("unit", ""))
            await db.progress_entries.insert_one({
                "user_id": uid, "week_number": w, "values": values, "days": {},
                "updated_at": now.isoformat(),
            })

    # Ganz neuer Nutzer, der das Tutorial noch nicht gesehen hat (as=neu).
    await db.users.insert_one({
        "user_id": "user_dev_neu", "email": "neu@dev.localhost", "name": "Neu Ling",
        "handle": "NEU11", "picture": None, "created_at": now.isoformat(),
        "remember_me": True, "friends": ["user_dev_dean"], "friend_order": ["user_dev_dean"],
        "hide_boost_buttons": True, "onboarding_done": False,
    })
    await server._load_goals("user_dev_neu")  # legt Standard-Übungen an

    # Alle sind miteinander befreundet.
    ids = [f"user_dev_{k}" for k in DEMO_USERS]
    for uid in ids:
        others = [o for o in ids if o != uid]
        await db.users.update_one({"user_id": uid}, {"$set": {"friends": others, "friend_order": others}})


@server.app.get("/api/dev/login")
async def dev_login(as_: str = Query("dean", alias="as"), redirect: str = "/dashboard"):
    """Test-Login ohne Google. Nur im Testmodus vorhanden."""
    uid = f"user_dev_{as_}"
    if not await db.users.find_one({"user_id": uid}):
        raise HTTPException(404, f"Unbekannter Demo-Nutzer. Möglich: {', '.join(DEMO_USERS)}, neu")
    base = f"{server.FRONTEND_URL}{redirect}"
    resp = RedirectResponse(base, status_code=302)
    token = await server._create_session_and_set_cookie(resp, uid, True)
    resp.headers["location"] = f"{base}#token={token}"
    return resp


@server.app.get("/api/dev/shift")
async def dev_shift(days: int = 7):
    """Zeitreise: verschiebt alle Startdaten um `days` Tage in die Vergangenheit."""
    async for g in db.user_goals.find({}, {"_id": 0, "user_id": 1, "start_date": 1}):
        sd = datetime.fromisoformat(g["start_date"]) - timedelta(days=days)
        await db.user_goals.update_one({"user_id": g["user_id"]}, {"$set": {"start_date": sd.isoformat()}})
    # Challenges laufen nach Kalenderwoche: mitverschieben, damit sie „vorbei“ sind.
    async for c in db.challenges.find({}, {"_id": 0, "id": 1, "monday": 1}):
        m = datetime.fromisoformat(c["monday"]).date() - timedelta(days=days)
        await db.challenges.update_one({"id": c["id"]}, {"$set": {"monday": m.isoformat()}})
    return {"ok": True, "shifted_days": days}


if __name__ == "__main__":
    import uvicorn
    asyncio.run(seed())
    print(f"Testmodus: Spiel-Datenbank im Speicher. Login: http://localhost:{DEV_PORT}/api/dev/login?as=dean")
    uvicorn.run(server.app, host="localhost", port=DEV_PORT)
