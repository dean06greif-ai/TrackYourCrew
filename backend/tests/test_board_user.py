"""BACKLOG P4: einzelne Karte nachladen statt des ganzen Boards."""
from conftest import befriend, run


def _strip(entry):
    e = dict(entry)
    e.pop("is_online", None)
    return e


def test_own_card_equals_board_entry(auth, user):
    board_me = auth.get("/api/board").json()["users"][0]
    single = auth.get(f"/api/board/users/{user['user_id']}").json()["user"]
    assert _strip(single) == _strip(board_me)


def test_friend_card_matches_board_and_hides_email(auth, user, make_user, db):
    bob = make_user("Bob", handle="BOB22")
    befriend(db, user, bob)
    board_bob = auth.get("/api/board").json()["users"][1]
    single = auth.get(f"/api/board/users/{bob['user_id']}").json()["user"]
    assert _strip(single) == _strip(board_bob)
    assert single["email"] is None


def test_stranger_card_is_not_visible(auth, make_user):
    eve = make_user("Eve", handle="EVE11")
    assert auth.get(f"/api/board/users/{eve['user_id']}").status_code == 404


def test_needs_login(client, user):
    assert client.get(f"/api/board/users/{user['user_id']}").status_code == 401


def test_last_active_at_shows_earlier_weeks(auth, user, db):
    """„Stand“ auf der Karte: auch ohne Eintrag in dieser Woche der letzte Eintrag (frühere Woche)."""
    run(db.progress_entries.insert_one(
        {"user_id": user["user_id"], "week_number": 0, "values": {}, "days": {}, "updated_at": "2026-01-05T10:00:00+00:00"}
    ))
    me = auth.get("/api/board").json()["users"][0]
    assert me["updated_at"] is None  # aktuelle Woche: nichts (Konflikt-Erkennung)
    assert me["last_active_at"] == "2026-01-05T10:00:00+00:00"
