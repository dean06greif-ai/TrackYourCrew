"""Aktivitäten (Dean 2026-11-26, Zweig „aktivitaeten“): z. B. „Gym 2× pro Woche“.
Ziel = Mal pro Woche (1–7), erledigte Tage zählen. Keine Steigerung, kein Abzug,
kein Formverlust, kein Boost, keine Variante, kein Ziel-Vorschlag – zählen aber für die Streak."""
from datetime import datetime, timedelta, timezone

from conftest import run

from goals import _compute_progression


def set_start(db, user, weeks_ago):
    start = (datetime.now(timezone.utc) - timedelta(weeks=weeks_ago)).isoformat()
    run(db.user_goals.update_one({"user_id": user["user_id"]}, {"$set": {"start_date": start}}))


def items(g):
    return [{k: e.get(k) for k in ("key", "name", "unit", "icon", "base_value", "progression_pct", "type")} for e in g["exercises"]]


def add_activity(auth, name="Gym", per=2, **extra):
    g = auth.get("/api/goals/me").json()
    new = {"key": "neu1", "name": name, "unit": "km", "icon": "gym", "base_value": per, "progression_pct": 10, "type": "activity", **extra}
    r = auth.put("/api/goals/me", json={"exercises": items(g) + [new]})
    assert r.status_code == 200, r.text
    return next(e for e in r.json()["exercises"] if e["name"] == name)


def test_aktivitaet_wird_normiert(auth):
    a = add_activity(auth, per=2)
    assert a["type"] == "activity"
    assert a["progression_pct"] == 0
    assert a["unit"] == "×"
    assert a["base_value"] == 2
    assert add_activity(auth, name="Yoga", per=12)["base_value"] == 7


def test_typ_bestehender_uebung_bleibt(auth):
    g = auth.get("/api/goals/me").json()
    lst = items(g)
    lst[0]["type"] = "activity"
    out = auth.put("/api/goals/me", json={"exercises": lst}).json()
    assert out["exercises"][0]["type"] == "exercise"


def test_ziel_bleibt_gleich_auch_bei_verfehlt():
    ex = {"key": "a", "unit": "×", "base_value": 2, "progression_pct": 0, "added_week": 1, "type": "activity"}
    res = _compute_progression(ex, set(), {}, 8, future_weeks=0)  # 7 Wochen nichts gemacht
    assert [p["goal"] for p in res["progression"]] == [2.0] * 8  # kein Abzug nach 4 Wochen
    # zum Vergleich: normale Übung würde gesenkt
    normal = dict(ex, type="exercise", unit="", base_value=10)
    assert _compute_progression(normal, set(), {}, 8, future_weeks=0)["progression"][-1]["goal"] < 10


def test_kein_formverlust_nach_pause():
    ex = {"key": "a", "unit": "×", "base_value": 3, "progression_pct": 0, "added_week": 1, "type": "activity",
          "pauses": [{"from_week": 2, "to_week": 8}]}
    res = _compute_progression(ex, set(), {1: {"a": 3}}, 9, future_weeks=0)
    assert res["progression"][-1]["goal"] == 3.0


def test_board_liefert_typ_und_ziel(auth, user):
    a = add_activity(auth, per=2)
    me = auth.get("/api/board").json()["users"][0]
    act = next(e for e in me["exercises"] if e["key"] == a["key"])
    assert act["type"] == "activity" and act["goal"] == 2
    assert all(e["type"] == "exercise" for e in me["exercises"] if e["key"] != a["key"])


def test_erledigte_tage_zaehlen_fuer_woche_geschafft(auth, user, db):
    set_start(db, user, 1)  # aktuelle Woche = 2
    a = add_activity(auth, per=2)
    g = auth.get("/api/goals/me").json()
    week = 2
    # alle normalen Übungen genau aufs Ziel, Aktivität an zwei Tagen
    days = {"0": {}, "1": {}}
    for e in g["exercises"]:
        goal = g["state"][e["key"]]["current_goal"]
        if e.get("type") == "activity":
            days["0"][e["key"]] = 1
            days["1"][e["key"]] = 1
        else:
            days["0"][e["key"]] = goal
    r = auth.put("/api/progress/me", json={"week_number": week, "days": days})
    assert r.status_code == 200, r.text
    me = auth.get("/api/board").json()["users"][0]
    assert week in me["streak"]["completed_weeks"]
    assert me["values"][a["key"]] == 2


def test_nur_ein_tag_reicht_nicht(auth, user, db):
    set_start(db, user, 1)
    add_activity(auth, per=2)
    g = auth.get("/api/goals/me").json()
    days = {"0": {}}
    for e in g["exercises"]:
        days["0"][e["key"]] = 1 if e.get("type") == "activity" else g["state"][e["key"]]["current_goal"]
    auth.put("/api/progress/me", json={"week_number": 2, "days": days})
    me = auth.get("/api/board").json()["users"][0]
    assert 2 not in me["streak"]["completed_weeks"]


def test_kein_boost_und_keine_variante(auth):
    a = add_activity(auth)
    assert auth.post("/api/boost", json={"exercise_key": a["key"]}).status_code == 400
    r = auth.post(f"/api/goals/me/exercises/{a['key']}/upgrade", json={"variant": "+10 kg"})
    assert r.status_code == 400


def test_obergrenze_getrennt(auth):
    g = auth.get("/api/goals/me").json()
    base = items(g)
    acts = [{"key": f"n{i}", "name": f"Akt {i}", "unit": "", "icon": "gym", "base_value": 1, "progression_pct": 0, "type": "activity"} for i in range(7)]
    assert auth.put("/api/goals/me", json={"exercises": base + acts}).status_code == 200
    g = auth.get("/api/goals/me").json()
    one_more = {"key": "n9", "name": "Akt 9", "unit": "", "icon": "gym", "base_value": 1, "progression_pct": 0, "type": "activity"}
    assert auth.put("/api/goals/me", json={"exercises": items(g) + [one_more]}).status_code == 400
