"""Kern: Konfiguration, Datenbank, App + API-Router, Modelle, Live-Verbindungen, Login-Helfer, Admin-Meldungen.

Teil von server.py (aufgeteilt 2026-11-25, BACKLOG W1)."""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, WebSocket, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.exception_handlers import http_exception_handler
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import base64
import hashlib
import os
import logging
import httpx
from pathlib import Path
from pydantic import BaseModel, field_validator
from typing import Optional, List, Set
import uuid
from datetime import datetime, timezone, timedelta
import secrets
import i18n_messages

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

def _mongo_url(env) -> str:
    """MONGO_URL (Render); der alte Name MONGO_URI geht weiter (lokale .env)."""
    url = (env.get("MONGO_URL") or env.get("MONGO_URI") or "").strip()
    if not url:
        raise KeyError("MONGO_URL fehlt (Umgebungsvariable)")
    return url


mongo_url = _mongo_url(os.environ)
GOOGLE_CLIENT_ID = os.environ["GOOGLE_CLIENT_ID"]
GOOGLE_CLIENT_SECRET = os.environ["GOOGLE_CLIENT_SECRET"]
FRONTEND_URL = os.environ["FRONTEND_URL"].rstrip("/")
BACKEND_PUBLIC_URL = os.environ["BACKEND_PUBLIC_URL"].rstrip("/")
# Erlaubte Uhrabweichung beim Prüfen des Google-ID-Tokens. Ohne Toleranz scheitert
# der Login, sobald die Uhr des Servers (oder lokalen PCs) wenige Sekunden abweicht.
GOOGLE_CLOCK_SKEW_SECONDS = 30
# Optional: Feedback der Nutzer per Telegram-Bot an den Betreiber weiterleiten.
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
# Web Push für Erinnerungen am Handy (Plan 5). Ohne Schlüssel ist Push einfach aus.
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@trackyourcrew.de").strip()
# Externer Wecker (z. B. Render Cron), damit Erinnerungen auch kommen, wenn der Server schläft.
CRON_SECRET = os.environ.get("CRON_SECRET", "").strip()
# Prozent-Vergleiche ("obere 10 %") erst ab so vielen Nutzern je Übungsart (Dean, 2026-11-25: nur echte Daten).
STATS_MIN_USERS = int(os.environ.get("STATS_MIN_USERS", "50") or 50)
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


@app.exception_handler(StarletteHTTPException)
async def translated_http_exception(request: Request, exc: StarletteHTTPException):
    """Fehlermeldungen in der Sprache des Nutzers (Header Accept-Language)."""
    if isinstance(exc.detail, str):
        lang = i18n_messages.pick_language(request.headers.get("accept-language", ""))
        return JSONResponse({"detail": i18n_messages.translate(exc.detail, lang)},
                            status_code=exc.status_code, headers=getattr(exc, "headers", None))
    return await http_exception_handler(request, exc)


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    """Unerwarteter Fehler: loggen, Admin per Telegram informieren (gedrosselt), 500 zurück."""
    import traceback
    tb = traceback.extract_tb(exc.__traceback__)
    where = f"{tb[-1].name}:{tb[-1].lineno}" if tb else "?"
    logging.getLogger(__name__).exception(f"Unbehandelter Fehler in {request.url.path}")
    await _alert_admin(
        f"server:{type(exc).__name__}:{where}",
        f"🐞 Server-Fehler\n{request.method} {request.url.path}\n{type(exc).__name__}: {str(exc)[:300]}\nbei {where}")
    return JSONResponse({"detail": "Internal Server Error"}, status_code=500)

# -------------------- Models --------------------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    handle: Optional[str] = None  # 5-char unique tag (A-Z, 0-9)
    picture: Optional[str] = None
    created_at: datetime
    language: Optional[str] = None          # en | de | es | fr
    onboarding_done: Optional[bool] = None  # False = Tutorial noch nicht gesehen (nur neue Nutzer)
    tour_step: Optional[int] = None         # Geführte Tour (Plan 4a): nächster Schritt, -1 = fertig/übersprungen

class FriendAddRequest(BaseModel):
    name: str
    handle: str

class FriendJoinRequest(BaseModel):
    handle: str

class FriendRequestAnswer(BaseModel):
    add_back: bool = False

class FriendRequestsSetting(BaseModel):
    accept: bool

class FriendOrderUpdate(BaseModel):
    order: List[str]  # ordered list of friend user_ids

class Exercise(BaseModel):
    key: str
    name: str
    unit: str = ""
    icon: str = "pushup"
    color: Optional[str] = None
    base_value: float = 0
    progression_pct: int = 10  # 0..10 — individuelle wöchentliche Steigerung in %
    added_week: Optional[int] = None  # In welcher Programm-Woche die Übung hinzugefügt wurde
    is_default: Optional[bool] = None  # Standard-Übung aus der Erstausstattung (nur Info)
    variant: str = ""  # Erschwerung, z. B. "+10 kg" (Anzeige "Liegestütze · +10 kg")
    set_goal: Optional[float] = None   # Ziel ab dieser Woche (nur beim Speichern, wird nicht gespeichert)
    # "exercise" (Wochenziel mit Steigerung) oder "activity" (Dean 2026-11-26: z. B. „Gym 2× pro Woche“:
    # Ziel = Mal pro Woche, erledigte Tage zählen; keine Steigerung, kein Abzug, kein Boost, kein Rang)
    type: str = "exercise"

    @field_validator("type", mode="before")
    @classmethod
    def _check_type(cls, v):
        return "activity" if str(v or "").strip().lower() == "activity" else "exercise"

    @field_validator("variant", mode="before")
    @classmethod
    def _clean_variant(cls, v):
        return _clean_variant_text(v)

    @field_validator("progression_pct")
    @classmethod
    def _clamp_progression_pct(cls, v):
        try:
            v = int(round(float(v)))
        except (TypeError, ValueError):
            v = 10
        return max(0, min(10, v))

VARIANT_MAX_LEN = 30


def _clean_variant_text(v) -> str:
    """Variante: Text ohne Zeilenumbrüche, getrimmt, höchstens 30 Zeichen."""
    text = " ".join(str(v or "").split())
    if len(text) > VARIANT_MAX_LEN:
        raise ValueError(f"Variante: höchstens {VARIANT_MAX_LEN} Zeichen")
    return text


class GoalsUpdate(BaseModel):
    exercises: List[Exercise]

class BoostRequest(BaseModel):
    exercise_key: str

class ProgressUpdate(BaseModel):
    week_number: int
    values: Optional[dict] = None    # legacy: total per exercise
    days: Optional[dict] = None      # new: {"0".."6": {exercise_key: number}}
    # Stand, auf dem die Eingabe beruht (updated_at beim Öffnen/letzten Speichern; None = noch kein Eintrag).
    # Wird mitgeschickt, erkennt der Server, ob inzwischen ein anderes Gerät gespeichert hat (409).
    base_updated_at: Optional[str] = None

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    picture: Optional[str] = None

class AuthPreferencesUpdate(BaseModel):
    remember_me: bool

class LiveSaveUpdate(BaseModel):
    live_save_enabled: bool

class HideBoostButtonsUpdate(BaseModel):
    hide_boost_buttons: bool

class CustomStepsUpdate(BaseModel):
    custom_steps: dict

DEFAULT_EXERCISES = [
    {"key": "ex1", "name": "Lauf",         "unit": "km", "icon": "run",    "color": "#CCFF00", "base_value": 5.0, "progression_pct": 5, "is_default": True},
    {"key": "ex2", "name": "Liegestütze",  "unit": "",   "icon": "pushup", "color": "#FF3B30", "base_value": 150, "progression_pct": 5, "is_default": True},
    {"key": "ex3", "name": "Klimmzüge",    "unit": "",   "icon": "pullup", "color": "#00F0FF", "base_value": 20,  "progression_pct": 5, "is_default": True},
]
# Muss mit EXERCISE_PALETTE in frontend/src/pages/Settings.jsx übereinstimmen.
def default_exercises(lang: str = "en") -> list:
    """Standard-Übungen mit Namen in der Sprache des Nutzers."""
    names = i18n_messages.DEFAULT_NAMES.get(lang) or i18n_messages.DEFAULT_NAMES["en"]
    return [{**e, "name": names[e["key"]]} for e in DEFAULT_EXERCISES]


def _rename_defaults(exercises: list, lang: str) -> None:
    """Standard-Übungen umbenennen, aber nur, wenn ihr Name noch ein unveränderter
    Standardname (in irgendeiner Sprache) ist. Eigene Namen bleiben."""
    target = i18n_messages.DEFAULT_NAMES.get(lang)
    if not target:
        return
    for ex in exercises:
        key = ex.get("key")
        if key in target and any(ex.get("name") == n[key] for n in i18n_messages.DEFAULT_NAMES.values()):
            ex["name"] = target[key]


EXERCISE_PALETTE = ["#CCFF00", "#FF3B30", "#00F0FF", "#FF8800", "#A855F7", "#22FF77", "#FF1493"]

def _normalize_exercise_colors(exercises: list) -> list:
    """Farbe bleibt bei der Übung (auch beim Umsortieren). Nur fehlende oder doppelte
    Farben bekommen die nächste freie aus der Palette. Gleiche Regel wie im Frontend."""
    if not exercises:
        return exercises
    dicts = [ex for ex in exercises if isinstance(ex, dict)]
    used = set()
    keep = []
    for ex in dicts:  # 1. Durchgang: vorhandene, eindeutige Farben reservieren
        ok = ex.get("color") in EXERCISE_PALETTE and ex.get("color") not in used
        if ok:
            used.add(ex["color"])
        keep.append(ok)
    for ex, ok in zip(dicts, keep):  # 2. Durchgang: Rest bekommt freie Farben
        if not ok:
            ex["color"] = next((c for c in EXERCISE_PALETTE if c not in used), EXERCISE_PALETTE[0])
            used.add(ex["color"])
    return exercises

BASE_INCREASE = 0.10
BOOST_INCREASE = 0.25
FUTURE_WEEKS = 10

# -------------------- WebSocket Manager --------------------
class ConnectionManager:
    """Live-Verbindungen. Nur eingeloggte Nutzer; Events gehen nur an Betroffene."""

    def __init__(self):
        self.active: dict = {}  # WebSocket -> user_id

    async def connect(self, ws: WebSocket, user_id: str):
        await ws.accept()
        self.active[ws] = user_id

    def disconnect(self, ws: WebSocket):
        self.active.pop(ws, None)

    def online_user_ids(self) -> Set[str]:
        return {uid for uid in self.active.values() if uid}

    async def _send(self, ws: WebSocket, message: dict) -> bool:
        try:
            await ws.send_json(message)
            return True
        except Exception:
            self.active.pop(ws, None)
            return False

    async def send_to(self, user_ids: Set[str], message: dict):
        for ws, uid in list(self.active.items()):
            if uid in user_ids:
                await self._send(ws, message)

    async def broadcast_presence(self):
        """Jeder Empfänger sieht nur den Online-Status seiner Crew (und sich selbst)."""
        online = self.online_user_ids()
        for ws, uid in list(self.active.items()):
            visible = await _crew_ids(uid)
            await self._send(ws, {
                "type": "presence_changed",
                "online_user_ids": sorted(online & visible),
            })

manager = ConnectionManager()

async def _crew_ids(user_id: str) -> Set[str]:
    """Wen sieht dieser Nutzer auf seinem Board? Er selbst + seine Freunde."""
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "friends": 1}) or {}
    return {user_id, *(doc.get("friends") or [])}


async def _audience(user_id: str) -> Set[str]:
    """Wer soll Events über diesen Nutzer bekommen? Er selbst + alle, die ihn in
    ihrer Crew haben (Freundschaften sind einseitig)."""
    ids = {user_id}
    async for d in db.users.find({"friends": user_id}, {"_id": 0, "user_id": 1}):
        ids.add(d["user_id"])
    return ids


async def _notify(user_id: str, message: dict):
    """Live-Event über `user_id` an seine Zuschauer senden (statt an alle)."""
    await manager.send_to(await _audience(user_id), message)


# -------------------- Auth helpers --------------------
def _valid_tz(name: str) -> bool:
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(name)
        return True
    except Exception:
        return False


async def get_current_user(request: Request) -> User:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    # Zeitzone des Geräts (Header X-Timezone) merken: Wochenende = Sonntag 24:00 Ortszeit (Dean 2026-11-27)
    tzname = (request.headers.get("x-timezone") or "").strip()[:64]
    if tzname and tzname != user_doc.get("tz") and _valid_tz(tzname):
        await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": {"tz": tzname}})
        await db.user_goals.update_one({"user_id": user_doc["user_id"]}, {"$set": {"tz": tzname}})
        user_doc["tz"] = tzname
    if not user_doc.get("handle"):
        h = await _generate_unique_handle()
        await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": {"handle": h}})
        user_doc["handle"] = h
    return User(**user_doc)

# -------------------- Handle (5-char unique tag) --------------------
HANDLE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

async def _generate_unique_handle() -> str:
    for _ in range(50):
        candidate = "".join(secrets.choice(HANDLE_ALPHABET) for _ in range(5))
        existing = await db.users.find_one({"handle": candidate}, {"_id": 0, "user_id": 1})
        if not existing:
            return candidate
    return uuid.uuid4().hex[:5].upper()

async def _backfill_handles():
    cursor = db.users.find({"$or": [{"handle": {"$exists": False}}, {"handle": None}, {"handle": ""}]}, {"_id": 0, "user_id": 1})
    async for u in cursor:
        h = await _generate_unique_handle()
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"handle": h}})


# -------------------- Session/Cookie Helpers --------------------
SESSION_HINT_COOKIE = "session_hint"


def _set_session_cookies(response: Response, session_token: str, cookie_max_age: Optional[int]):
    """Setzt sowohl das echte HttpOnly session_token Cookie als auch das
    nicht-HttpOnly session_hint Cookie. cookie_max_age=None -> Session-Cookie."""
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=cookie_max_age,
    )
    response.set_cookie(
        key=SESSION_HINT_COOKIE,
        value="1",
        httponly=False,
        secure=True,
        samesite="none",
        path="/",
        max_age=cookie_max_age,
    )


async def _create_session_and_set_cookie(response: Response, user_id: str, remember_me: bool) -> str:
    """Erstellt eine DB-Session + setzt session_token + session_hint Cookies.
    Gibt den Token zurück (wird zusätzlich im OAuth-Callback ins URL-Fragment gehängt)."""
    session_token = secrets.token_urlsafe(48)
    if remember_me:
        session_days = 30
        cookie_max_age = 30 * 24 * 3600
    else:
        session_days = 1
        cookie_max_age = None
    expires_at = datetime.now(timezone.utc) + timedelta(days=session_days)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    _set_session_cookies(response, session_token, cookie_max_age)
    return session_token

async def _upsert_google_user(email: str, name: str, picture: Optional[str], lang: str = "en") -> tuple[str, bool]:
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        remember_me = existing.get("remember_me", True)
        update_set = {"name": name, "picture": picture}
        if not existing.get("language"):
            update_set["language"] = lang  # Bestandsnutzer bekommen beim nächsten Login eine Sprache
        if not existing.get("handle"):
            update_set["handle"] = await _generate_unique_handle()
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": update_set}
        )
        return user_id, remember_me

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    handle = await _generate_unique_handle()
    await db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": name,
        "handle": handle,
        "picture": picture,
        "created_at": now.isoformat(),
        "remember_me": True,
        "friends": [],
        "friend_order": [],
        "hide_boost_buttons": True,
        "onboarding_done": False,
        "language": lang,
    })
    await db.user_goals.insert_one({
        "user_id": user_id,
        "exercises": default_exercises(lang),
        "boosts": [],
        "weekly_increase": BASE_INCREASE,
        "start_date": now.isoformat(),
        "rules_from_week": 1,
        "pause_loss_from_week": 1,
    })
    return user_id, True


def _challenge_query_for(uid: str) -> dict:
    return {"$or": [{"from_user_id": uid}, {"to_user_id": uid}, {"participants.user_id": uid}]}


# -------------------- Feedback --------------------
FEEDBACK_CATEGORIES = {"bug": "🐞 Bug", "idea": "💡 Idee", "other": "💬 Sonstiges"}
FEEDBACK_MAX_PER_HOUR = 5


class FeedbackRequest(BaseModel):
    category: str = "other"
    message: str
    page: Optional[str] = None
    user_agent: Optional[str] = None
    language: Optional[str] = None


async def _send_telegram(text: str) -> bool:
    """Schickt eine Nachricht an den Betreiber. False, wenn nicht eingerichtet oder Fehler."""
    if not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID):
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            r = await hc.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": text[:4000], "disable_web_page_preview": True},
            )
        return r.status_code == 200
    except Exception as e:
        logging.getLogger(__name__).warning(f"Telegram-Versand fehlgeschlagen: {type(e).__name__}")
        return False


# Fehler-Meldungen an den Admin (Telegram), gedrosselt: gleiche Ursache höchstens 1× pro Stunde,
# insgesamt höchstens ALERT_MAX_PER_DAY pro Tag. Keine Nutzerdaten (nur Pfad, Fehlertyp, Stelle).
ALERT_COOLDOWN_S = 3600
ALERT_MAX_PER_DAY = 30
_alert_state = {"seen": {}, "day": "", "count": 0}


async def _alert_admin(signature: str, text: str) -> bool:
    import time
    now = time.time()
    day = datetime.now(timezone.utc).date().isoformat()
    st = _alert_state
    if st["day"] != day:
        st.update(day=day, count=0, seen={})
    if now - st["seen"].get(signature, 0) < ALERT_COOLDOWN_S or st["count"] >= ALERT_MAX_PER_DAY:
        return False
    st["seen"][signature] = now
    st["count"] += 1
    return await _send_telegram(text)


class ClientError(BaseModel):
    message: str
    source: Optional[str] = None  # Datei:Zeile oder erste Stack-Zeile
    path: Optional[str] = None    # Seite, z. B. /dashboard (ohne Query)

    @field_validator("message", "source", "path")
    @classmethod
    def _cut(cls, v):
        return (v or "")[:300] or None


@api_router.post("/client-error")
async def report_client_error(payload: ClientError, request: Request):
    """Absturz im Browser melden (vom Frontend automatisch, nur Produktions-Build)."""
    path = (payload.path or "").split("?")[0][:100]
    sig = f"client:{(payload.message or '')[:80]}:{(payload.source or '')[:80]}"
    ua = request.headers.get("user-agent", "")[:120]
    await _alert_admin(sig, f"🐞 Browser-Fehler\n{path}\n{payload.message}\n{payload.source or ''}\n{ua}")
    return {"ok": True}


async def _deliver_feedback(feedback_id: str, text: str):
    ok = await _send_telegram(text)
    await db.feedback.update_one({"feedback_id": feedback_id}, {"$set": {"telegram_sent": ok}})


@api_router.post("/feedback")
async def send_feedback(payload: FeedbackRequest, background: BackgroundTasks, user: User = Depends(get_current_user)):
    """Feedback (Bug, Idee, Sonstiges): wird gespeichert und, falls eingerichtet, per
    Telegram an den Betreiber geschickt. Max. FEEDBACK_MAX_PER_HOUR pro Stunde und Nutzer."""
    message = (payload.message or "").strip()
    if not (3 <= len(message) <= 2000):
        raise HTTPException(status_code=400, detail="Nachricht muss 3 bis 2000 Zeichen lang sein")
    category = payload.category if payload.category in FEEDBACK_CATEGORIES else "other"
    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = await db.feedback.count_documents({"user_id": user.user_id, "created_at": {"$gte": since}})
    if recent >= FEEDBACK_MAX_PER_HOUR:
        raise HTTPException(status_code=429, detail="Zu viele Nachrichten, bitte später nochmal")
    feedback_id = f"fb_{uuid.uuid4().hex[:12]}"
    doc = {
        "feedback_id": feedback_id,
        "user_id": user.user_id,
        "name": user.name,
        "handle": user.handle,
        "email": user.email,
        "category": category,
        "message": message,
        "page": (payload.page or "")[:200],
        "user_agent": (payload.user_agent or "")[:300],
        "language": (payload.language or "")[:10],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "telegram_sent": None,
    }
    await db.feedback.insert_one(dict(doc))
    text = (
        f"{FEEDBACK_CATEGORIES[category]} – TrackYourCrew\n\n{message}\n\n"
        f"— {user.name} #{user.handle or '?'} ({user.email})\n"
        f"Seite: {doc['page'] or '-'} · Sprache: {doc['language'] or '-'}\n"
        f"Gerät: {doc['user_agent'][:120] or '-'}"
    )
    background.add_task(_deliver_feedback, feedback_id, text)
    return {"ok": True}


# -------------------- Profilbilder (Plan 9) --------------------
# Hochgeladene Bilder liegen als data:-URL im User-Dokument. Board, Freundesliste und
# Anfragen schicken sie nicht mehr als Base64 mit, sondern einen Link auf diesen
# Endpunkt. v = Fingerabdruck des Bildes: ändert sich mit jedem neuen Bild (Browser-
# Cache darf ewig halten) und ist ohne Zugriff aufs Board nicht zu erraten.
# Google-Profilbilder (http-Links) werden unverändert weitergegeben.
def _picture_version(picture: str) -> str:
    return hashlib.sha256(picture.encode("utf-8")).hexdigest()[:16]


def _picture_ref(user_id: str, picture):
    if not picture:
        return None
    if isinstance(picture, str) and picture.startswith("data:"):
        return f"/api/users/{user_id}/avatar?v={_picture_version(picture)}"
    return picture


@api_router.get("/users/{user_id}/avatar")
async def user_avatar(user_id: str, v: str = ""):
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "picture": 1}) or {}
    pic = doc.get("picture")
    if not (isinstance(pic, str) and pic.startswith("data:")) or v != _picture_version(pic):
        raise HTTPException(status_code=404, detail="Kein Bild")
    try:
        header, b64 = pic.split(",", 1)
        media = header[5:].split(";")[0] or "image/jpeg"
        data = base64.b64decode(b64)
    except Exception:
        raise HTTPException(status_code=404, detail="Kein Bild")
    if not media.startswith("image/"):
        raise HTTPException(status_code=404, detail="Kein Bild")
    return Response(content=data, media_type=media,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})
logger = logging.getLogger(__name__)
