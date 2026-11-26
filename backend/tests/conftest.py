"""Offline-Testumgebung fürs Backend.

Die App läuft im selben Prozess (FastAPI TestClient), MongoDB wird durch
mongomock ersetzt. Kein Netzwerk, keine echte Datenbank, keine Secrets nötig.

WICHTIG: Der Mongo-Client wird ersetzt, BEVOR server.py importiert wird. Damit
können die Tests die echte Datenbank nie anfassen, selbst wenn in backend/.env
eine echte MONGO_URL steht.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

collect_ignore = ["legacy_emergent"]

# Feste Dummy-Werte. Bewusst hart gesetzt (kein setdefault), damit nichts aus
# der Shell-Umgebung durchrutscht. load_dotenv überschreibt gesetzte Werte nicht.
os.environ.update({
    "MONGO_URL": "mongodb://offline-test.invalid:27017",
    "DB_NAME": "tracker_offline_test",
    "GOOGLE_CLIENT_ID": "offline-test-client-id",
    "GOOGLE_CLIENT_SECRET": "offline-test-client-secret",
    "FRONTEND_URL": "http://frontend.test",
    "BACKEND_PUBLIC_URL": "http://backend.test",
    "CORS_ORIGINS": "http://frontend.test",
})

import motor.motor_asyncio  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

motor.motor_asyncio.AsyncIOMotorClient = AsyncMongoMockClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402

assert isinstance(server.client, AsyncMongoMockClient), "Tests dürfen nie gegen echtes MongoDB laufen"

from fastapi.testclient import TestClient  # noqa: E402
import core, goals, social, routes_auth, board, push, stats  # noqa: E402

# Seit der Aufteilung (BACKLOG W1) liegt jeder Name in einem Modul und wird von anderen importiert.
# Tests ersetzen Werte/Funktionen deshalb überall, wo der Name vorkommt.
MODULES = [server, core, goals, social, routes_auth, board, push, stats]


def patch_everywhere(monkeypatch, name, value):
    hit = False
    for m in MODULES:
        if hasattr(m, name):
            monkeypatch.setattr(m, name, value)
            hit = True
    assert hit, f"{name} gibt es in keinem Modul"


def run(coro):
    """Führt eine DB-Coroutine synchron aus (für Test-Setup)."""
    return asyncio.run(coro)


COLLECTIONS = [
    "users", "user_sessions", "user_goals", "progress_entries",
    "oauth_states", "seen_effects", "migrations", "feedback", "reactions", "emojis", "challenges", "push_subscriptions",
]


@pytest.fixture(autouse=True)
def clean_db():
    """Jeder Test startet mit leerer Datenbank."""
    async def _wipe():
        for name in COLLECTIONS:
            await server.db[name].delete_many({})
    run(_wipe())
    server.manager.active.clear()
    yield


@pytest.fixture
def db():
    return server.db


@pytest.fixture
def make_user(db):
    """Fabrik: legt User + gültige Session an und gibt beides zurück.

    Nutzung: alice = make_user("Alice", handle="AAAAA")
    """
    counter = {"n": 0}

    def _make(name="Test User", handle=None, *, session_days=7, with_goals=True):
        counter["n"] += 1
        n = counter["n"]
        user_id = f"user_test{n:04d}"
        token = f"token_test{n:04d}"
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": user_id,
            "email": f"user{n}@example.com",
            "name": name,
            "handle": handle or f"TST{n:02d}",
            "picture": None,
            "created_at": now.isoformat(),
            "remember_me": True,
            "friends": [],
            "friend_order": [],
        }

        async def _insert():
            await db.users.insert_one(dict(doc))
            await db.user_sessions.insert_one({
                "user_id": user_id,
                "session_token": token,
                "expires_at": (now + timedelta(days=session_days)).isoformat(),
                "created_at": now.isoformat(),
            })
            if with_goals:
                await db.user_goals.insert_one({
                    "user_id": user_id,
                    "exercises": [dict(e) for e in server.DEFAULT_EXERCISES],
                    "boosts": [],
                    "weekly_increase": server.BASE_INCREASE,
                    "start_date": now.isoformat(),
                    "rules_from_week": 1,  # wie ein neuer Nutzer: neue Regeln ab Woche 1
                    "pause_loss_from_week": 1,
                })
        run(_insert())
        return {**doc, "token": token, "headers": {"Authorization": f"Bearer {token}"}}

    return _make


@pytest.fixture
def client():
    """Nicht eingeloggter Client. Startup-/Shutdown-Events laufen mit."""
    with TestClient(server.app) as c:
        yield c


@pytest.fixture
def user(make_user):
    return make_user("Test User Alpha", handle="ALPHA")


@pytest.fixture
def auth(client, user):
    """Eingeloggter Client (Bearer-Token des Standard-Users)."""
    client.headers.update(user["headers"])
    return client


def befriend(db, follower, target):
    """Direkte (einseitige) Freundschaft in der DB: follower sieht target.
    Für Tests, die einfach eine bestehende Crew brauchen (Hinzufügen per Code
    ist seit Plan 4b eine Anfrage, die bestätigt werden muss)."""
    run(db.users.update_one({"user_id": follower["user_id"]},
                            {"$addToSet": {"friends": target["user_id"], "friend_order": target["user_id"]}}))
