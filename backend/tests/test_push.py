"""Erinnerungen per Web Push (Plan 5): Verschlüsselung, VAPID, Abos, Erinnerungs-Lauf."""
import base64
import json
from datetime import datetime, timezone

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

import server
import webpush
from conftest import run, patch_everywhere


def _browser_sub():
    """Ein 'Browser'-Abo mit echtem Schlüsselpaar, damit wir wie der Browser entschlüsseln können."""
    priv = ec.generate_private_key(ec.SECP256R1())
    auth = b"0123456789abcdef"
    return priv, auth, {"endpoint": "https://push.example.com/send/abc",
                        "p256dh": webpush.b64u_encode(webpush.public_bytes(priv.public_key())),
                        "auth": webpush.b64u_encode(auth)}


class TestWebpushCrypto:
    def test_verschluesseln_und_wie_browser_entschluesseln(self):
        priv, auth, sub = _browser_sub()
        body = webpush.encrypt(b'{"body":"Hallo"}', sub["p256dh"], sub["auth"])
        assert int.from_bytes(body[16:20], "big") == 4096 and body[20] == 65
        assert webpush.decrypt(body, priv, auth) == b'{"body":"Hallo"}'

    def test_vapid_signatur_gueltig(self):
        pub_b64, priv_b64 = webpush.generate_vapid_keys()
        h = webpush.vapid_header("https://fcm.googleapis.com/fcm/send/x", priv_b64, pub_b64, "mailto:a@b.de")
        t = h.split("t=")[1].split(",")[0]
        head, claims, sig = t.split(".")
        payload = json.loads(base64.urlsafe_b64decode(claims + "=" * (-len(claims) % 4)))
        assert payload["aud"] == "https://fcm.googleapis.com" and payload["sub"] == "mailto:a@b.de"
        raw = webpush.b64u_decode(sig)
        der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
        pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), webpush.b64u_decode(pub_b64))
        pub.verify(der, f"{head}.{claims}".encode(), ec.ECDSA(hashes.SHA256()))  # wirft bei Fehler
        assert h.endswith(f"k={pub_b64}")


@pytest.fixture
def push_on(monkeypatch):
    pub, priv = webpush.generate_vapid_keys()
    patch_everywhere(monkeypatch, "VAPID_PUBLIC_KEY", pub)
    patch_everywhere(monkeypatch, "VAPID_PRIVATE_KEY", priv)
    sent = []
    status = {"code": 201}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, content=None):
            sent.append({"url": url, "headers": headers, "body": content})

            class R:
                status_code = status["code"]
            return R()

    monkeypatch.setattr(server.httpx, "AsyncClient", FakeClient)
    return {"sent": sent, "status": status}


def _subscribe(client, user, sub):
    return client.post("/api/me/push", json=sub, headers=user["headers"])


def _now_berlin_weekday():
    return server._local_now("Europe/Berlin").weekday()


class TestReminders:
    def test_ohne_schluessel_ist_push_aus(self, client, make_user):
        u = make_user("Ohne", handle="OHNE1")
        assert client.get("/api/push/config").json()["enabled"] is False
        _, _, sub = _browser_sub()
        assert _subscribe(client, u, sub).status_code == 400

    def test_abo_und_einstellungen(self, client, make_user, push_on):
        u = make_user("Abo", handle="ABO01")
        assert client.get("/api/push/config").json()["public_key"]
        _, _, sub = _browser_sub()
        r = _subscribe(client, u, sub)
        assert r.status_code == 200 and r.json()["devices"] == 1
        r = client.put("/api/me/reminder", json={"enabled": True, "weekday": 5, "hour": 19, "tz": "Europe/Berlin"},
                       headers=u["headers"])
        assert r.json()["enabled"] is True and r.json()["weekday"] == 5 and r.json()["hour"] == 19
        assert client.put("/api/me/reminder", json={"enabled": True, "weekday": 9}, headers=u["headers"]).status_code == 422
        # unbekannte Zeitzone -> Standard
        r = client.put("/api/me/reminder", json={"enabled": True, "tz": "Mars/Olympus"}, headers=u["headers"])
        assert r.json()["tz"] == "Europe/Berlin"

    def test_erinnerung_kommt_einmal_mit_dem_rest(self, client, make_user, push_on, db):
        u = make_user("Rest", handle="REST1")
        priv, auth, sub = _browser_sub()
        _subscribe(client, u, sub)
        client.put("/api/me/reminder", json={"enabled": True, "weekday": _now_berlin_weekday(), "hour": 0,
                                             "tz": "Europe/Berlin"}, headers=u["headers"])
        run(db.users.update_one({"user_id": u["user_id"]}, {"$set": {"language": "de"}}))
        assert run(server.run_reminders()) == 1
        msg = json.loads(webpush.decrypt(push_on["sent"][0]["body"], priv, auth))
        assert msg["body"].startswith("Dir fehlen diese Woche noch:")
        assert "Liegestütze" in msg["body"]
        assert push_on["sent"][0]["headers"]["Content-Encoding"] == "aes128gcm"
        assert run(server.run_reminders()) == 0  # diese Woche schon erinnert

    def test_nicht_vor_der_uhrzeit_und_nicht_am_falschen_tag(self, client, make_user, push_on):
        u = make_user("Spaet", handle="SPAT1")
        _, _, sub = _browser_sub()
        _subscribe(client, u, sub)
        other_day = (_now_berlin_weekday() + 1) % 7
        client.put("/api/me/reminder", json={"enabled": True, "weekday": other_day, "hour": 0}, headers=u["headers"])
        assert run(server.run_reminders()) == 0
        # fester Zeitpunkt: Sonntag 10 Uhr Berlin, Erinnerung erst 18 Uhr
        client.put("/api/me/reminder", json={"enabled": True, "weekday": 6, "hour": 18}, headers=u["headers"])
        sunday_10 = datetime(2026, 11, 29, 9, 0, tzinfo=timezone.utc)
        assert run(server.run_reminders(now=sunday_10)) == 0

    def test_alles_geschafft_keine_nachricht(self, client, make_user, push_on, db):
        u = make_user("Fertig", handle="FERT1")
        _, _, sub = _browser_sub()
        _subscribe(client, u, sub)
        g = client.get("/api/goals/me", headers=u["headers"]).json()
        vals = {k: st["current_goal"] for k, st in g["state"].items()}
        client.put("/api/progress/me", json={"week_number": g["current_week"], "values": vals}, headers=u["headers"])
        client.put("/api/me/reminder", json={"enabled": True, "weekday": _now_berlin_weekday(), "hour": 0},
                   headers=u["headers"])
        assert run(server.run_reminders()) == 0
        assert push_on["sent"] == []

    def test_abgelaufenes_abo_wird_entfernt(self, client, make_user, push_on, db):
        u = make_user("Alt", handle="ALT01")
        _, _, sub = _browser_sub()
        _subscribe(client, u, sub)
        push_on["status"]["code"] = 410
        assert client.post("/api/me/push/test", headers=u["headers"]).json()["sent"] == 0
        assert run(db.push_subscriptions.count_documents({})) == 0

    def test_testnachricht(self, client, make_user, push_on):
        u = make_user("Test", handle="TEST1")
        _, _, sub = _browser_sub()
        _subscribe(client, u, sub)
        assert client.post("/api/me/push/test", headers=u["headers"]).json()["sent"] == 1

    def test_abo_wechselt_den_besitzer(self, client, make_user, push_on, db):
        a = make_user("A", handle="AAAA1")
        b = make_user("B", handle="BBBB1")
        _, _, sub = _browser_sub()
        _subscribe(client, a, sub)
        _subscribe(client, b, sub)  # gleiches Gerät, anderer Login
        docs = run(db.push_subscriptions.find({}).to_list(10))
        assert len(docs) == 1 and docs[0]["user_id"] == b["user_id"]

    def test_cron_nur_mit_geheimnis(self, client, monkeypatch, push_on):
        assert client.post("/api/cron/reminders").status_code == 403
        patch_everywhere(monkeypatch, "CRON_SECRET", "s3cret")
        assert client.post("/api/cron/reminders", headers={"X-Cron-Secret": "falsch"}).status_code == 403
        assert client.post("/api/cron/reminders", headers={"X-Cron-Secret": "s3cret"}).status_code == 200

    def test_konto_loeschen_entfernt_abos(self, client, make_user, push_on, db):
        u = make_user("Weg", handle="WEGG1")
        _, _, sub = _browser_sub()
        _subscribe(client, u, sub)
        client.post("/api/me/delete", json={"confirm": "WEGG1"}, headers=u["headers"])
        assert run(db.push_subscriptions.count_documents({})) == 0
