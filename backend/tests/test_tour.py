"""Geführte Tour (Plan 4a): Fortschritt am Konto, Start nach dem Einführungs-Dialog."""


def me(client, headers=None):
    return client.get("/api/auth/me", headers=headers).json()


def test_existing_users_have_no_tour(auth):
    assert me(auth).get("tour_step") is None


def test_onboarding_starts_tour(auth, db):
    from conftest import run
    run(db.users.update_one({"user_id": me(auth)["user_id"]}, {"$set": {"onboarding_done": False}}))
    assert auth.post("/api/me/onboarding", json={"start": "now"}).status_code == 200
    data = me(auth)
    assert data["onboarding_done"] is True
    assert data["tour_step"] == 0


def test_tour_step_saved_and_validated(auth):
    assert auth.put("/api/me/tour", json={"step": 3}).json() == {"tour_step": 3}
    assert me(auth)["tour_step"] == 3
    assert auth.put("/api/me/tour", json={"step": -1}).status_code == 200
    assert me(auth)["tour_step"] == -1
    assert auth.put("/api/me/tour", json={"step": -2}).status_code == 422
    assert auth.put("/api/me/tour", json={"step": 21}).status_code == 422


def test_tour_needs_login(client):
    assert client.put("/api/me/tour", json={"step": 0}).status_code == 401
