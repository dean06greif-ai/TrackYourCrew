"""Freundschaftsanfragen und Einladungslink (Plan 4b, Entscheidungen 2026-11-24):
Hinzufügen per Name + Code = Anfrage; annehmen, annehmen & zurück hinzufügen,
ablehnen; Einladungslink = sofort gegenseitig; Einstellung "Anfragen empfangen"."""
import pytest

from conftest import befriend


def board_ids(client, u):
    return [e["user_id"] for e in client.get("/api/board", headers=u["headers"]).json()["users"]]


@pytest.fixture
def bob(make_user):
    return make_user("Bob", handle="BOB22")


def ask(client, frm, to):
    return client.post("/api/friends/add", json={"name": to["name"], "handle": to["handle"]}, headers=frm["headers"])


def requests_of(client, u):
    return client.get("/api/friends/requests", headers=u["headers"]).json()


def test_add_creates_request_not_friendship(client, user, bob):
    r = ask(client, user, bob).json()
    assert r["status"] == "requested" and r["friend"]["handle"] == "BOB22"
    assert board_ids(client, user) == [user["user_id"]]
    assert [x["user_id"] for x in requests_of(client, bob)["incoming"]] == [user["user_id"]]
    assert [x["user_id"] for x in requests_of(client, user)["outgoing"]] == [bob["user_id"]]
    assert ask(client, user, bob).status_code == 400  # schon gesendet


def test_accept_only(client, user, bob):
    ask(client, user, bob)
    assert client.post(f"/api/friends/requests/{user['user_id']}/accept", json={}, headers=bob["headers"]).status_code == 200
    assert board_ids(client, user) == [user["user_id"], bob["user_id"]]
    assert board_ids(client, bob) == [bob["user_id"]]  # nur angenommen, nicht zurück hinzugefügt
    assert requests_of(client, bob)["incoming"] == []


def test_accept_and_add_back(client, user, bob):
    ask(client, user, bob)
    client.post(f"/api/friends/requests/{user['user_id']}/accept", json={"add_back": True}, headers=bob["headers"])
    assert board_ids(client, user) == [user["user_id"], bob["user_id"]]
    assert board_ids(client, bob) == [bob["user_id"], user["user_id"]]


def test_decline(client, user, bob):
    ask(client, user, bob)
    client.post(f"/api/friends/requests/{user['user_id']}/decline", headers=bob["headers"])
    assert requests_of(client, bob)["incoming"] == []
    assert board_ids(client, user) == [user["user_id"]]
    # Angenommen werden kann eine abgelehnte Anfrage nicht mehr.
    r = client.post(f"/api/friends/requests/{user['user_id']}/accept", json={}, headers=bob["headers"])
    assert r.status_code == 404


def test_crossing_requests_connect_both(client, user, bob):
    ask(client, user, bob)
    r = ask(client, bob, user).json()
    assert r["status"] == "connected"
    assert board_ids(client, user) == [user["user_id"], bob["user_id"]]
    assert board_ids(client, bob) == [bob["user_id"], user["user_id"]]
    assert requests_of(client, user)["incoming"] == [] and requests_of(client, bob)["incoming"] == []


def invite_code(client, who):
    return client.get("/api/me/invite", headers=who["headers"]).json()["code"]


def test_requests_can_be_switched_off_but_invite_link_works(client, user, bob):
    client.put("/api/me/friend-requests-setting", json={"accept": False}, headers=bob["headers"])
    assert client.get("/api/me/friend-requests-setting", headers=bob["headers"]).json() == {"accept": False}
    assert ask(client, user, bob).status_code == 403
    r = client.post("/api/friends/join", json={"handle": invite_code(client, bob)}, headers=user["headers"])
    assert r.status_code == 200
    assert board_ids(client, user) == [user["user_id"], bob["user_id"]]
    assert board_ids(client, bob) == [bob["user_id"], user["user_id"]]


def test_join_validations_and_idempotent(client, user, bob):
    assert client.post("/api/friends/join", json={"handle": "XXXXXXXXXX"}, headers=user["headers"]).status_code == 404
    assert client.post("/api/friends/join", json={"handle": "BOB22"}, headers=user["headers"]).status_code == 404  # alter 5er-Link gilt nicht mehr
    assert client.post("/api/friends/join", json={"handle": invite_code(client, user)}, headers=user["headers"]).status_code == 400
    code = invite_code(client, bob)
    assert invite_code(client, bob) == code  # gleicher Link, solange er gilt
    client.post("/api/friends/join", json={"handle": code}, headers=user["headers"])
    client.post("/api/friends/join", json={"handle": code}, headers=user["headers"])
    friends = client.get("/api/friends", headers=user["headers"]).json()["friends"]
    assert [f["handle"] for f in friends] == ["BOB22"]


def test_join_clears_pending_request(client, user, bob):
    ask(client, user, bob)
    client.post("/api/friends/join", json={"handle": invite_code(client, user)}, headers=bob["headers"])
    assert requests_of(client, bob)["incoming"] == []
    assert requests_of(client, user)["outgoing"] == []


def test_existing_one_sided_friendships_stay(client, user, bob, db):
    befriend(db, user, bob)
    assert board_ids(client, user) == [user["user_id"], bob["user_id"]]
    assert ask(client, user, bob).status_code == 400  # schon in der Crew


def test_request_event_goes_only_to_target(client, user, bob):
    with client.websocket_connect(f"/api/ws?token={bob['token']}") as ws:
        ws.receive_json()  # snapshot
        ws.receive_json()  # presence
        ask(client, user, bob)
        msg = ws.receive_json()
        assert msg == {"type": "friend_request", "user_id": user["user_id"]}


def test_invite_link_expires_after_a_week(client, user, bob, db):
    """Einladungslinks gelten 7 Tage (Dean 2026-11-27); danach gibt es einen neuen Code."""
    from datetime import datetime, timedelta, timezone
    from conftest import run
    code = invite_code(client, bob)
    old = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    run(db.users.update_one({"user_id": bob["user_id"]}, {"$set": {"invite.created_at": old}}))
    r = client.post("/api/friends/join", json={"handle": code}, headers=user["headers"])
    assert r.status_code == 410
    new = invite_code(client, bob)
    assert new != code and len(new) == 10
    assert client.post("/api/friends/join", json={"handle": new}, headers=user["headers"]).status_code == 200
