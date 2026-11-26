"""Workout-Modus: Live-Status auf der Karte (Dean 2026-11-26)."""
import board as board_mod
from conftest import befriend


def _live(client, user, **body):
    data = {"exercise_key": "ex2", "round": 3, "rounds": 8, "phase": "work", "reps": 34}
    data.update(body)
    return client.put("/api/me/live", json=data, headers=user["headers"])


def _card(client, viewer, owner):
    return client.get(f"/api/board/users/{owner['user_id']}", headers=viewer["headers"]).json()["user"]


def test_freunde_sehen_live_und_ende(client, make_user, db):
    a = make_user("Anna", handle="ANNA1")
    b = make_user("Ben", handle="BENN1")
    befriend(db, b, a)  # Ben hat Anna in seiner Crew
    r = _live(client, a)
    assert r.status_code == 200
    live = _card(client, b, a)["live"]
    assert live["round"] == 3 and live["rounds"] == 8 and live["reps"] == 34 and live["exercise_name"]
    assert client.delete("/api/me/live", headers=a["headers"]).status_code == 200
    assert _card(client, b, a)["live"] is None


def test_veraltet_verschwindet(client, make_user, monkeypatch):
    a = make_user("Anna", handle="ANNA1")
    _live(client, a)
    board_mod.LIVE_WORKOUTS[a["user_id"]]["_t"] -= board_mod.LIVE_TTL_S + 1
    assert _card(client, a, a)["live"] is None


def test_pruefungen(client, make_user):
    a = make_user("Anna", handle="ANNA1")
    assert _live(client, a, exercise_key="nope").status_code == 404
    assert _live(client, a, phase="sleep").status_code == 422
    assert _live(client, a, rounds=999).status_code == 422
    assert client.put("/api/me/live", json={"exercise_key": "ex2"}).status_code == 401
    assert _live(client, a, round=12, rounds=8).json()["live"]["round"] == 8  # nie über die Rundenzahl
