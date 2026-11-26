"""Emojis schicken (Plan 12c, neu 2026-11-25): live an den Empfänger, sonst beim nächsten Besuch."""
from datetime import datetime, timedelta, timezone

import server
from conftest import run, befriend, patch_everywhere


def _crew(make_user, db):
    a = make_user("Anna", handle="ANNAE")
    b = make_user("Ben", handle="BENEE")
    befriend(db, a, b)
    befriend(db, b, a)
    return a, b


def _send(client, who, to, emoji="🔥"):
    return client.post("/api/emoji", json={"to_user_id": to["user_id"], "emoji": emoji}, headers=who["headers"])


class TestEmojis:
    def test_schicken_und_beim_naechsten_besuch_sehen(self, client, make_user, db):
        a, b = _crew(make_user, db)
        assert _send(client, a, b, "🔥").status_code == 200
        items = client.get("/api/me/emojis/unseen", headers=b["headers"]).json()["items"]
        assert [(i["emoji"], i["from_name"]) for i in items] == [("🔥", "Anna")]
        client.post("/api/me/emojis/seen", json={"ids": [items[0]["id"]]}, headers=b["headers"])
        assert client.get("/api/me/emojis/unseen", headers=b["headers"]).json()["items"] == []

    def test_live_an_den_empfaenger(self, client, make_user, db, monkeypatch):
        a, b = _crew(make_user, db)
        sent = []

        async def fake_send_to(ids, msg):
            sent.append((set(ids), msg))

        monkeypatch.setattr(server.manager, "send_to", fake_send_to)
        _send(client, a, b, "👏")
        assert sent[0][0] == {b["user_id"]}
        assert sent[0][1]["type"] == "emoji" and sent[0][1]["emoji"] == "👏" and sent[0][1]["from_name"] == "Anna"

    def test_kurzer_cooldown_je_paar(self, client, make_user, db):
        a, b = _crew(make_user, db)
        assert _send(client, a, b).status_code == 200
        assert _send(client, a, b).status_code == 429
        # nach Ablauf geht es wieder
        run(db.emojis.update_many({}, {"$set": {"at": (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()}}))
        assert _send(client, a, b, "😂").status_code == 200

    def test_tageslimit(self, client, make_user, db, monkeypatch):
        a, b = _crew(make_user, db)
        patch_everywhere(monkeypatch, "EMOJI_DAILY_MAX", 1)
        patch_everywhere(monkeypatch, "EMOJI_PAIR_COOLDOWN_S", 0)
        assert _send(client, a, b).status_code == 200
        assert _send(client, a, b).status_code == 429

    def test_nur_crew_nicht_selbst_nur_erlaubte(self, client, make_user, db):
        a, b = _crew(make_user, db)
        c = make_user("Cem", handle="CEMEE")
        assert _send(client, a, c).status_code == 404
        assert _send(client, a, a).status_code == 400
        assert _send(client, a, b, "🍕").status_code == 422
        assert client.post("/api/emoji", json={"to_user_id": b["user_id"], "emoji": "🔥"}).status_code == 401

    def test_alte_ungesehene_verfallen(self, client, make_user, db):
        a, b = _crew(make_user, db)
        _send(client, a, b)
        run(db.emojis.update_many({}, {"$set": {"at": (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()}}))
        assert client.get("/api/me/emojis/unseen", headers=b["headers"]).json()["items"] == []

    def test_fremde_koennen_nicht_als_gesehen_markieren(self, client, make_user, db):
        a, b = _crew(make_user, db)
        _send(client, a, b)
        eid = run(db.emojis.find_one({}))["id"]
        client.post("/api/me/emojis/seen", json={"ids": [eid]}, headers=a["headers"])  # Absender, nicht Empfänger
        assert len(client.get("/api/me/emojis/unseen", headers=b["headers"]).json()["items"]) == 1
