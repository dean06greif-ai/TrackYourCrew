"""Formverlust nach Pausen (Dean, 2026-11-25): bis 2 Wochen nichts, dann 95/90/85/80 %."""
from datetime import datetime, timedelta, timezone

import pytest

import server
from conftest import run


def _ex(pauses=None):
    return {"key": "ex2", "name": "Liegestütze", "unit": "", "base_value": 100.0, "added_week": 1,
            "progression_pct": 0, "progression_overrides": [{"from_week": 1, "pct": 0}],
            "pauses": pauses or []}


def _goals(ex, cur, pause_loss_from=1, done_weeks=()):
    pbw = {w: {"ex2": 1000.0} for w in done_weeks}
    st = server._compute_progression(ex, set(), pbw, cur, pause_loss_from_week=pause_loss_from)
    return {p["week"]: p for p in st["progression"]}


class TestPauseLossCurve:
    @pytest.mark.parametrize("weeks,factor", [(1, 1.0), (2, 1.0), (3, 0.95), (4, 0.90), (5, 0.85), (6, 0.85),
                                              (7, 0.80), (20, 0.80)])
    def test_kurve(self, weeks, factor):
        assert server._pause_loss_factor(weeks) == factor

    def test_zwei_wochen_pause_kein_verlust(self):
        p = _goals(_ex([{"from_week": 2, "to_week": 4}]), cur=5, done_weeks=[1])
        assert p[4]["goal"] == 100 and "after_pause" not in p[4]

    def test_vier_wochen_pause_zehn_prozent(self):
        p = _goals(_ex([{"from_week": 2, "to_week": 6}]), cur=7, done_weeks=[1])
        assert p[6]["goal"] == 90
        assert p[6]["after_pause"] == {"weeks": 4, "factor": 0.9}
        assert p[7]["goal"] == 90  # bleibt danach (0 % Steigerung im Test)

    def test_nur_pausenwochen_ab_update_zaehlen(self):
        # Pause Woche 2–5 (4 Wochen), Formverlust erst ab Woche 4 -> nur 2 Wochen zählen -> kein Verlust
        p = _goals(_ex([{"from_week": 2, "to_week": 6}]), cur=7, pause_loss_from=4, done_weeks=[1])
        assert p[6]["goal"] == 100

    def test_manuelles_ziel_nach_pause_gilt_unveraendert(self):
        ex = _ex([{"from_week": 2, "to_week": 6}])
        ex["goal_overrides"] = [{"from_week": 6, "value": 120}]
        p = _goals(ex, cur=7, done_weeks=[1])
        assert p[6]["goal"] == 120


class TestPauseLossRollout:
    def test_bestandsnutzer_bekommt_update_woche(self, client, make_user, db):
        u = make_user("Alt", handle="ALTP1")
        start = (datetime.now(timezone.utc) - timedelta(weeks=5)).isoformat()
        run(db.user_goals.update_one({"user_id": u["user_id"]}, {"$set": {"start_date": start},
                                                                "$unset": {"pause_loss_from_week": ""}}))
        client.get("/api/goals/me", headers=u["headers"])
        g = run(db.user_goals.find_one({"user_id": u["user_id"]}))
        assert g["pause_loss_from_week"] == 6

    def test_neuer_nutzer_ab_woche_eins(self, client, make_user, db):
        u = make_user("Neu", handle="NEUP1", with_goals=False)
        client.get("/api/goals/me", headers=u["headers"])
        g = run(db.user_goals.find_one({"user_id": u["user_id"]}))
        assert g["pause_loss_from_week"] == 1
