"""Eintrag auf zwei Geräten: das später speichernde Gerät überschreibt nicht still (409)."""


def _save(auth, values, **extra):
    return auth.put("/api/progress/me", json={"week_number": 1, "values": values, **extra})


class TestProgressConflict:
    def test_erstes_speichern_ohne_eintrag(self, auth):
        r = _save(auth, {"ex2": 10}, base_updated_at=None)
        assert r.status_code == 200 and r.json()["updated_at"]

    def test_zweites_geraet_mit_altem_stand_bekommt_409(self, auth):
        a = _save(auth, {"ex2": 10}, base_updated_at=None).json()   # Gerät A
        b = _save(auth, {"ex2": 20}, base_updated_at=a["updated_at"]).json()  # Gerät B (kannte A)
        r = _save(auth, {"ex2": 15}, base_updated_at=a["updated_at"])  # Gerät A mit altem Stand
        assert r.status_code == 409
        assert "another device" in r.json()["detail"]
        assert auth.get("/api/progress/me").json()["values"] == {"ex2": 20}
        # mit dem neuen Stand klappt es
        assert _save(auth, {"ex2": 25}, base_updated_at=b["updated_at"]).status_code == 200

    def test_neues_geraet_ohne_wissen_vom_eintrag(self, auth):
        _save(auth, {"ex2": 10}, base_updated_at=None)
        assert _save(auth, {"ex2": 5}, base_updated_at=None).status_code == 409

    def test_alte_clients_ohne_feld_wie_bisher(self, auth):
        _save(auth, {"ex2": 10})
        assert _save(auth, {"ex2": 11}).status_code == 200

    def test_meldung_uebersetzt(self, auth):
        a = _save(auth, {"ex2": 10}, base_updated_at=None).json()
        _save(auth, {"ex2": 20}, base_updated_at=a["updated_at"])
        r = auth.put("/api/progress/me", json={"week_number": 1, "values": {"ex2": 1}, "base_updated_at": a["updated_at"]},
                     headers={"Accept-Language": "en"})
        assert r.json()["detail"] == "Something was saved on another device in the meantime"
