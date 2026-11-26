"""Crew-Challenges (Plan 12e): herausfordern (auch mehrere), annehmen/ablehnen, Ergebnis in der Historie."""
from datetime import timedelta

import server
from conftest import run, befriend, patch_everywhere


def _crew(make_user, db, names=("Anna", "Ben")):
    users = [make_user(n, handle=n[:3].upper() + f"C{i}") for i, n in enumerate(names)]
    for a in users:
        for b in users:
            if a is not b:
                befriend(db, a, b)
    return users


def _log(db, user, key, value, week=1):
    run(db.progress_entries.update_one(
        {"user_id": user["user_id"], "week_number": week},
        {"$set": {f"values.{key}": value, "days": {}}}, upsert=True))


def _list(client, user):
    return client.get("/api/challenges", headers=user["headers"]).json()["challenges"]


def _create(client, a, targets, kind="duel", key="ex2", target=None):
    body = {"to_user_ids": [t["user_id"] for t in targets], "kind": kind, "from_key": key}
    if target is not None:
        body["target"] = target
    return client.post("/api/challenges", json=body, headers=a["headers"])


def _accept(client, who, cid, key="ex2"):
    return client.post(f"/api/challenges/{cid}/accept", json={"to_key": key}, headers=who["headers"])


def _later(monkeypatch):
    later = server._this_monday() + timedelta(days=7)
    patch_everywhere(monkeypatch, "_this_monday", lambda: later)


def _vals(c):
    return {p["name"]: p["value"] for p in c["participants"]}


class TestChallenges:
    def test_duell_ablauf_mit_ergebnis(self, client, make_user, db, monkeypatch):
        a, b = _crew(make_user, db)
        r = _create(client, a, [b])
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        assert _list(client, b)[0]["status"] == "pending" and _list(client, b)[0]["my_status"] == "invited"
        assert _accept(client, b, cid).json()["status"] == "active"
        _log(db, a, "ex2", 120)
        _log(db, b, "ex2", 90)
        c = _list(client, a)[0]
        assert _vals(c) == {"Anna": 120, "Ben": 90}
        assert c["leaders"] == [a["user_id"]] and c["winners"] is None
        _later(monkeypatch)
        c = _list(client, b)[0]
        assert c["status"] == "finished" and c["winners"] == [a["user_id"]]
        _log(db, b, "ex2", 500)  # nachträgliche Änderung ändert die Historie nicht
        c = _list(client, b)[0]
        assert _vals(c) == {"Anna": 120, "Ben": 90} and c["winners"] == [a["user_id"]]
        assert c["ex"]["name"]

    def test_gruppe_mit_drei(self, client, make_user, db, monkeypatch):
        a, b, c3 = _crew(make_user, db, ("Anna", "Ben", "Cem"))
        cid = _create(client, a, [b, c3]).json()["id"]
        _accept(client, b, cid)
        client.post(f"/api/challenges/{cid}/decline", headers=c3["headers"])
        _log(db, a, "ex2", 50)
        _log(db, b, "ex2", 80)
        ch = _list(client, c3)[0]
        assert {p["name"]: p["status"] for p in ch["participants"]} == {"Anna": "accepted", "Ben": "accepted", "Cem": "declined"}
        assert ch["leaders"] == [b["user_id"]]
        _later(monkeypatch)
        assert _list(client, a)[0]["winners"] == [b["user_id"]]

    def test_gemeinsames_ziel_mehrere(self, client, make_user, db, monkeypatch):
        a, b, c3 = _crew(make_user, db, ("Anna", "Ben", "Cem"))
        cid = _create(client, a, [b, c3], kind="team", key="ex1", target=10).json()["id"]
        _accept(client, b, cid, "ex1")
        _accept(client, c3, cid, "ex1")
        _log(db, a, "ex1", 3)
        _log(db, b, "ex1", 4)
        _log(db, c3, "ex1", 3.5)
        _later(monkeypatch)
        ch = _list(client, a)[0]
        assert ch["kind"] == "team" and ch["team_total"] == 10.5 and ch["winners"] == ["team"]

    def test_unentschieden(self, client, make_user, db, monkeypatch):
        a, b = _crew(make_user, db)
        cid = _create(client, a, [b]).json()["id"]
        _accept(client, b, cid)
        _log(db, a, "ex2", 10)
        _log(db, b, "ex2", 10)
        _later(monkeypatch)
        assert set(_list(client, a)[0]["winners"]) == {a["user_id"], b["user_id"]}

    def test_ablehnen_und_zurueckziehen(self, client, make_user, db):
        a, b = _crew(make_user, db)
        cid = _create(client, a, [b]).json()["id"]
        assert client.post(f"/api/challenges/{cid}/decline", headers=a["headers"]).status_code == 400  # nur Eingeladene
        assert client.post(f"/api/challenges/{cid}/decline", headers=b["headers"]).json()["status"] == "declined"
        assert _accept(client, b, cid).status_code == 400
        cid2 = _create(client, a, [b]).json()["id"]
        assert client.delete(f"/api/challenges/{cid2}", headers=b["headers"]).status_code == 400  # nur Ersteller
        assert client.delete(f"/api/challenges/{cid2}", headers=a["headers"]).status_code == 200
        assert [c["status"] for c in _list(client, a)] == ["declined"]

    def test_unbeantwortet_verfaellt(self, client, make_user, db, monkeypatch):
        a, b = _crew(make_user, db)
        cid = _create(client, a, [b]).json()["id"]
        _later(monkeypatch)
        assert _list(client, b)[0]["status"] == "expired"
        assert _accept(client, b, cid).status_code == 400

    def test_regeln(self, client, make_user, db):
        a, b = _crew(make_user, db)
        stranger = make_user("Fremd", handle="FREM1")
        assert _create(client, a, [stranger]).status_code == 404
        assert _create(client, a, [a]).status_code == 400
        assert _create(client, a, []).status_code == 400
        assert _create(client, a, [b], key="nope").status_code == 404
        assert _create(client, a, [b], kind="team").status_code == 400
        assert _create(client, a, [b], kind="race").status_code == 422
        assert client.get("/api/challenges").status_code == 401

    def test_alter_client_mit_einer_person(self, client, make_user, db):
        a, b = _crew(make_user, db)
        r = client.post("/api/challenges", json={"to_user_id": b["user_id"], "kind": "duel", "from_key": "ex2"},
                        headers=a["headers"])
        assert r.status_code == 200 and len(r.json()["participants"]) == 2

    def test_alte_eintraege_werden_gelesen(self, client, make_user, db):
        a, b = _crew(make_user, db)
        run(db.challenges.insert_one({"id": "old1", "kind": "duel", "monday": server._this_monday().isoformat(),
                                      "from_user_id": a["user_id"], "to_user_id": b["user_id"],
                                      "from_key": "ex2", "to_key": "ex2", "status": "accepted", "created_at": "x"}))
        c = _list(client, b)[0]
        assert c["status"] == "active" and len(c["participants"]) == 2

    def test_einheiten_muessen_passen(self, client, make_user, db):
        a, b = _crew(make_user, db)
        cid = _create(client, a, [b], key="ex1").json()["id"]  # km
        assert _accept(client, b, cid, "ex2").status_code == 400  # Wdh.

    def test_fremde_sehen_nichts(self, client, make_user, db):
        a, b = _crew(make_user, db)
        c = make_user("Cem", handle="CEMC3")
        cid = _create(client, a, [b]).json()["id"]
        assert _list(client, c) == []
        assert _accept(client, c, cid).status_code == 404


def _age(db, cid, seconds):
    """Challenge künstlich älter machen (Ready-Check-Frist)."""
    from datetime import datetime, timezone
    old = (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()
    run(db.challenges.update_one({"id": cid}, {"$set": {"created_at": old}}))


class TestReadyCheck:
    """60 Sekunden zum Annehmen (Dean 2026-11-26), danach verpasst; angenommen = verbindlich."""

    def test_restzeit_fuer_eingeladene(self, client, make_user, db):
        a, b = _crew(make_user, db)
        _create(client, a, [b])
        mine, theirs = _list(client, a)[0], _list(client, b)[0]
        assert mine["expires_in"] is None  # Ersteller muss nichts annehmen
        assert 55 <= theirs["expires_in"] <= 60 and theirs["accept_seconds"] == 60

    def test_rechtzeitig_annehmen(self, client, make_user, db):
        a, b = _crew(make_user, db)
        cid = _create(client, a, [b]).json()["id"]
        _age(db, cid, 50)
        assert _accept(client, b, cid).json()["status"] == "active"

    def test_kurz_nach_ablauf_noch_kulanz(self, client, make_user, db):
        a, b = _crew(make_user, db)
        cid = _create(client, a, [b]).json()["id"]
        _age(db, cid, 62)  # Netz-Verzögerung beim Antippen
        assert _accept(client, b, cid).status_code == 200

    def test_zu_spaet_verpasst(self, client, make_user, db):
        a, b = _crew(make_user, db)
        cid = _create(client, a, [b]).json()["id"]
        _age(db, cid, 70)
        r = _accept(client, b, cid)
        assert r.status_code == 400 and "Zu spät" in r.json()["detail"]
        c = _list(client, a)[0]
        assert c["status"] == "expired"
        assert [p["status"] for p in c["participants"] if p["user_id"] == b["user_id"]] == ["missed"]
        assert _list(client, b)[0]["expires_in"] is None

    def test_angenommen_ist_verbindlich(self, client, make_user, db):
        a, b = _crew(make_user, db)
        cid = _create(client, a, [b]).json()["id"]
        assert _accept(client, b, cid).status_code == 200
        assert client.post(f"/api/challenges/{cid}/decline", headers=b["headers"]).status_code == 400
        assert client.delete(f"/api/challenges/{cid}", headers=a["headers"]).status_code == 400
        _age(db, cid, 3600)  # Frist gilt nur fürs Annehmen
        assert _list(client, a)[0]["status"] == "active"
