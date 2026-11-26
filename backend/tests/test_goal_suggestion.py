"""Smarter Ziel-Vorschlag (Plan 12f) + Ziel ab dieser Woche setzen."""
from datetime import datetime, timedelta, timezone

from conftest import run, befriend


def _start_weeks_ago(db, user, weeks_ago):
    start = (datetime.now(timezone.utc) - timedelta(weeks=weeks_ago)).isoformat()
    run(db.user_goals.update_one({"user_id": user["user_id"]}, {"$set": {"start_date": start}}))


def _log_ratio(client, db, user, weeks, ratios):
    """Woche für Woche: Wert = Ziel der Woche × Faktor (je Übung gleich)."""
    for w, r in zip(weeks, ratios):
        g = client.get("/api/goals/me", headers=user["headers"]).json()
        vals = {}
        for key, st in g["state"].items():
            goal = next(p for p in st["progression"] if p["week"] == w)["goal"]
            vals[key] = round(goal * r, 1)
        run(db.progress_entries.insert_one({"user_id": user["user_id"], "week_number": w,
                                            "values": vals, "days": {}}))


def _me(client, user):
    board = client.get("/api/board", headers=user["headers"]).json()
    return next(u for u in board["users"] if u["user_id"] == user["user_id"])


class TestGoalSuggestion:
    def test_dreimal_ueber_130_prozent_schlaegt_erhoehen_vor(self, client, make_user, db):
        u = make_user("Stark", handle="STAR1")
        _start_weeks_ago(db, u, 3)  # aktuelle Woche 4
        _log_ratio(client, db, u, [1, 2, 3], [1.5, 1.4, 1.45])
        sg = {s["key"]: s for s in _me(client, u)["goal_suggestions"]}
        assert sg["ex2"]["kind"] == "up"
        assert sg["ex2"]["suggested"] > sg["ex2"]["goal"] * 1.1
        assert sg["ex2"]["pct"] >= 130

    def test_nur_zweimal_reicht_nicht(self, client, make_user, db):
        u = make_user("Zwei", handle="ZWEI1")
        _start_weeks_ago(db, u, 3)
        _log_ratio(client, db, u, [1, 2, 3], [1.0, 1.5, 1.5])
        assert _me(client, u)["goal_suggestions"] == []

    def test_oft_verfehlt_schlaegt_senken_vor(self, client, make_user, db):
        u = make_user("Schwach", handle="SCHW1")
        _start_weeks_ago(db, u, 4)  # aktuelle Woche 5
        _log_ratio(client, db, u, [1, 2, 3, 4], [0.5, 0.5, 0.4, 0.6])
        sg = {s["key"]: s for s in _me(client, u)["goal_suggestions"]}
        assert sg["ex2"]["kind"] == "down"
        assert 0 < sg["ex2"]["suggested"] < sg["ex2"]["goal"]

    def test_gar_nichts_eingetragen_kein_senken(self, client, make_user, db):
        u = make_user("Leer", handle="LEER1")
        _start_weeks_ago(db, u, 4)
        assert _me(client, u)["goal_suggestions"] == []

    def test_freunde_sehen_keine_vorschlaege(self, client, make_user, db):
        a = make_user("Anna", handle="ANNA2")
        b = make_user("Ben", handle="BEN02")
        befriend(db, b, a)
        _start_weeks_ago(db, a, 3)
        _log_ratio(client, db, a, [1, 2, 3], [1.5, 1.5, 1.5])
        board = client.get("/api/board", headers=b["headers"]).json()
        anna = next(x for x in board["users"] if x["user_id"] == a["user_id"])
        assert anna["goal_suggestions"] == []

    def test_ziel_setzen_ab_dieser_woche(self, client, make_user, db):
        u = make_user("Setzer", handle="SETZ1")
        _start_weeks_ago(db, u, 3)
        _log_ratio(client, db, u, [1, 2, 3], [1.5, 1.5, 1.5])
        sg = {s["key"]: s for s in _me(client, u)["goal_suggestions"]}
        new = sg["ex2"]["suggested"]
        r = client.post("/api/goals/me/exercises/ex2/goal", json={"value": new}, headers=u["headers"])
        assert r.status_code == 200, r.text
        st = r.json()["state"]["ex2"]
        p = {c["week"]: c for c in st["progression"]}
        assert p[4]["goal"] == new
        assert p[3]["goal"] < new  # Vergangenheit bleibt
        # danach kein Vorschlag mehr für diese Übung
        assert "ex2" not in {s["key"] for s in _me(client, u)["goal_suggestions"]}

    def test_ziel_setzen_ungueltig(self, client, make_user):
        u = make_user("Bad", handle="BAD01")
        assert client.post("/api/goals/me/exercises/ex2/goal", json={"value": 0}, headers=u["headers"]).status_code == 422
        assert client.post("/api/goals/me/exercises/nope/goal", json={"value": 5}, headers=u["headers"]).status_code == 404
        assert client.post("/api/goals/me/exercises/ex2/goal", json={"value": 5}).status_code == 401
