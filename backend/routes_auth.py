"""Login (Google), Konto, Einstellungen (Live-Speichern, Boost-Knöpfe, Schrittweiten, Sprache), Profil, Daten-Export/Löschen.

Teil von server.py (aufgeteilt 2026-11-25, BACKLOG W1)."""
from fastapi import HTTPException, Request, Response, Depends
from fastapi.responses import RedirectResponse
import logging
import httpx
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import secrets
from urllib.parse import urlencode
from google.oauth2 import id_token
from google.auth.transport import requests as g_requests
import i18n_messages
from core import AuthPreferencesUpdate, BACKEND_PUBLIC_URL, CustomStepsUpdate, FRONTEND_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CLOCK_SKEW_SECONDS, HideBoostButtonsUpdate, LiveSaveUpdate, ProfileUpdate, SESSION_HINT_COOKIE, User, _audience, _challenge_query_for, _create_session_and_set_cookie, _notify, _rename_defaults, _set_session_cookies, _upsert_google_user, api_router, db, get_current_user, manager
from goals import _load_goals

# -------------------- Auth routes --------------------

@api_router.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    """
    Schlanker Health-Check für Render-Cold-Start-Aufwachen.
    KEIN DB-Zugriff, keine Auth, kein Logging-Overhead — nur OK.
    Wird vom Frontend Custom-Wake-Screen gepingt, um Render aus dem
    Sleep zu holen, BEVOR der Nutzer auf /api/auth/google/login navigiert.
    Damit sieht der Nutzer Renders Default-Loading-Page gar nicht erst.
    """
    return {"ok": True}

@api_router.get("/auth/google/login")
async def google_login_start(redirect: str = "/dashboard", lang: Optional[str] = None):
    state = secrets.token_urlsafe(24)
    if not redirect.startswith("/"):
        redirect = "/dashboard"
    await db.oauth_states.insert_one({
        "state": state,
        "redirect_to": redirect,
        # Auf der Login-Seite selbst gewählte Sprache (hat Vorrang vor Google/Browser).
        "lang": i18n_messages.normalize(lang),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    callback_url = f"{BACKEND_PUBLIC_URL}/api/auth/google/callback"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
        "include_granted_scopes": "true",
    }
    google_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(google_url, status_code=302)

@api_router.get("/auth/google/callback")
async def google_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    """OAuth Callback: tauscht Code gegen ID-Token, erstellt Session, redirected zum Frontend."""
    def _fail(reason: str) -> RedirectResponse:
        return RedirectResponse(f"{FRONTEND_URL}/?auth_error={reason}", status_code=302)

    if error:
        return _fail(error)
    if not code or not state:
        return _fail("missing_params")

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    try:
        await db.oauth_states.delete_many({"created_at": {"$lt": cutoff}})
    except Exception:
        pass

    state_doc = await db.oauth_states.find_one_and_delete({"state": state})
    if not state_doc:
        return _fail("invalid_state")
    redirect_to = state_doc.get("redirect_to", "/dashboard")
    if not redirect_to.startswith("/"):
        redirect_to = "/dashboard"

    callback_url = f"{BACKEND_PUBLIC_URL}/api/auth/google/callback"
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            token_resp = await hc.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "redirect_uri": callback_url,
                    "grant_type": "authorization_code",
                },
            )
    except Exception:
        return _fail("token_request_failed")
    if token_resp.status_code != 200:
        return _fail("token_exchange_failed")
    tokens = token_resp.json()
    id_token_str = tokens.get("id_token")
    if not id_token_str:
        return _fail("no_id_token")

    try:
        idinfo = id_token.verify_oauth2_token(
            id_token_str, g_requests.Request(), GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=GOOGLE_CLOCK_SKEW_SECONDS,
        )
    except ValueError as e:
        logging.getLogger(__name__).warning(f"Google-ID-Token abgelehnt: {e}")
        return _fail("invalid_id_token")

    if not idinfo.get("email_verified", False):
        return _fail("email_not_verified")

    email = idinfo["email"]
    name = idinfo.get("name") or email
    picture = idinfo.get("picture")
    # Sprache für neue Konten: Google-Konto (locale), sonst Browser-Sprache.
    lang = (state_doc.get("lang") or i18n_messages.normalize(idinfo.get("locale"))
            or i18n_messages.pick_language(request.headers.get("accept-language", "")))

    user_id, remember_me = await _upsert_google_user(email, name, picture, lang)

    base_url = f"{FRONTEND_URL}{redirect_to}"
    response = RedirectResponse(base_url, status_code=302)
    session_token = await _create_session_and_set_cookie(response, user_id, remember_me)
    response.headers["location"] = f"{base_url}#token={session_token}"
    return response

@api_router.post("/auth/session")
async def process_session(request: Request, response: Response):
    """Legacy-Endpoint: nimmt ein Google ID-Token vom Frontend (Popup-Flow)."""
    body = await request.json()
    credential = body.get("credential") or body.get("id_token")
    if not credential:
        raise HTTPException(status_code=400, detail="credential required")

    try:
        idinfo = id_token.verify_oauth2_token(
            credential, g_requests.Request(), GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=GOOGLE_CLOCK_SKEW_SECONDS,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")

    if not idinfo.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Email not verified by Google")

    email = idinfo["email"]
    name = idinfo.get("name") or email
    picture = idinfo.get("picture")

    user_id, remember_me = await _upsert_google_user(email, name, picture)
    session_token = await _create_session_and_set_cookie(response, user_id, remember_me)
    return {
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "session_token": session_token,
    }

@api_router.get("/auth/me")
async def me(request: Request, response: Response, user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if user_doc and user_doc.get("remember_me", True):
        token = request.cookies.get("session_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if token:
            new_expires = datetime.now(timezone.utc) + timedelta(days=30)
            await db.user_sessions.update_one(
                {"session_token": token},
                {"$set": {"expires_at": new_expires.isoformat()}}
            )
            _set_session_cookies(response, token, 30 * 24 * 3600)
    return user.model_dump(mode="json")

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    response.delete_cookie(SESSION_HINT_COOKIE, path="/", samesite="none", secure=True)
    return {"ok": True}

@api_router.get("/auth/preferences")
async def get_auth_prefs(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    return {"remember_me": bool(user_doc.get("remember_me", True)) if user_doc else True}

@api_router.put("/auth/preferences")
async def set_auth_prefs(
    payload: AuthPreferencesUpdate,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
):
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"remember_me": payload.remember_me}}
    )

    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]

    if token:
        if payload.remember_me:
            new_expires = datetime.now(timezone.utc) + timedelta(days=30)
            cookie_max_age = 30 * 24 * 3600
        else:
            new_expires = datetime.now(timezone.utc) + timedelta(days=1)
            cookie_max_age = None
        await db.user_sessions.update_one(
            {"session_token": token},
            {"$set": {"expires_at": new_expires.isoformat()}}
        )
        _set_session_cookies(response, token, cookie_max_age)
    return {"remember_me": payload.remember_me}

# -------------------- Live-Save Preference --------------------
@api_router.get("/me/live-save")
async def get_live_save(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    return {"live_save_enabled": bool(user_doc.get("live_save_enabled", False)) if user_doc else False}

@api_router.put("/me/live-save")
async def set_live_save(payload: LiveSaveUpdate, user: User = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"live_save_enabled": bool(payload.live_save_enabled)}}
    )
    return {"live_save_enabled": bool(payload.live_save_enabled)}

# -------------------- Hide-Boost-Buttons Preference --------------------
# Wenn aktiviert, blendet das Frontend auf den UserCards den "Boost"-Aktivieren-
# Button aus. Bereits geboostete Uebungen (Umrandung / "BOOST"-Pille / Cancel)
# bleiben weiterhin sichtbar.
@api_router.get("/me/hide-boost-buttons")
async def get_hide_boost_buttons(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    return {"hide_boost_buttons": bool(user_doc.get("hide_boost_buttons", False)) if user_doc else False}

@api_router.put("/me/hide-boost-buttons")
async def set_hide_boost_buttons(payload: HideBoostButtonsUpdate, user: User = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"hide_boost_buttons": bool(payload.hide_boost_buttons)}}
    )
    return {"hide_boost_buttons": bool(payload.hide_boost_buttons)}

# -------------------- Custom Steps (Schrittweiten) --------------------
# Pro User wird ein Dictionary { exerciseKey: stepValue } persistiert,
# damit die im Dashboard ("Fortschritt eintragen") eingestellten
# Schrittweiten der + / – Buttons geräteübergreifend identisch sind.
def _sanitize_custom_steps(raw: dict) -> dict:
    out = {}
    if not isinstance(raw, dict):
        return out
    for k, v in raw.items():
        if not isinstance(k, str) or not k:
            continue
        try:
            n = float(v)
        except (TypeError, ValueError):
            continue
        if n > 0 and n < 1_000_000:
            # Ganze Zahlen ohne Nachkommastellen sauber als int speichern
            out[k] = int(n) if n.is_integer() else n
    return out

@api_router.get("/me/custom-steps")
async def get_custom_steps(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    steps = (user_doc or {}).get("custom_steps") or {}
    return {"custom_steps": _sanitize_custom_steps(steps)}

@api_router.put("/me/custom-steps")
async def set_custom_steps(payload: CustomStepsUpdate, user: User = Depends(get_current_user)):
    cleaned = _sanitize_custom_steps(payload.custom_steps)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"custom_steps": cleaned}}
    )
    return {"custom_steps": cleaned}


# -------------------- Eigene Daten: Export + Konto löschen (DSGVO, App-Stores) --------------------
@api_router.get("/me/export")
async def export_my_data(user: User = Depends(get_current_user)):
    """Alle eigenen Daten als JSON (Recht auf Auskunft/Datenübertragbarkeit)."""
    uid = user.user_id
    udoc = await db.users.find_one({"user_id": uid}, {"_id": 0}) or {}
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": udoc,
        "goals": await db.user_goals.find_one({"user_id": uid}, {"_id": 0}),
        "progress": await db.progress_entries.find({"user_id": uid}, {"_id": 0}).to_list(5000),
        "emojis_sent": await db.emojis.find({"from_user_id": uid}, {"_id": 0}).to_list(5000),
        "emojis_received": await db.emojis.find({"to_user_id": uid}, {"_id": 0}).to_list(5000),
        "challenges": await db.challenges.find(_challenge_query_for(uid), {"_id": 0}).to_list(5000),
        "feedback": await db.feedback.find({"user_id": uid}, {"_id": 0}).to_list(500),
    }


class AccountDelete(BaseModel):
    confirm: str  # eigener Code (Handle) zur Bestätigung


@api_router.post("/me/delete")
async def delete_my_account(payload: AccountDelete, request: Request, response: Response,
                            user: User = Depends(get_current_user)):
    """Konto endgültig löschen: Nutzer, Sitzungen, Ziele, Einträge, Reaktionen, Challenges,
    gesehene Effekte, Feedback – und aus allen Crews/Anfragen anderer entfernen."""
    udoc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "handle": 1}) or {}
    if (payload.confirm or "").strip().lstrip("#").upper() != (udoc.get("handle") or "").upper():
        raise HTTPException(status_code=400, detail="Bitte deinen Code zur Bestätigung eingeben")
    uid = user.user_id
    audience = await _audience(uid)
    await db.users.update_many({"friends": uid}, {"$pull": {"friends": uid, "friend_order": uid}})
    await db.users.update_many({"friend_order": uid}, {"$pull": {"friend_order": uid}})
    await db.users.update_many({"friend_requests_in.from": uid}, {"$pull": {"friend_requests_in": {"from": uid}}})
    await db.user_sessions.delete_many({"user_id": uid})
    await db.user_goals.delete_many({"user_id": uid})
    await db.progress_entries.delete_many({"user_id": uid})
    await db.emojis.delete_many({"$or": [{"from_user_id": uid}, {"to_user_id": uid}]})
    await db.challenges.delete_many({"$or": [{"from_user_id": uid}, {"to_user_id": uid}]})
    await db.challenges.update_many({"participants.user_id": uid}, {"$pull": {"participants": {"user_id": uid}}})
    await db.seen_effects.delete_many({"$or": [{"viewer_user_id": uid}, {"target_user_id": uid}]})
    await db.feedback.delete_many({"user_id": uid})
    await db.push_subscriptions.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    # Crew aktualisiert ihr Board (die Karte verschwindet)
    await manager.send_to(audience - {uid}, {"type": "goals_updated", "user_id": uid})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    response.delete_cookie(SESSION_HINT_COOKIE, path="/", samesite="none", secure=True)
    return {"ok": True}

# -------------------- Sprache --------------------
class LanguageUpdate(BaseModel):
    language: str


@api_router.put("/me/language")
async def set_language(payload: LanguageUpdate, user: User = Depends(get_current_user)):
    lang = i18n_messages.normalize(payload.language)
    if not lang:
        raise HTTPException(status_code=400, detail="Ungültiger Wert")
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"language": lang}})
    # Unveränderte Standard-Übungen gleich mit umbenennen (Lauf -> Running ...).
    g = await _load_goals(user.user_id)
    exercises = g.get("exercises", [])
    before = [e.get("name") for e in exercises]
    _rename_defaults(exercises, lang)
    if [e.get("name") for e in exercises] != before:
        await db.user_goals.update_one({"user_id": user.user_id}, {"$set": {"exercises": exercises}})
        await _notify(user.user_id, {"type": "goals_updated", "user_id": user.user_id})
    return {"language": lang}


# -------------------- Profile --------------------
@api_router.put("/profile")
async def update_profile(payload: ProfileUpdate, user: User = Depends(get_current_user)):
    update = {}
    if payload.name is not None and payload.name.strip():
        update["name"] = payload.name.strip()[:80]
    if payload.picture is not None:
        p = payload.picture
        if len(p) > 700_000:
            raise HTTPException(status_code=400, detail="Bild zu groß (max ~500KB)")
        update["picture"] = p
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"user_id": user.user_id}, {"$set": update})
    await _notify(user.user_id, {"type": "profile_updated", "user_id": user.user_id})
    updated = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    return updated
