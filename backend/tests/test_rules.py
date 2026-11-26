"""Spielregeln exakt nachgerechnet (BACKLOG W6): Steigerung, Rundung, Einfrieren bei verfehlter
Woche (inkl. 0,5 % Toleranz), Abzug nach 4 Wochen, Boost (v1/v2, verfällt bei verfehlter Woche),
manuelles Ziel, geänderte Steigerung, Streak und Wochenzählung (montags).

Die Rechenfunktionen werden direkt aufgerufen – so ist jede Zahl nachvollziehbar."""
from datetime import datetime, timedelta, timezone

import pytest

import board
import goals
from goals import _calc_week_number, _compute_progression, _round_goal


def ex(base=100, pct=10, unit="", key="a", **extra):
    return {"key": key, "name": "Test", "unit": unit, "base_value": base, "progression_pct": pct, "added_week": 1, **extra}


def run(exercise, current_week, logged=None, boosts=None, versions=None):
    """logged: {woche: wert}; None = jede vergangene Woche genau geschafft."""
    pbw = {}
    if logged is None:
        # erst ohne Einträge rechnen, dann jede Woche mit genau dem Ziel füllen
        probe = _compute_progression(exercise, set(boosts or []), {}, 1, future_weeks=current_week,
                                     boost_versions=versions or {})
        for p in probe["progression"]:
            pbw[p["week"]] = {exercise["key"]: p["goal"]}
    else:
        pbw = {w: {exercise["key"]: v} for w, v in logged.items()}
    return _compute_progression(exercise, set(boosts or []), pbw, current_week, future_weeks=0,
                                boost_versions=versions or {})


def goals_of(res):
    return [p["goal"] for p in res["progression"]]


class TestSteigerung:
    def test_jede_woche_plus_prozent(self):
        res = run(ex(100, 10), 4)
        assert goals_of(res) == [100, 110, 121, 133]  # 133,1 -> 133

    def test_null_prozent_bleibt_gleich(self):
        assert goals_of(run(ex(50, 0), 3)) == [50, 50, 50]

    def test_geaenderte_steigerung_gilt_ab_ihrer_woche(self):
        e = ex(100, 10, progression_overrides=[{"from_week": 3, "pct": 0}])
        assert goals_of(run(e, 4)) == [100, 110, 110, 110]


class TestRundung:
    @pytest.mark.parametrize("value,unit,expected", [
        (5.25, "km", 5.3), (5.24, "km", 5.2), (5.5125, "km", 5.5),
        (132.5, "", 133.0), (132.49, "", 132.0), (270.4, "Sek.", 270.0),
    ])
    def test_km_auf_zehntel_sonst_ganz(self, value, unit, expected):
        assert _round_goal(value, unit) == expected

    def test_km_progression(self):
        assert goals_of(run(ex(5, 5, unit="km"), 3)) == [5.0, 5.3, 5.5]


class TestVerfehlt:
    def test_verfehlte_woche_friert_ziel_ein(self):
        res = run(ex(100, 10), 4, logged={1: 100, 2: 50, 3: 110})
        assert goals_of(res) == [100, 110, 110, 121]
        assert res["missed_weeks"] == [2]

    def test_toleranz_halbes_prozent(self):
        # Ziel 110: 0,5 % = 0,55 -> 109,5 zählt noch als geschafft, 109,4 nicht
        ok = run(ex(100, 10), 3, logged={1: 100, 2: 109.5})
        assert ok["missed_weeks"] == []
        nope = run(ex(100, 10), 3, logged={1: 100, 2: 109.4})
        assert nope["missed_weeks"] == [2]

    def test_abzug_nach_vier_verfehlten_wochen(self):
        res = run(ex(100, 10), 6, logged={1: 0, 2: 0, 3: 0, 4: 0, 5: 90})
        # Woche 1–4 verfehlt (Ziel eingefroren bei 100), ab Woche 5: × 0,9 und keine Steigerung
        assert goals_of(res)[:5] == [100, 100, 100, 100, 90]
        assert goals_of(res)[5] == 99  # Woche 5 geschafft -> wieder +10 %


class TestBoost:
    def test_v2_ersetzt_steigerung_der_woche(self):
        res = run(ex(100, 10), 5, boosts=[3], versions={3: 2})
        assert goals_of(res) == [100, 110, 138, 151, 166]  # 110·1,25=137,5 ; 110·1,1·1,25=151,25
        assert res["effective_boost_weeks"] == [3]

    def test_v1_altdaten_kommt_obendrauf(self):
        res = run(ex(100, 10), 3, boosts=[3], versions={3: 1})
        assert goals_of(res) == [100, 110, 151]  # 121·1,25 = 151,25

    def test_verfehlte_boost_woche_verfaellt(self):
        res = run(ex(100, 10), 5, logged={1: 100, 2: 110, 3: 0, 4: 110}, boosts=[3], versions={3: 2})
        cell = res["progression"][2]
        assert cell["boost"] and cell["voided_boost"]
        assert res["effective_boost_weeks"] == []
        assert goals_of(res)[3] == 110  # Woche 4: kein Boost mehr, eingefroren


class TestManuellesZiel:
    def test_gilt_ab_seiner_woche_vergangenheit_bleibt(self):
        e = ex(100, 10, goal_overrides=[{"from_week": 3, "value": 200}])
        assert goals_of(run(e, 4)) == [100, 110, 200, 220]

    def test_ersetzt_frueheren_boost(self):
        e = ex(100, 10, goal_overrides=[{"from_week": 4, "value": 150}])
        res = run(e, 5, boosts=[3], versions={3: 2})
        assert goals_of(res)[3:] == [150, 165]
        assert res["effective_boost_weeks"] == []


def streak(exercises, current_week, logged):
    """logged: {woche: {key: wert}}"""
    state = {e["key"]: _compute_progression(e, set(), logged, current_week, future_weeks=0) for e in exercises}
    return board._streak_info(state, exercises, logged, current_week)


class TestStreak:
    def test_laufende_woche_zaehlt_erst_wenn_geschafft(self):
        a = ex(10, 0, key="a")
        s = streak([a], 4, {1: {"a": 10}, 2: {"a": 10}, 3: {"a": 10}})
        assert (s["current"], s["best"]) == (3, 3)
        s = streak([a], 4, {1: {"a": 10}, 2: {"a": 10}, 3: {"a": 10}, 4: {"a": 10}})
        assert s["current"] == 4

    def test_verfehlte_woche_unterbricht(self):
        a = ex(10, 0, key="a")
        s = streak([a], 5, {1: {"a": 10}, 2: {"a": 10}, 3: {"a": 3}, 4: {"a": 10}})
        assert (s["current"], s["best"]) == (1, 2)

    def test_alle_aktiven_uebungen_muessen_geschafft_sein(self):
        a, b = ex(10, 0, key="a"), ex(5, 0, key="b")
        s = streak([a, b], 3, {1: {"a": 10, "b": 5}, 2: {"a": 10, "b": 1}})
        assert s["completed_weeks"] == [1]
        assert s["current"] == 0


class FakeNow(datetime):
    fixed = None

    @classmethod
    def now(cls, tz=None):
        return cls.fixed


class TestWochenzaehlung:
    START = datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)  # ein Montag

    @pytest.mark.parametrize("now,week", [
        (datetime(2026, 11, 2, 0, 1, tzinfo=timezone.utc), 1),    # Montag Start
        (datetime(2026, 11, 8, 23, 0, tzinfo=timezone.utc), 1),   # Sonntag gehört noch dazu
        (datetime(2026, 11, 9, 0, 1, tzinfo=timezone.utc), 2),    # neuer Montag
        (datetime(2026, 11, 30, 12, 0, tzinfo=timezone.utc), 5),
    ])
    def test_woche_beginnt_montags(self, monkeypatch, now, week):
        FakeNow.fixed = now
        monkeypatch.setattr(goals, "datetime", FakeNow)
        assert _calc_week_number(self.START) == week

    def test_start_mitten_in_der_woche_zaehlt_ab_deren_montag(self, monkeypatch):
        FakeNow.fixed = datetime(2026, 11, 9, 10, 0, tzinfo=timezone.utc)
        monkeypatch.setattr(goals, "datetime", FakeNow)
        assert _calc_week_number(self.START + timedelta(days=3)) == 2  # Start Donnerstag


class TestBoostSchnittstelle:
    def test_einmal_pro_woche_und_zuruecknehmen(self, auth):
        g = auth.get("/api/goals/me").json()
        key = g["exercises"][0]["key"]
        before = g["state"][key]["current_goal"]
        r = auth.post("/api/boost", json={"exercise_key": key})
        assert r.status_code == 200, r.text
        boosted = auth.get("/api/goals/me").json()["state"][key]["current_goal"]
        # neuer Nutzer = Woche 1 (ohne Steigerung): Boost = Ziel × 1,25
        assert boosted == _round_goal(before * 1.25, g["exercises"][0].get("unit", ""))
        # zweiter Boost in derselben Woche (auch andere Übung) geht nicht
        other = g["exercises"][1]["key"]
        assert auth.post("/api/boost", json={"exercise_key": other}).status_code == 400
        # zurücknehmen -> Ziel wie vorher, dann geht wieder einer
        assert auth.delete("/api/boost").status_code == 200
        assert auth.get("/api/goals/me").json()["state"][key]["current_goal"] == before
        assert auth.post("/api/boost", json={"exercise_key": other}).status_code == 200

    def test_unbekannte_uebung(self, auth):
        assert auth.post("/api/boost", json={"exercise_key": "gibtsnicht"}).status_code == 400
