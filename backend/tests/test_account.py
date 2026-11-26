"""Eigene Daten exportieren und Konto löschen (DSGVO, App-Stores)."""
from conftest import run, befriend


def _seed(client, db, a, b):
    befriend(db, a, b)
    befriend(db, b, a)
    run(db.progress_entries.insert_one({"user_id": a["user_id"], "week_number": 1, "values": {"ex2": 10}, "days": {}}))
    client.post("/api/emoji", json={"to_user_id": b["user_id"], "emoji": "🔥"}, headers=a["headers"])
    client.post("/api/emoji", json={"to_user_id": a["user_id"], "emoji": "💪"}, headers=b["headers"])
    client.post("/api/challenges", json={"to_user_id": b["user_id"], "kind": "duel", "from_key": "ex2"},
                headers=a["headers"])
    run(db.users.update_one({"user_id": b["user_id"]},
                            {"$push": {"friend_requests_in": {"from": a["user_id"], "at": "x"}}}))
    run(db.seen_effects.insert_one({"viewer_user_id": b["user_id"], "target_user_id": a["user_id"],
                                    "week_number": 1, "type": "celebration"}))


class TestExport:
    def test_export_enthaelt_alles_eigene(self, client, make_user, db):
        a = make_user("Anna", handle="ANNAX")
        b = make_user("Ben", handle="BENXX")
        _seed(client, db, a, b)
        r = client.get("/api/me/export", headers=a["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["handle"] == "ANNAX"
        assert d["goals"]["user_id"] == a["user_id"]
        assert d["progress"][0]["values"] == {"ex2": 10}
        assert len(d["emojis_sent"]) == 1 and len(d["emojis_received"]) == 1
        assert len(d["challenges"]) == 1
        assert "session_token" not in str(d)

    def test_export_nur_mit_login(self, client):
        assert client.get("/api/me/export").status_code == 401


class TestDeleteAccount:
    def test_falscher_code_loescht_nichts(self, client, make_user, db):
        a = make_user("Anna", handle="ANNAY")
        r = client.post("/api/me/delete", json={"confirm": "FALSCH"}, headers=a["headers"])
        assert r.status_code == 400
        assert run(db.users.find_one({"user_id": a["user_id"]})) is not None

    def test_loescht_alles_und_raeumt_bei_anderen_auf(self, client, make_user, db):
        a = make_user("Anna", handle="ANNAZ")
        b = make_user("Ben", handle="BENZZ")
        _seed(client, db, a, b)
        r = client.post("/api/me/delete", json={"confirm": "#annaz"}, headers=a["headers"])
        assert r.status_code == 200, r.text
        uid = a["user_id"]
        assert run(db.users.find_one({"user_id": uid})) is None
        assert run(db.user_sessions.count_documents({"user_id": uid})) == 0
        assert run(db.user_goals.count_documents({"user_id": uid})) == 0
        assert run(db.progress_entries.count_documents({"user_id": uid})) == 0
        assert run(db.emojis.count_documents({})) == 0
        assert run(db.challenges.count_documents({})) == 0
        assert run(db.seen_effects.count_documents({"target_user_id": uid})) == 0
        bdoc = run(db.users.find_one({"user_id": b["user_id"]}))
        assert uid not in bdoc.get("friends", []) and uid not in bdoc.get("friend_order", [])
        assert not any(x.get("from") == uid for x in bdoc.get("friend_requests_in", []))
        # alte Sitzung gilt nicht mehr, Ben sieht Anna nicht mehr
        assert client.get("/api/auth/me", headers=a["headers"]).status_code == 401
        board = client.get("/api/board", headers=b["headers"]).json()
        assert [u["user_id"] for u in board["users"]] == [b["user_id"]]

    def test_nur_mit_login(self, client):
        assert client.post("/api/me/delete", json={"confirm": "X"}).status_code == 401
