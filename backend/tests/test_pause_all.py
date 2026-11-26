"""Alle Übungen pausieren (ersetzt Urlaub/Krank, Dean 2026-11-25)."""
from datetime import datetime, timedelta, timezone

from conftest import run, befriend


def _start_weeks_ago(db, user, weeks_ago):
    start = (datetime.now(timezone.utc) - timedelta(weeks=weeks_ago)).isoformat()
    run(db.user_goals.update_one({"user_id": user["user_id"]}, {"$set": {"start_date": start}}))


def _complete_weeks(client, db, user, weeks):
    for w in weeks:
        g = client.get("/api/goals/me", headers=user["headers"]).json()
        vals = {k: next(p for p in st["progression"] if p["week"] == w)["goal"] for k, st in g["state"].items()}
        run(db.progress_entries.insert_one({"user_id": user["user_id"], "week_number": w, "values": vals, "days": {}}))


def _me(client, user):
    return next(u for u in client.get("/api/board", headers=user["headers"]).json()["users"]
                if u["user_id"] == user["user_id"])


class TestPauseAll:
    def test_alle_pausieren_und_fortsetzen(self, client, make_user):
        u = make_user("Alle", handle="ALLE1")
        g = client.post("/api/goals/me/pause-all", json={"action": "pause"}, headers=u["headers"]).json()
        assert {st["status"] for st in g["state"].values()} == {"paused"}
        me = _me(client, u)
        assert me["exercises"] == [] and me["all_paused"] is True
        g = client.post("/api/goals/me/pause-all", json={"action": "resume"}, headers=u["headers"]).json()
        assert {st["status"] for st in g["state"].values()} == {"active"}
        assert _me(client, u)["all_paused"] is False

    def test_letzte_aktive_uebung_einzeln_pausieren_geht_jetzt(self, auth):
        for key in ("ex1", "ex2", "ex3"):
            r = auth.post(f"/api/goals/me/exercises/{key}/status", json={"action": "pause"})
            assert r.status_code == 200, r.text

    def test_nicht_alles_abschliessen(self, auth):
        auth.post("/api/goals/me/exercises/ex1/status", json={"action": "complete"})
        auth.post("/api/goals/me/exercises/ex2/status", json={"action": "complete"})
        assert auth.post("/api/goals/me/exercises/ex3/status", json={"action": "complete"}).status_code == 400

    def test_streak_bleibt_ueber_komplette_pause(self, client, make_user, db):
        u = make_user("Streak", handle="STRK2")
        _start_weeks_ago(db, u, 4)  # aktuelle Woche 5
        _complete_weeks(client, db, u, [1, 2])
        # Woche 3 komplett pausiert
        for ex in ("ex1", "ex2", "ex3"):
            run(db.user_goals.update_one({"user_id": u["user_id"], "exercises.key": ex},
                                         {"$set": {"exercises.$.pauses": [{"from_week": 3, "to_week": 4}]}}))
        _complete_weeks(client, db, u, [4, 5])
        me = _me(client, u)
        assert me["streak"]["current"] == 4 and me["streak"]["best"] == 4

    def test_ungueltige_aktion(self, auth):
        assert auth.post("/api/goals/me/pause-all", json={"action": "urlaub"}).status_code == 422

    def test_freunde_sehen_pause(self, client, make_user, db):
        a = make_user("Anna", handle="ANNAP")
        b = make_user("Ben", handle="BENPP")
        befriend(db, b, a)
        client.post("/api/goals/me/pause-all", json={"action": "pause"}, headers=a["headers"])
        board = client.get("/api/board", headers=b["headers"]).json()
        anna = next(x for x in board["users"] if x["user_id"] == a["user_id"])
        assert anna["all_paused"] is True
