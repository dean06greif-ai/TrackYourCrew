"""Fehler-Meldungen an den Admin per Telegram (gedrosselt, ohne Nutzerdaten)."""
import pytest
from fastapi.testclient import TestClient

import server
from conftest import run, patch_everywhere


@pytest.fixture
def telegram(monkeypatch):
    sent = []

    async def fake_send(text):
        sent.append(text)
        return True

    patch_everywhere(monkeypatch, "_send_telegram", fake_send)
    server._alert_state.update(day="", count=0, seen={})
    return sent


def _boom():
    raise ValueError("kaputt")


if not any(getattr(r, "path", "") == "/api/__test_boom" for r in server.app.routes):
    server.app.add_api_route("/api/__test_boom", _boom, methods=["GET"])


class TestAdminAlerts:
    def test_serverfehler_meldet_einmal_pro_stunde(self, telegram):
        with TestClient(server.app, raise_server_exceptions=False) as c:
            r = c.get("/api/__test_boom?email=geheim@example.com")
            assert r.status_code == 500 and r.json() == {"detail": "Internal Server Error"}
            c.get("/api/__test_boom")
        assert len(telegram) == 1
        assert "ValueError: kaputt" in telegram[0] and "/api/__test_boom" in telegram[0]
        assert "geheim@example.com" not in telegram[0]  # keine Query/Nutzerdaten

    def test_tageslimit(self, telegram, monkeypatch):
        patch_everywhere(monkeypatch, "ALERT_MAX_PER_DAY", 2)
        for i in range(4):
            run(server._alert_admin(f"sig{i}", "x"))
        assert len(telegram) == 2

    def test_browser_fehler(self, client, telegram):
        r = client.post("/api/client-error", json={"message": "TypeError: x is undefined",
                                                    "source": "main.js:1:200", "path": "/dashboard?token=abc"})
        assert r.status_code == 200
        client.post("/api/client-error", json={"message": "TypeError: x is undefined", "source": "main.js:1:200"})
        assert len(telegram) == 1
        assert "token=abc" not in telegram[0] and "/dashboard" in telegram[0]

    def test_http_fehler_werden_nicht_gemeldet(self, client, telegram):
        assert client.get("/api/board").status_code == 401
        assert telegram == []
