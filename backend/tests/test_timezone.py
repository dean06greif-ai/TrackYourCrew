"""Wochenende nach Ortszeit (Dean 2026-11-27): die Woche endet Sonntag 24:00 dort, wo der Nutzer ist."""
from datetime import datetime, timezone, timedelta

import goals


class _Fixed(datetime):
    """datetime.now() fest auf Montag 00:30 Berlin = Sonntag 23:30 UTC."""
    NOW_UTC = datetime(2026, 11, 29, 23, 30, tzinfo=timezone.utc)  # So 23:30 UTC

    @classmethod
    def now(cls, tz=None):
        return cls.NOW_UTC.astimezone(tz) if tz else cls.NOW_UTC.replace(tzinfo=None)


def test_woche_wechselt_um_mitternacht_ortszeit(monkeypatch):
    monkeypatch.setattr(goals, "datetime", _Fixed)
    start = datetime(2026, 11, 23, 9, 0, tzinfo=timezone.utc)  # Montag der Startwoche
    assert goals._calc_week_number(start) == 1                    # UTC: noch Sonntag
    assert goals._calc_week_number(start, "Europe/Berlin") == 2   # Berlin: schon Montag
    assert goals._calc_week_number(start, "America/New_York") == 1
    assert goals._calc_week_number(start, "Quatsch/Zone") == 1    # ungültig -> UTC


def test_zeitzone_vom_geraet_wird_gemerkt(auth, db):
    from conftest import run
    auth.get("/api/goals/me", headers={"X-Timezone": "Europe/Berlin"})
    me = auth.get("/api/auth/me").json()
    u = run(db.users.find_one({"user_id": me["user_id"]}))
    g = run(db.user_goals.find_one({"user_id": me["user_id"]}))
    assert u["tz"] == "Europe/Berlin" and g["tz"] == "Europe/Berlin"
    auth.get("/api/goals/me", headers={"X-Timezone": "Nicht/Echt"})
    assert run(db.users.find_one({"user_id": me["user_id"]}))["tz"] == "Europe/Berlin"
