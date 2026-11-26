"""Smoke-Tests: decken die wichtigsten Wege durch die API ab.

Ziel ist nicht Vollständigkeit, sondern ein schnelles Netz, das nach jeder
Änderung an server.py zeigt, ob etwas Grundlegendes kaputt ist.
"""


# -------------------- Basis --------------------
def test_root_and_health(client):
    assert client.get("/api/").json() == {"message": "TrackYourCrew API"}
    assert client.get("/api/health").json() == {"ok": True}


# -------------------- Auth --------------------
class TestAuth:
    def test_protected_routes_need_login(self, client):
        for path in ["/api/auth/me", "/api/goals/me", "/api/progress/me",
                     "/api/board", "/api/friends", "/api/insights/me"]:
            assert client.get(path).status_code == 401, path

    def test_invalid_token_rejected(self, client):
        r = client.get("/api/auth/me", headers={"Authorization": "Bearer gibt-es-nicht"})
        assert r.status_code == 401

    def test_me_with_bearer(self, auth, user):
        data = auth.get("/api/auth/me").json()
        assert data["user_id"] == user["user_id"]
        assert data["handle"] == "ALPHA"
        assert "_id" not in data

    def test_me_with_cookie(self, client, user):
        client.cookies.set("session_token", user["token"])
        assert client.get("/api/auth/me").status_code == 200

    def test_expired_session_rejected(self, client, make_user):
        old = make_user("Abgelaufen", session_days=-1)
        assert client.get("/api/auth/me", headers=old["headers"]).status_code == 401

    def test_logout_invalidates_session(self, auth):
        assert auth.post("/api/auth/logout").json() == {"ok": True}
        assert auth.get("/api/auth/me").status_code == 401

    def test_session_endpoint_requires_credential(self, client):
        assert client.post("/api/auth/session", json={}).status_code == 400

    def test_google_login_redirects_to_google(self, client):
        r = client.get("/api/auth/google/login", follow_redirects=False)
        assert r.status_code == 302
        assert r.headers["location"].startswith("https://accounts.google.com/")

    def test_google_callback_rejects_unknown_state(self, client):
        r = client.get("/api/auth/google/callback?code=x&state=unbekannt", follow_redirects=False)
        assert r.status_code == 302
        assert "auth_error=invalid_state" in r.headers["location"]


# -------------------- Ziele & Fortschritt --------------------
class TestGoalsAndProgress:
    def test_default_goals(self, auth):
        g = auth.get("/api/goals/me").json()
        assert [e["name"] for e in g["exercises"]] == ["Lauf", "Liegestütze", "Klimmzüge"]
        assert g["current_week"] == 1
        assert set(g["state"].keys()) == {"ex1", "ex2", "ex3"}

    def test_progress_roundtrip_with_days(self, auth):
        payload = {"week_number": 1, "days": {"0": {"ex1": 3, "ex2": 100}, "2": {"ex1": 2.5}}}
        saved = auth.put("/api/progress/me", json=payload).json()
        assert saved["values"] == {"ex1": 5.5, "ex2": 100}
        again = auth.get("/api/progress/me?week=1").json()
        assert again["values"] == {"ex1": 5.5, "ex2": 100}
        assert again["days"]["2"] == {"ex1": 2.5}

    def test_progress_is_per_user(self, auth, client, make_user):
        auth.put("/api/progress/me", json={"week_number": 1, "values": {"ex1": 9}})
        other = make_user("Bob", handle="BOB22")
        r = client.get("/api/progress/me?week=1", headers=other["headers"]).json()
        assert r["values"]["ex1"] == 0


# -------------------- Crew / Board --------------------
class TestCrew:
    def test_board_contains_only_me_without_friends(self, auth, user, make_user):
        make_user("Fremder", handle="FRMD1")
        users = auth.get("/api/board").json()["users"]
        assert [u["user_id"] for u in users] == [user["user_id"]]

    def test_add_friend_needs_matching_name_and_handle(self, auth, make_user):
        make_user("Bob", handle="BOB22")
        assert auth.post("/api/friends/add", json={"name": "Falsch", "handle": "BOB22"}).status_code == 404
        assert auth.post("/api/friends/add", json={"name": "Bob", "handle": "XXXXX"}).status_code == 404
        assert auth.post("/api/friends/add", json={"name": "bob", "handle": "#bob22"}).status_code == 200

    def test_friend_shows_up_on_board_and_can_be_removed(self, auth, user, make_user):
        bob = make_user("Bob", handle="BOB22")
        auth.post("/api/friends/add", json={"name": "Bob", "handle": "BOB22"})
        # Seit Plan 4b eine Anfrage: erst nach Bobs Zustimmung ist er auf dem Board.
        assert [u["user_id"] for u in auth.get("/api/board").json()["users"]] == [user["user_id"]]
        auth.post(f"/api/friends/requests/{user['user_id']}/accept", json={}, headers=bob["headers"])
        ids = [u["user_id"] for u in auth.get("/api/board").json()["users"]]
        assert ids == [user["user_id"], bob["user_id"]]
        assert [f["handle"] for f in auth.get("/api/friends").json()["friends"]] == ["BOB22"]

        auth.delete(f"/api/friends/{bob['user_id']}")
        assert auth.get("/api/friends").json() == {"friends": []}

    def test_cannot_add_self_or_twice(self, auth, make_user):
        assert auth.post("/api/friends/add", json={"name": "Test User Alpha", "handle": "ALPHA"}).status_code == 400
        make_user("Bob", handle="BOB22")
        auth.post("/api/friends/add", json={"name": "Bob", "handle": "BOB22"})
        assert auth.post("/api/friends/add", json={"name": "Bob", "handle": "BOB22"}).status_code == 400


# -------------------- WebSocket --------------------
class TestWebSocket:
    def test_presence_snapshot_and_progress_broadcast(self, auth, user):
        with auth.websocket_connect(f"/api/ws?token={user['token']}") as ws:
            snap = ws.receive_json()
            assert snap["type"] == "presence_snapshot"
            assert ws.receive_json()["type"] == "presence_changed"
            auth.put("/api/progress/me", json={"week_number": 1, "values": {"ex1": 4}})
            msg = ws.receive_json()
            assert msg["type"] == "progress_updated"
            assert msg["user_id"] == user["user_id"]


# -------------------- Sicherheit (BACKLOG S3, S4, B1 – behoben 2026-11-24) --------------------
# Neue bekannte Fehler wieder als IST-Zustand in einer Klasse TestKnownIssues festhalten.
class TestSecurity:
    def test_board_hides_friend_email(self, auth, user, make_user, db):
        """S3: Freunde sehen keine E-Mail-Adresse, nur der eigene Eintrag hat sie."""
        from conftest import befriend
        befriend(db, user, make_user("Bob", handle="BOB22"))
        me, bob = auth.get("/api/board").json()["users"]
        assert me["email"] == user["email"]
        assert bob["email"] is None

    def test_websocket_rejects_anonymous(self, client):
        """S4: ohne gültige Session keine Live-Verbindung."""
        import pytest
        from starlette.websockets import WebSocketDisconnect
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect("/api/ws") as ws:
                ws.receive_json()
        assert exc.value.code == 4401

    def test_events_only_reach_the_crew(self, auth, client, user, make_user, db):
        """S4: Fortschritt eines Fremden kommt nicht bei mir an, der eines Freundes schon."""
        friend = make_user("Bob", handle="BOB22")
        stranger = make_user("Eve", handle="EVE22")
        from conftest import befriend
        befriend(db, user, friend)
        with auth.websocket_connect(f"/api/ws?token={user['token']}") as ws:
            ws.receive_json()  # snapshot
            ws.receive_json()  # presence
            client.put("/api/progress/me", json={"week_number": 1, "values": {"ex1": 1}}, headers=stranger["headers"])
            client.put("/api/progress/me", json={"week_number": 1, "values": {"ex1": 2}}, headers=friend["headers"])
            msg = ws.receive_json()
            assert msg["type"] == "progress_updated"
            assert msg["user_id"] == friend["user_id"]

    def test_board_read_does_not_write(self, auth, user, db):
        """B1: Board ansehen verändert keine Daten mehr."""
        from conftest import run
        before = run(db.user_goals.find_one({"user_id": user["user_id"]}, {"_id": 0}))
        auth.get("/api/board")
        auth.get("/api/board?week=1")
        after = run(db.user_goals.find_one({"user_id": user["user_id"]}, {"_id": 0}))
        assert before == after
