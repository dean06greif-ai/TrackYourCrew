"""Feedback an den Betreiber (gespeichert + optional Telegram) und Wecker-Endpunkte."""
from conftest import run, patch_everywhere



def test_feedback_is_stored_and_sent(auth, user, db, monkeypatch):
    sent = []

    async def fake_send(text):
        sent.append(text)
        return True

    patch_everywhere(monkeypatch, "_send_telegram", fake_send)
    r = auth.post("/api/feedback", json={"category": "bug", "message": "Button kaputt", "page": "/settings"})
    assert r.status_code == 200
    doc = run(db.feedback.find_one({"user_id": user["user_id"]}))
    assert doc["message"] == "Button kaputt" and doc["category"] == "bug"
    assert doc["telegram_sent"] is True
    assert "Button kaputt" in sent[0] and "#ALPHA" in sent[0]


def test_feedback_without_telegram_still_saved(auth, user, db, monkeypatch):
    patch_everywhere(monkeypatch, "TELEGRAM_BOT_TOKEN", "")
    assert auth.post("/api/feedback", json={"message": "Idee: Dark mode"}).status_code == 200
    doc = run(db.feedback.find_one({"user_id": user["user_id"]}))
    assert doc["category"] == "other" and doc["telegram_sent"] is False


def test_feedback_validation_and_rate_limit(auth, client):
    anon = {"Authorization": "Bearer ungueltig"}
    assert client.post("/api/feedback", json={"message": "hallo"}, headers=anon).status_code == 401
    assert auth.post("/api/feedback", json={"message": "x"}).status_code == 400
    for _ in range(5):
        assert auth.post("/api/feedback", json={"message": "noch was"}).status_code == 200
    assert auth.post("/api/feedback", json={"message": "zu viel"}).status_code == 429


def test_wakeup_endpoints_answer_200(client):
    assert client.get("/").status_code == 200
    assert client.head("/").status_code == 200
    assert client.head("/api/health").status_code == 200


# -------------------- Sprache --------------------
def test_errors_are_translated(auth):
    r = auth.post("/api/goals/me/exercises/nope/status", json={"action": "pause"},
                  headers={"Accept-Language": "en-US,en;q=0.9"})
    assert r.json()["detail"] == "Exercise not found"
    r = auth.post("/api/goals/me/exercises/nope/status", json={"action": "pause"},
                  headers={"Accept-Language": "de-DE"})
    assert r.json()["detail"] == "Übung nicht gefunden"


def test_set_language_renames_untouched_defaults(auth):
    g = auth.get("/api/goals/me").json()
    body = {"exercises": [{k: e[k] for k in ("key", "name", "unit", "icon", "base_value", "progression_pct")}
                          for e in g["exercises"]]}
    body["exercises"][1]["name"] = "Meine Liegestütze"
    auth.put("/api/goals/me", json=body)
    assert auth.put("/api/me/language", json={"language": "en"}).json() == {"language": "en"}
    names = [e["name"] for e in auth.get("/api/goals/me").json()["exercises"]]
    assert names == ["Running", "Meine Liegestütze", "Pull-ups"]
    assert auth.get("/api/auth/me").json()["language"] == "en"
    assert auth.put("/api/me/language", json={"language": "xx"}).status_code == 400


def test_new_google_user_gets_language_and_localized_defaults(db):
    import server as srv
    uid, _ = run(srv._upsert_google_user("neu@example.com", "Neu", None, "es"))
    user = run(db.users.find_one({"user_id": uid}))
    goals = run(db.user_goals.find_one({"user_id": uid}))
    assert user["language"] == "es"
    assert [e["name"] for e in goals["exercises"]] == ["Correr", "Flexiones", "Dominadas"]
