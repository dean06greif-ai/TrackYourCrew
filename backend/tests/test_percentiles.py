"""Prozent-Vergleiche (nur echte Daten, erst ab STATS_MIN_USERS Nutzern je Übungsart)."""
import pytest

import server
from conftest import run, patch_everywhere


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    server._stats_cache.update(at=0.0, values={})
    patch_everywhere(monkeypatch, "STATS_MIN_USERS", 5)
    yield
    server._stats_cache.update(at=0.0, values={})


def _athlete(client, make_user, db, n, pushups, handle=None):
    u = make_user(f"A{n}", handle=handle or f"PCT{n:02d}")
    run(db.progress_entries.insert_one({"user_id": u["user_id"], "week_number": 1,
                                        "values": {"ex2": pushups}, "days": {}}))
    r = client.post("/api/me/stat-kinds", json={"items": [{"key": "ex2", "kind": "liege", "factor": 1}]},
                    headers=u["headers"])
    assert r.status_code == 200
    return u


def _pct(client, u):
    return client.get("/api/me/percentiles", headers=u["headers"]).json()


class TestPercentiles:
    def test_zu_wenige_nutzer_nichts(self, client, make_user, db):
        users = [_athlete(client, make_user, db, i, 100 + i) for i in range(4)]
        assert _pct(client, users[-1])["kinds"] == {}

    def test_obere_prozent_ab_genug_nutzern(self, client, make_user, db):
        users = [_athlete(client, make_user, db, i, (i + 1) * 100) for i in range(10)]  # 100..1000
        server._stats_cache["at"] = 0.0
        best = _pct(client, users[-1])["kinds"]["liege"]
        assert best == {"n": 10, "top_pct": 10, "level": 10}
        mid = _pct(client, users[5])["kinds"]["liege"]  # 600 -> Rang 5 von 10
        assert mid["top_pct"] == 50 and mid["level"] == 50
        low = _pct(client, users[0])["kinds"]["liege"]
        assert low["top_pct"] == 100 and low["level"] is None

    def test_werte_kommen_vom_server_nicht_vom_client(self, client, make_user, db):
        users = [_athlete(client, make_user, db, i, 100) for i in range(5)]
        cheat = users[0]
        # Faktor ist erlaubt (Einheiten), aber der Wert selbst stammt aus den Einträgen
        client.post("/api/me/stat-kinds", json={"items": [{"key": "ex2", "kind": "liege", "factor": 1},
                                                          {"key": "fake", "kind": "liege", "factor": 1}]},
                    headers=cheat["headers"])
        server._stats_cache["at"] = 0.0
        assert _pct(client, cheat)["kinds"]["liege"]["top_pct"] == 100  # alle gleich, keiner besser

    def test_varianten_zaehlen_nicht(self, client, make_user, db):
        users = [_athlete(client, make_user, db, i, 100) for i in range(5)]
        v = users[0]
        run(db.user_goals.update_one({"user_id": v["user_id"], "exercises.key": "ex2"},
                                     {"$set": {"exercises.$.variant": "+10 kg"}}))
        server._stats_cache["at"] = 0.0
        assert _pct(client, v)["kinds"] == {}  # nur noch 4 gültige Nutzer, eigener Wert zählt nicht

    def test_tageswerte_werden_summiert(self, client, make_user, db):
        users = [_athlete(client, make_user, db, i, 100) for i in range(4)]
        u = make_user("Tage", handle="TAGE1")
        run(db.progress_entries.insert_one({"user_id": u["user_id"], "week_number": 1, "values": {},
                                            "days": {"0": {"ex2": 80}, "1": {"ex2": 70}}}))
        client.post("/api/me/stat-kinds", json={"items": [{"key": "ex2", "kind": "liege", "factor": 1}]},
                    headers=u["headers"])
        server._stats_cache["at"] = 0.0
        assert _pct(client, u)["kinds"]["liege"]["top_pct"] == 20  # 150 ist Bester von 5
        assert users  # (Platzhalter für die anderen vier)

    def test_gesehen_merken_nur_bessere_stufe(self, client, make_user):
        u = make_user("Seen", handle="SEEN1")
        assert client.post("/api/me/percentile-seen", json={"kind": "liege", "level": 25},
                           headers=u["headers"]).json()["seen"] == {"liege": 25}
        assert client.post("/api/me/percentile-seen", json={"kind": "liege", "level": 50},
                           headers=u["headers"]).json()["seen"] == {"liege": 25}
        assert client.post("/api/me/percentile-seen", json={"kind": "liege", "level": 10},
                           headers=u["headers"]).json()["seen"] == {"liege": 10}
        assert client.post("/api/me/percentile-seen", json={"kind": "liege", "level": 7},
                           headers=u["headers"]).status_code == 422

    def test_ungueltige_eingaben(self, client, make_user):
        u = make_user("Bad", handle="BADP1")
        assert client.post("/api/me/stat-kinds", json={"items": [{"key": "ex2", "kind": "Liege!", "factor": 1}]},
                           headers=u["headers"]).status_code == 422
        assert client.post("/api/me/stat-kinds", json={"items": [{"key": "ex2", "kind": "liege", "factor": 0}]},
                           headers=u["headers"]).status_code == 422
        assert client.get("/api/me/percentiles").status_code == 401
