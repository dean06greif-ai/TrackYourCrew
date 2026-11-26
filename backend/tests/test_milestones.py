"""Meilensteine (Plan 1e): Server merkt sich, wann ein Meilenstein zuerst erreicht
wurde; erstes Melden ist still; Board liefert sie mit; "gesehen" je Betrachter."""
from conftest import befriend, patch_everywhere


def report(client, ids, headers=None):
    return client.post("/api/me/milestones", json={"ids": ids}, headers=headers)


def my_entry(auth):
    return auth.get("/api/board").json()["users"][0]


def test_first_report_is_silent_then_new_ones_are_loud(auth):
    r = report(auth, ["lauf:marathon", "lauf:half"]).json()
    assert r == {"new": ["lauf:marathon", "lauf:half"], "silent": True}
    r = report(auth, ["lauf:marathon", "lauf:half", "lauf:ultra"]).json()
    assert r == {"new": ["lauf:ultra"], "silent": False}
    ms = {m["id"]: m for m in my_entry(auth)["milestones"]}
    assert ms["lauf:marathon"]["silent"] is True
    assert ms["lauf:ultra"]["silent"] is False
    assert ms["lauf:ultra"]["at"]


def test_first_empty_report_initialises(auth):
    assert report(auth, []).json() == {"new": [], "silent": True}
    assert report(auth, ["liege:n1000"]).json() == {"new": ["liege:n1000"], "silent": False}


def test_reached_milestones_never_come_twice(auth):
    report(auth, [])
    report(auth, ["rad:k100"])
    assert report(auth, ["rad:k100"]).json()["new"] == []
    # Auch wenn der Wert später sinkt (Meilenstein nicht mehr gemeldet), bleibt er.
    report(auth, [])
    assert [m["id"] for m in my_entry(auth)["milestones"]] == ["rad:k100"]


def test_invalid_ids_are_rejected(auth):
    assert report(auth, ["lauf:21.1"]).status_code == 422  # Punkt wäre ein Mongo-Pfad
    assert report(auth, ["$set"]).status_code == 422
    assert report(auth, ["x" * 49]).status_code == 422
    assert report(auth, [f"a{i}" for i in range(101)]).status_code == 422


def test_friends_see_milestones_and_get_live_event(auth, client, user, make_user, db):
    bob = make_user("Bob", handle="BOB22")
    befriend(db, bob, user)
    sent = []

    async def fake_notify(uid, msg):
        sent.append((uid, msg))

    import pytest
    with pytest.MonkeyPatch.context() as mp:
        patch_everywhere(mp, "_notify", fake_notify)
        report(auth, [])
        report(auth, ["lauf:marathon"])
    assert sent == [(user["user_id"], {"type": "milestone_reached", "user_id": user["user_id"], "ids": ["lauf:marathon"]})]
    entries = client.get("/api/board", headers=bob["headers"]).json()["users"]
    alice = next(e for e in entries if e["user_id"] == user["user_id"])
    assert [m["id"] for m in alice["milestones"]] == ["lauf:marathon"]


def test_seen_effect_for_milestone(auth, user):
    body = {"target_user_id": user["user_id"], "type": "milestone", "effect_id": "lauf:marathon"}
    assert auth.post("/api/me/seen-effects", json=body).status_code == 200
    assert auth.post("/api/me/seen-effects", json=body).status_code == 200  # idempotent
    items = auth.get("/api/me/seen-effects").json()["items"]
    assert [i for i in items if i["type"] == "milestone"] == [
        {"target_user_id": user["user_id"], "week_number": 0, "type": "milestone", "effect_id": "lauf:marathon"}]
    assert auth.post("/api/me/seen-effects", json={**body, "effect_id": None}).status_code == 400
    assert auth.post("/api/me/seen-effects", json={**body, "effect_id": "bad id"}).status_code == 422


def test_old_seen_effects_still_work(auth, user):
    body = {"target_user_id": user["user_id"], "week_number": 3, "type": "celebration"}
    assert auth.post("/api/me/seen-effects", json=body).status_code == 200


def test_report_for_other_account_is_rejected(auth, user):
    """Zweiter Tab mit anderem Konto: Meldung für den falschen Nutzer wird abgelehnt."""
    r = auth.post("/api/me/milestones", json={"ids": ["lauf:run10"], "for_user": "user_someone_else"})
    assert r.status_code == 409
    assert auth.post("/api/me/milestones", json={"ids": [], "for_user": user["user_id"]}).status_code == 200
