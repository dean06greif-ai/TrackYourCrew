"""Nutzungsstatistik + Telegram-Wochenbericht (Dean 2026-11-27)."""
from datetime import datetime, timezone

from conftest import patch_everywhere, run
import usage


def test_usage_zaehlt_nur_erlaubte_namen(auth, db):
    r = auth.post("/api/usage", json={"events": {"log_saved": 2, "hacker": 99, "voice_used": -1}, "pages": {"dashboard": 30.5, "evil": 5}})
    assert r.status_code == 200
    docs = run(db.usage.find({}, {"_id": 0}).to_list(10))
    assert len(docs) == 1
    assert docs[0]["events"] == {"log_saved": 2}
    assert docs[0]["pages"] == {"dashboard": 30.5}
    auth.post("/api/usage", json={"events": {"log_saved": 1}})
    assert run(db.usage.find_one({}))["events"]["log_saved"] == 3


def test_usage_braucht_login(client):
    assert client.post("/api/usage", json={"events": {"log_saved": 1}}).status_code == 401


def test_wochenbericht_einmal_pro_woche(auth, db, monkeypatch):
    sent = []

    async def fake_send(text):
        sent.append(text)
        return True
    patch_everywhere(monkeypatch, "_send_telegram", fake_send)
    # Nutzung in der Vorwoche (eigene Woche, damit andere Tests nicht mitzählen)
    run(db.usage.insert_one({"week": "2026-W40", "user_id": "u1", "events": {"log_saved": 5, "workout_started": 1}, "pages": {"dashboard": 600}}))
    now = datetime(2026, 10, 4, 22, 5, tzinfo=timezone.utc)  # Mo 5.10. 00:05 Berlin -> Vorwoche W40
    assert run(usage.run_weekly_report(now)) is True
    assert run(usage.run_weekly_report(now)) is False  # nicht doppelt
    assert len(sent) == 1
    txt = sent[0]
    assert "2026-W40" in txt and "Fortschritt gespeichert: 5 · 1" in txt and "Nicht benutzt" in txt
    assert "Dashboard: 10 min" in txt
