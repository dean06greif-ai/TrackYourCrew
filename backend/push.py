"""Erinnerungen per Web Push und die Live-Verbindung (WebSocket).

Teil von server.py (aufgeteilt 2026-11-25, BACKLOG W1)."""
from fastapi import HTTPException, Request, WebSocket, WebSocketDisconnect, Depends
import httpx
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime, timezone
import i18n_messages
from core import CRON_SECRET, User, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT, _crew_ids, api_router, db, get_current_user, logger, manager
from goals import _compute_user_state, _current_week_of, _load_goals, _progress_by_week, _round_goal, _starts_on

# -------------------- Erinnerungen per Web Push (Plan 5, nur Handy) --------------------
# db.push_subscriptions: {user_id, endpoint (eindeutig), p256dh, auth, created_at}
# users.reminder: {enabled, weekday 0=Mo..6=So, hour 0–23, tz (IANA)}; users.reminder_sent: "2026-W48"
REMINDER_DEFAULT = {"enabled": False, "weekday": 6, "hour": 18, "tz": "Europe/Berlin"}


def _push_enabled() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)


def _reminder_of(udoc: dict) -> dict:
    r = {**REMINDER_DEFAULT, **(udoc.get("reminder") or {})}
    try:
        r["weekday"] = max(0, min(6, int(r["weekday"])))
        r["hour"] = max(0, min(23, int(r["hour"])))
    except (TypeError, ValueError):
        r.update(weekday=6, hour=18)
    return r


def _local_now(tz: str, now: Optional[datetime] = None) -> datetime:
    from zoneinfo import ZoneInfo
    now = now or datetime.now(timezone.utc)
    try:
        return now.astimezone(ZoneInfo(tz or "Europe/Berlin"))
    except Exception:
        return now.astimezone(ZoneInfo("Europe/Berlin"))


async def _send_push(user_id: str, data: dict) -> int:
    """Schickt `data` an alle Geräte des Nutzers. Abgelaufene Abos (404/410) werden gelöscht.
    Gibt die Zahl erfolgreicher Zustellungen zurück."""
    if not _push_enabled():
        return 0
    import webpush
    ok = 0
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(20)
    async with httpx.AsyncClient(timeout=10) as hc:
        for sub in subs:
            try:
                url, headers, body = webpush.build_request(
                    sub, data, private_b64u=VAPID_PRIVATE_KEY, public_b64u=VAPID_PUBLIC_KEY, subject=VAPID_SUBJECT)
                r = await hc.post(url, headers=headers, content=body)
                if r.status_code in (404, 410):
                    await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
                elif r.status_code < 300:
                    ok += 1
                else:
                    logger.warning(f"push {r.status_code} for {user_id}")
            except Exception as e:  # ein kaputtes Abo darf die anderen nicht aufhalten
                logger.warning(f"push failed for {user_id}: {e}")
    return ok


async def _reminder_text(user_id: str, lang: str) -> Optional[str]:
    """Was diese Woche noch fehlt, z. B. „Liegestütze 40 · Lauf 2,1 km“ – None, wenn nichts fehlt
    (oder Start erst Montag; bei allem pausiert ist nichts offen)."""
    g = await _load_goals(user_id)
    if _starts_on(g):
        return None
    cur = _current_week_of(g)
    pbw = await _progress_by_week(user_id, g["exercises"])
    state = await _compute_user_state(user_id, g, cur, pbw)
    parts = []
    for ex in g["exercises"]:
        st = state[ex["key"]]
        if st["status"] != "active":
            continue
        goal = float(st["current_goal"] or 0)
        have = float(pbw.get(cur, {}).get(ex["key"], 0) or 0)
        rest = _round_goal(max(0.0, goal - have), ex.get("unit", ""))
        if goal > 0 and rest > 0:
            num = f"{rest:g}".replace(".", ",") if lang in ("de", "es", "fr") else f"{rest:g}"
            unit = f" {ex['unit']}" if ex.get("unit") else ""
            parts.append(f"{ex['name']} {num}{unit}")
    return " · ".join(parts) if parts else None


async def run_reminders(now: Optional[datetime] = None) -> int:
    """Einmal durchgehen: wer jetzt (Ortszeit) seine Erinnerung bekommen soll und noch nicht hat."""
    if not _push_enabled():
        return 0
    sent = 0
    user_ids = await db.push_subscriptions.distinct("user_id")
    async for u in db.users.find({"user_id": {"$in": user_ids}, "reminder.enabled": True}, {"_id": 0}):
        rem = _reminder_of(u)
        local = _local_now(rem["tz"], now)
        y, w, _ = local.isocalendar()
        tag = f"{y}-W{w:02d}"
        if u.get("reminder_sent") == tag:
            continue
        if local.weekday() != rem["weekday"] or local.hour < rem["hour"]:
            continue
        lang = u.get("language") or "en"
        rest = await _reminder_text(u["user_id"], lang)
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"reminder_sent": tag}})
        if not rest:
            continue  # alles geschafft (oder Pause) -> keine Nachricht
        body = i18n_messages.translate("Dir fehlen diese Woche noch: {rest}", lang).format(rest=rest)
        if await _send_push(u["user_id"], {"title": "TrackYourCrew", "body": body, "url": "/dashboard", "tag": "reminder"}):
            sent += 1
    return sent


async def _reminder_loop():
    """Läuft im Server mit (alle 10 Minuten). Schläft der Server (Render Free), hilft der Cron-Endpunkt."""
    import asyncio
    while True:
        try:
            await run_reminders()
        except Exception as e:
            logger.warning(f"reminder loop: {e}")
        await asyncio.sleep(600)


class PushSubscribe(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

    @field_validator("endpoint")
    @classmethod
    def _check_endpoint(cls, v):
        if not v.startswith("https://") or len(v) > 1000:
            raise ValueError("invalid endpoint")
        return v

    @field_validator("p256dh", "auth")
    @classmethod
    def _check_key(cls, v):
        if not v or len(v) > 200:
            raise ValueError("invalid key")
        return v


class ReminderSettings(BaseModel):
    enabled: bool
    weekday: int = 6
    hour: int = 18
    tz: str = "Europe/Berlin"

    @field_validator("weekday")
    @classmethod
    def _wd(cls, v):
        if not 0 <= v <= 6:
            raise ValueError("weekday 0-6")
        return v

    @field_validator("hour")
    @classmethod
    def _hr(cls, v):
        if not 0 <= v <= 23:
            raise ValueError("hour 0-23")
        return v

    @field_validator("tz")
    @classmethod
    def _tz(cls, v):
        from zoneinfo import ZoneInfo
        try:
            ZoneInfo(v)
        except Exception:
            return "Europe/Berlin"
        return v


@api_router.get("/push/config")
async def push_config():
    return {"enabled": _push_enabled(), "public_key": VAPID_PUBLIC_KEY or None}


@api_router.get("/me/reminder")
async def get_reminder(user: User = Depends(get_current_user)):
    u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "reminder": 1}) or {}
    devices = await db.push_subscriptions.count_documents({"user_id": user.user_id})
    return {**_reminder_of(u), "devices": devices, "push": _push_enabled()}


@api_router.put("/me/reminder")
async def set_reminder(payload: ReminderSettings, user: User = Depends(get_current_user)):
    rem = payload.model_dump()
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"reminder": rem}})
    return await get_reminder(user)


@api_router.post("/me/push")
async def add_push_subscription(payload: PushSubscribe, user: User = Depends(get_current_user)):
    """Gerät für Push anmelden (ein Abo gehört immer genau einem Nutzer)."""
    if not _push_enabled():
        raise HTTPException(status_code=400, detail="Push ist auf diesem Server nicht eingerichtet")
    await db.push_subscriptions.update_one(
        {"endpoint": payload.endpoint},
        {"$set": {"user_id": user.user_id, "endpoint": payload.endpoint, "p256dh": payload.p256dh,
                  "auth": payload.auth, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    return await get_reminder(user)


@api_router.post("/me/push/remove")
async def remove_push_subscription(payload: dict, user: User = Depends(get_current_user)):
    await db.push_subscriptions.delete_one({"endpoint": str(payload.get("endpoint") or ""), "user_id": user.user_id})
    return await get_reminder(user)


@api_router.post("/me/push/test")
async def test_push(user: User = Depends(get_current_user)):
    lang = i18n_messages.normalize((await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "language": 1}) or {}).get("language")) or "en"
    n = await _send_push(user.user_id, {
        "title": "TrackYourCrew",
        "body": i18n_messages.translate("So sehen deine Erinnerungen aus.", lang),
        "url": "/dashboard", "tag": "test"})
    return {"sent": n}


@api_router.post("/cron/reminders")
async def cron_reminders(request: Request):
    """Für einen externen Wecker (Header X-Cron-Secret). Ohne CRON_SECRET abgeschaltet."""
    if not CRON_SECRET or request.headers.get("X-Cron-Secret", "") != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"sent": await run_reminders()}

# -------------------- WebSocket --------------------
async def _resolve_ws_user_id(websocket: WebSocket) -> Optional[str]:
    token = websocket.cookies.get("session_token")
    if not token:
        token = websocket.query_params.get("token")
    if not token:
        return None
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except ValueError:
            return None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        return None
    return session.get("user_id")

@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    user_id = await _resolve_ws_user_id(websocket)
    if not user_id:
        # Ohne gültige Session keine Live-Daten (Code 4401 = nicht angemeldet).
        await websocket.close(code=4401)
        return
    await manager.connect(websocket, user_id=user_id)
    try:
        visible = await _crew_ids(user_id)
        await websocket.send_json({
            "type": "presence_snapshot",
            "online_user_ids": sorted(manager.online_user_ids() & visible),
        })
        await manager.broadcast_presence()
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast_presence()
    except Exception:
        manager.disconnect(websocket)
        try:
            await manager.broadcast_presence()
        except Exception:
            pass

@api_router.get("/")
async def root():
    return {"message": "TrackYourCrew API"}
