"""Crew: Freunde und Anfragen, Emojis, Challenges.

Teil von server.py (aufgeteilt 2026-11-25, BACKLOG W1)."""
from fastapi import HTTPException, Depends
import math
from pydantic import BaseModel, field_validator
from typing import Optional, List
import uuid
import secrets
from datetime import datetime, timezone, timedelta
import i18n_messages
from core import FriendAddRequest, FriendJoinRequest, FriendOrderUpdate, FriendRequestAnswer, FriendRequestsSetting, User, _challenge_query_for, _clean_variant_text, _normalize_exercise_colors, _notify, _picture_ref, _rename_defaults, api_router, db, get_current_user, manager
from goals import _compute_user_state, _current_week_of, _exercise_status, _get_pct_for_week, _load_goals, _new_exercise_key, _round_goal, _starts_on, _week_monday, get_my_goals

# -------------------- Emojis schicken (Plan 12c, Dean 2026-11-25) --------------------
# db.emojis: {id, from_user_id, to_user_id, emoji, at, seen}. Auf der Karte eines Crew-Mitglieds
# per Sprechblasen-Knopf ein Emoji schicken. Der Empfänger sieht es live (WebSocket) oder beim
# nächsten Besuch (unseen). Gegen Spam: je Paar höchstens 1 alle EMOJI_PAIR_COOLDOWN_S Sekunden,
# je Absender höchstens EMOJI_DAILY_MAX am Tag.
EMOJIS = ("😂", "😢", "🔥", "😎", "💪", "👏")
EMOJI_PAIR_COOLDOWN_S = 3
EMOJI_DAILY_MAX = 60


class EmojiSend(BaseModel):
    to_user_id: str
    emoji: str

    @field_validator("emoji")
    @classmethod
    def _check_emoji(cls, v):
        if v not in EMOJIS:
            raise ValueError("unknown emoji")
        return v


@api_router.post("/emoji")
async def send_emoji(payload: EmojiSend, user: User = Depends(get_current_user)):
    if payload.to_user_id == user.user_id:
        raise HTTPException(status_code=400, detail="Auf dich selbst kannst du nicht reagieren")
    if payload.to_user_id not in await _get_friend_ids_ordered(user.user_id):
        raise HTTPException(status_code=404, detail="Nicht in deiner Crew")
    now = datetime.now(timezone.utc)
    last = await db.emojis.find_one({"from_user_id": user.user_id, "to_user_id": payload.to_user_id},
                                    {"_id": 0, "at": 1}, sort=[("at", -1)])
    if last and (now - datetime.fromisoformat(last["at"])).total_seconds() < EMOJI_PAIR_COOLDOWN_S:
        raise HTTPException(status_code=429, detail="Kurz warten")
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    if await db.emojis.count_documents({"from_user_id": user.user_id, "at": {"$gte": day_start}}) >= EMOJI_DAILY_MAX:
        raise HTTPException(status_code=429, detail="Kurz warten")
    doc = {"id": uuid.uuid4().hex[:12], "from_user_id": user.user_id, "to_user_id": payload.to_user_id,
           "emoji": payload.emoji, "at": now.isoformat(), "seen": False}
    await db.emojis.insert_one(dict(doc))
    await manager.send_to({payload.to_user_id}, {
        "type": "emoji", "id": doc["id"], "from_user_id": user.user_id, "from_name": user.name,
        "emoji": payload.emoji})
    return {"ok": True, "id": doc["id"]}


@api_router.get("/me/emojis/unseen")
async def unseen_emojis(user: User = Depends(get_current_user)):
    """Verpasste Emojis der letzten 7 Tage (höchstens 20, älteste zuerst) mit Absender-Namen."""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    rows = await db.emojis.find({"to_user_id": user.user_id, "seen": False, "at": {"$gte": since}},
                                {"_id": 0}).sort("at", 1).to_list(20)
    names = {u["user_id"]: u.get("name") for u in await db.users.find(
        {"user_id": {"$in": list({r["from_user_id"] for r in rows})}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(50)}
    return {"items": [{"id": r["id"], "emoji": r["emoji"], "from_user_id": r["from_user_id"],
                       "from_name": names.get(r["from_user_id"], "?"), "at": r["at"]} for r in rows]}


class EmojiSeen(BaseModel):
    ids: List[str]


@api_router.post("/me/emojis/seen")
async def mark_emojis_seen(payload: EmojiSeen, user: User = Depends(get_current_user)):
    await db.emojis.update_many({"to_user_id": user.user_id, "id": {"$in": payload.ids[:100]}}, {"$set": {"seen": True}})
    return {"ok": True}


# -------------------- Crew-Challenges (Plan 12e, Gruppen seit 2026-11-25) --------------------
# db.challenges: {id, kind: "duel"|"team", monday (ISO-Datum der Kalenderwoche), from_user_id (Ersteller),
#   participants: [{user_id, key, status: "accepted"|"invited"|"declined"}], target (nur team),
#   created_at, result (eingefroren, sobald die Woche vorbei ist)}.
# Alte Einträge (from_user_id/to_user_id/from_key/to_key/status) werden beim Lesen umgedeutet.
# Duell = wer schafft am meisten (2+ Leute), gemeinsam = zusammen ein Ziel.
# Gezählt wird die Kalenderwoche (Mo–So), bei jedem in seiner eigenen Programmwoche dazu.
CHALLENGE_KINDS = ("duel", "team")
CHALLENGE_MAX_INVITES = 5
CHALLENGE_MAX_OPEN = 5  # je Ersteller und Woche
# Ready-Check (Dean 2026-11-26): 60 s zum Annehmen, danach „verpasst“ (missed). Angenommen = verbindlich.
CHALLENGE_ACCEPT_SECONDS = 60
CHALLENGE_ACCEPT_GRACE = 5  # Netz-Verzögerung beim Antippen kurz vor Schluss


def _invite_left(c: dict) -> float:
    """Sekunden, die zum Annehmen noch bleiben (alte Challenges ohne Zeitpunkt: unbegrenzt)."""
    try:
        created = datetime.fromisoformat(c["created_at"])
    except (KeyError, TypeError, ValueError):
        return float(CHALLENGE_ACCEPT_SECONDS)
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return CHALLENGE_ACCEPT_SECONDS - (datetime.now(timezone.utc) - created).total_seconds()


async def _expire_invites(c: dict) -> dict:
    """Offene Einladungen nach Ablauf der Frist auf „missed“ setzen (und speichern)."""
    if not c.get("participants") or _invite_left(c) + CHALLENGE_ACCEPT_GRACE > 0:
        return c
    parts = [dict(p, status="missed") if p["status"] == "invited" else p for p in c["participants"]]
    if parts != c["participants"]:
        await db.challenges.update_one({"id": c["id"]}, {"$set": {"participants": parts}})
        c = dict(c, participants=parts)
    return c


def _this_monday():
    now = datetime.now(timezone.utc)
    wd = now.weekday()
    return (now - timedelta(days=wd)).date()


def _program_week_for_monday(g: dict, monday) -> int:
    start_monday = _week_monday(g, 1)
    return (monday - start_monday).days // 7 + 1


async def _challenge_value(user_id: str, key: Optional[str], monday) -> float:
    if not key:
        return 0.0
    g = await _load_goals(user_id)
    w = _program_week_for_monday(g, monday)
    if w < 1:
        return 0.0
    pe = await db.progress_entries.find_one({"user_id": user_id, "week_number": w}, {"_id": 0})
    if not pe:
        return 0.0
    if pe.get("days"):
        return round(sum(float((d or {}).get(key, 0) or 0) for d in pe["days"].values() if isinstance(d, dict)), 2)
    return round(float((pe.get("values") or {}).get(key, 0) or 0), 2)


def _ex_brief(g: dict, key: Optional[str]) -> Optional[dict]:
    ex = next((e for e in g.get("exercises", []) if e["key"] == key), None)
    if not ex:
        return None
    return {"key": ex["key"], "name": ex["name"], "unit": ex.get("unit", ""), "icon": ex.get("icon", "pushup"),
            "color": ex.get("color", "#CCFF00"), "variant": ex.get("variant", "")}


def _same_unit(a: str, b: str) -> bool:
    return (a or "").strip().lower().rstrip(".") == (b or "").strip().lower().rstrip(".")


def _participants(c: dict) -> list:
    """Teilnehmer-Liste; alte 1:1-Einträge werden umgedeutet."""
    if c.get("participants"):
        return [dict(p) for p in c["participants"]]
    old = c.get("status")
    to_status = "accepted" if old == "accepted" else "declined" if old == "declined" else "invited"
    return [{"user_id": c["from_user_id"], "key": c.get("from_key"), "status": "accepted"},
            {"user_id": c.get("to_user_id"), "key": c.get("to_key"), "status": to_status}]


def _challenge_status(c: dict, parts: list, over: bool) -> str:
    accepted_others = [p for p in parts if p["status"] == "accepted" and p["user_id"] != c["from_user_id"]]
    invited = [p for p in parts if p["status"] == "invited"]
    if accepted_others:
        return "finished" if over else "active"
    if invited:
        return "expired" if over else "pending"
    if any(p["status"] == "missed" for p in parts):
        return "expired"
    return "declined"


async def _challenge_out(c: dict, viewer_id: str) -> dict:
    monday = datetime.fromisoformat(c["monday"]).date()
    over = monday + timedelta(days=7) <= _this_monday()
    parts = _participants(c)
    status = _challenge_status(c, parts, over)
    ids = [p["user_id"] for p in parts]
    names = {u["user_id"]: u.get("name", "?") for u in await db.users.find(
        {"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(20)}
    creator_g = await _load_goals(c["from_user_id"])
    creator_key = next((p.get("key") for p in parts if p["user_id"] == c["from_user_id"]), None)
    ex = c.get("ex") or _ex_brief(creator_g, creator_key)
    frozen = c.get("result") or {}
    out_parts = []
    for p in parts:
        val = None
        if p["status"] == "accepted" and status in ("active", "finished"):
            if frozen and p["user_id"] in frozen.get("values", {}):
                val = frozen["values"][p["user_id"]]
            else:
                val = await _challenge_value(p["user_id"], p.get("key"), monday)
        out_parts.append({"user_id": p["user_id"], "name": names.get(p["user_id"], "?"), "status": p["status"],
                          "value": val, "me": p["user_id"] == viewer_id})
    me = next((p for p in parts if p["user_id"] == viewer_id), None)
    out = {"id": c["id"], "kind": c["kind"], "monday": c["monday"], "status": status,
           "creator_id": c["from_user_id"], "my_status": me["status"] if me else None,
           "ex": ex, "target": c.get("target"), "created_at": c.get("created_at"), "participants": out_parts,
           "winners": None, "leaders": None, "team_total": None,
           # Ready-Check: so viele Sekunden bleiben noch zum Annehmen (nur für Eingeladene)
           "accept_seconds": CHALLENGE_ACCEPT_SECONDS,
           "expires_in": round(max(0.0, _invite_left(c)), 1) if me and me["status"] == "invited" else None}
    if status in ("active", "finished"):
        counted = [p for p in out_parts if p["value"] is not None]
        total = round(sum(p["value"] for p in counted), 2)
        if c["kind"] == "duel":
            best = max((p["value"] for p in counted), default=0)
            top = [p["user_id"] for p in counted if p["value"] == best and best > 0]
        else:
            top = ["team"] if total >= float(c.get("target") or 0) else []
        out["team_total"] = total
        out["winners" if status == "finished" else "leaders"] = top
        if status == "finished" and not c.get("result"):
            # Ergebnis einfrieren (spätere Änderungen an alten Wochen ändern die Historie nicht)
            await db.challenges.update_one({"id": c["id"]}, {"$set": {
                "result": {"values": {p["user_id"]: p["value"] for p in counted}, "winners": top}, "ex": ex}})
    return out


class ChallengeCreate(BaseModel):
    to_user_ids: Optional[List[str]] = None
    to_user_id: Optional[str] = None  # alte Clients: nur eine Person
    kind: str
    from_key: str
    target: Optional[float] = None

    @field_validator("kind")
    @classmethod
    def _check_kind(cls, v):
        if v not in CHALLENGE_KINDS:
            raise ValueError("kind must be duel|team")
        return v

    @field_validator("target")
    @classmethod
    def _check_target(cls, v):
        if v is not None and (not math.isfinite(v) or v <= 0 or v > 10_000_000):
            raise ValueError("invalid target")
        return v


class ChallengeAccept(BaseModel):
    to_key: str


@api_router.get("/challenges")
async def list_challenges(user: User = Depends(get_current_user)):
    rows = await db.challenges.find(_challenge_query_for(user.user_id), {"_id": 0}).to_list(500)
    rows = [await _expire_invites(c) for c in rows]
    rows.sort(key=lambda c: (c.get("monday", ""), c.get("created_at", "")), reverse=True)
    return {"challenges": [await _challenge_out(c, user.user_id) for c in rows]}


@api_router.post("/challenges")
async def create_challenge(payload: ChallengeCreate, user: User = Depends(get_current_user)):
    """Herausforderung an ein oder mehrere Crew-Mitglieder für diese Kalenderwoche."""
    targets = list(dict.fromkeys((payload.to_user_ids or []) + ([payload.to_user_id] if payload.to_user_id else [])))
    if not targets:
        raise HTTPException(status_code=400, detail="Wen willst du herausfordern?")
    if user.user_id in targets:
        raise HTTPException(status_code=400, detail="Dich selbst kannst du nicht herausfordern")
    if len(targets) > CHALLENGE_MAX_INVITES:
        raise HTTPException(status_code=400, detail="Höchstens 5 Leute pro Herausforderung")
    friends = set(await _get_friend_ids_ordered(user.user_id))
    if any(t not in friends for t in targets):
        raise HTTPException(status_code=404, detail="Nicht in deiner Crew")
    g = await _load_goals(user.user_id)
    ex = next((e for e in g.get("exercises", []) if e["key"] == payload.from_key), None)
    if not ex or _exercise_status(ex) != "active":
        raise HTTPException(status_code=404, detail="Übung nicht gefunden")
    if payload.kind == "team" and not payload.target:
        raise HTTPException(status_code=400, detail="Bitte ein gemeinsames Ziel angeben")
    monday = _this_monday().isoformat()
    if await db.challenges.count_documents({"monday": monday, "from_user_id": user.user_id}) >= CHALLENGE_MAX_OPEN:
        raise HTTPException(status_code=400, detail="Diese Woche läuft schon eine Herausforderung mit dieser Person")
    c = {"id": uuid.uuid4().hex[:12], "kind": payload.kind, "monday": monday, "from_user_id": user.user_id,
         "participants": [{"user_id": user.user_id, "key": payload.from_key, "status": "accepted"}]
         + [{"user_id": t, "key": None, "status": "invited"} for t in targets],
         "target": _round_goal(payload.target, ex.get("unit", "")) if payload.kind == "team" else None,
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.challenges.insert_one(dict(c))
    for t in targets:
        await manager.send_to({t}, {"type": "challenge", "event": "created", "id": c["id"],
                                    "from_user_id": user.user_id, "from_name": user.name, "to_user_id": t})
    await manager.send_to({user.user_id}, {"type": "challenge", "event": "created", "id": c["id"]})
    return await _challenge_out(c, user.user_id)


async def _get_challenge_for(cid: str, user: User) -> dict:
    c = await db.challenges.find_one({"id": cid}, {"_id": 0})
    if not c or user.user_id not in {p["user_id"] for p in _participants(c)}:
        raise HTTPException(status_code=404, detail="Herausforderung nicht gefunden")
    return await _expire_invites(c)


def _set_participant(c: dict, uid: str, **changes) -> list:
    parts = _participants(c)
    for p in parts:
        if p["user_id"] == uid:
            p.update(changes)
    return parts


@api_router.post("/challenges/{cid}/accept")
async def accept_challenge(cid: str, payload: ChallengeAccept, user: User = Depends(get_current_user)):
    c = await _get_challenge_for(cid, user)
    me = next(p for p in _participants(c) if p["user_id"] == user.user_id)
    if me["status"] == "missed":
        raise HTTPException(status_code=400, detail="Zu spät – die Zeit zum Annehmen ist abgelaufen")
    if me["status"] != "invited" or c["monday"] != _this_monday().isoformat():
        raise HTTPException(status_code=400, detail="Diese Herausforderung kann nicht mehr angenommen werden")
    g = await _load_goals(user.user_id)
    ex = next((e for e in g.get("exercises", []) if e["key"] == payload.to_key), None)
    if not ex or _exercise_status(ex) != "active":
        raise HTTPException(status_code=404, detail="Übung nicht gefunden")
    creator_key = next((p.get("key") for p in _participants(c) if p["user_id"] == c["from_user_id"]), None)
    fex = _ex_brief(await _load_goals(c["from_user_id"]), creator_key)
    if fex and not _same_unit(fex["unit"], ex.get("unit", "")):
        raise HTTPException(status_code=400, detail="Die Einheiten passen nicht zusammen")
    parts = _set_participant(c, user.user_id, status="accepted", key=payload.to_key)
    await db.challenges.update_one({"id": cid}, {"$set": {"participants": parts}})
    c["participants"] = parts
    for p in parts:
        if p["user_id"] != user.user_id:
            await manager.send_to({p["user_id"]}, {"type": "challenge", "event": "accepted", "id": cid,
                                                   "from_user_id": user.user_id, "from_name": user.name,
                                                   "to_user_id": p["user_id"]})
    await manager.send_to({user.user_id}, {"type": "challenge", "event": "accepted", "id": cid})
    return await _challenge_out(c, user.user_id)


@api_router.post("/challenges/{cid}/decline")
async def decline_challenge(cid: str, user: User = Depends(get_current_user)):
    c = await _get_challenge_for(cid, user)
    me = next(p for p in _participants(c) if p["user_id"] == user.user_id)
    if me["status"] != "invited":
        raise HTTPException(status_code=400, detail="Diese Herausforderung kann nicht mehr angenommen werden")
    parts = _set_participant(c, user.user_id, status="declined")
    await db.challenges.update_one({"id": cid}, {"$set": {"participants": parts}})
    c["participants"] = parts
    await manager.send_to({c["from_user_id"]}, {"type": "challenge", "event": "declined", "id": cid,
                                                "from_user_id": user.user_id, "from_name": user.name,
                                                "to_user_id": c["from_user_id"]})
    await manager.send_to({user.user_id}, {"type": "challenge", "event": "declined", "id": cid})
    return await _challenge_out(c, user.user_id)


@api_router.delete("/challenges/{cid}")
async def withdraw_challenge(cid: str, user: User = Depends(get_current_user)):
    """Eigene Herausforderung zurückziehen, solange noch niemand angenommen hat."""
    c = await _get_challenge_for(cid, user)
    parts = _participants(c)
    if c["from_user_id"] != user.user_id or any(p["status"] == "accepted" and p["user_id"] != user.user_id for p in parts):
        raise HTTPException(status_code=400, detail="Diese Herausforderung kann nicht mehr zurückgezogen werden")
    await db.challenges.delete_one({"id": cid})
    await manager.send_to({p["user_id"] for p in parts}, {"type": "challenge", "event": "withdrawn", "id": cid})
    return {"ok": True}


class PauseAll(BaseModel):
    action: str  # "pause" | "resume"

    @field_validator("action")
    @classmethod
    def _a(cls, v):
        if v not in ("pause", "resume"):
            raise ValueError("action must be pause|resume")
        return v


@api_router.post("/goals/me/pause-all")
async def pause_all(payload: PauseAll, user: User = Depends(get_current_user)):
    """Alle aktiven Übungen auf einmal pausieren bzw. alle pausierten fortsetzen (ab dieser Woche).
    Ersetzt den früheren Urlaub/Krank-Modus: Wochen ganz ohne aktive Übung unterbrechen die Streak nicht."""
    g = await _load_goals(user.user_id)
    cur_week = _current_week_of(g)
    exercises = g.get("exercises", [])
    changed = []
    for ex in exercises:
        status = _exercise_status(ex)
        pauses = [dict(p) for p in (ex.get("pauses") or []) if isinstance(p, dict)]
        if payload.action == "pause" and status == "active":
            pauses.append({"from_week": cur_week, "to_week": None})
            changed.append(ex["key"])
        elif payload.action == "resume" and status == "paused":
            for p in pauses:
                if p.get("to_week") is None:
                    p["to_week"] = max(int(p.get("from_week") or 0), cur_week)
            pauses = [p for p in pauses if int(p.get("to_week") or 0) > int(p.get("from_week") or 0)]
            changed.append(ex["key"])
        ex["pauses"] = pauses
    boosts = g.get("boosts", [])
    if payload.action == "pause":
        boosts = [b for b in boosts if not (b.get("exercise_key") in changed and b.get("week_number") == cur_week)]
    await db.user_goals.update_one({"user_id": user.user_id}, {"$set": {"exercises": exercises, "boosts": boosts}})
    await _notify(user.user_id, {"type": "goals_updated", "user_id": user.user_id})
    return await get_my_goals(user)


class ExerciseUpgrade(BaseModel):
    variant: str
    start_value: Optional[float] = None  # leer = 60 % des aktuellen Ziels

    @field_validator("variant", mode="before")
    @classmethod
    def _clean_variant(cls, v):
        return _clean_variant_text(v)

    @field_validator("start_value")
    @classmethod
    def _check_start(cls, v):
        if v is None:
            return v
        if not math.isfinite(v) or v < 0 or v > 1_000_000:
            raise ValueError("Ungültiger Startwert")
        return v


UPGRADE_START_FACTOR = 0.6


@api_router.post("/goals/me/exercises/{key}/upgrade")
async def upgrade_exercise(key: str, payload: ExerciseUpgrade, user: User = Depends(get_current_user)):
    """Auf eine Variante umsteigen (z. B. "Liegestütze" -> "Liegestütze · +10 kg"),
    in einem Schritt: die bisherige Übung wird abgeschlossen (Historie bleibt im
    Archiv), die Variante startet ab dieser Woche als neue Übung mit neuem Schlüssel,
    gleichem Namen, Icon, Einheit, Steigerung und Farbe."""
    g = await _load_goals(user.user_id)
    cur_week = _current_week_of(g)
    exercises = g.get("exercises", [])
    idx = next((i for i, e in enumerate(exercises) if e["key"] == key), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Übung nicht gefunden")
    old = exercises[idx]
    status = _exercise_status(old)
    if status == "completed":
        raise HTTPException(status_code=400, detail="Abgeschlossene Übungen können nicht gewechselt werden")
    if old.get("type") == "activity":
        raise HTTPException(status_code=400, detail="Aktivitäten haben keine Varianten")
    variant = payload.variant
    # Leere Variante = zurück zur Grundübung (Dean, 2026-11-25: auch „kleiner“ muss gehen)
    if variant == (old.get("variant") or ""):
        raise HTTPException(status_code=400, detail="Variante fehlt oder ist unverändert")

    unit = old.get("unit", "")
    if payload.start_value is None:
        state = await _compute_user_state(user.user_id, g, cur_week)
        last_goal = float(state.get(key, {}).get("current_goal") or old.get("base_value") or 0)
        start = _round_goal(last_goal * UPGRADE_START_FACTOR, unit)
    else:
        start = _round_goal(float(payload.start_value), unit)

    # Alte Übung abschließen (wie /status "complete").
    pauses = [dict(p) for p in (old.get("pauses") or []) if isinstance(p, dict)]
    if status == "active":
        pauses.append({"from_week": cur_week, "to_week": None})
    old["pauses"] = pauses
    old["archived"] = True

    used = set(g.get("used_keys") or []) | {e["key"] for e in exercises}
    new_key = _new_exercise_key(used)
    used.add(new_key)
    pct = _get_pct_for_week(old, cur_week)
    new = {
        "key": new_key,
        "name": old.get("name", ""),
        "unit": unit,
        "icon": old.get("icon", "pushup"),
        "color": old.get("color"),
        "variant": variant,
        "base_value": start,
        "progression_pct": pct,
        "added_week": cur_week,
        "is_default": False,
        "progression_overrides": [{"from_week": cur_week, "pct": pct}],
        "goal_overrides": [],
        "pauses": [],
        "archived": False,
        "upgraded_from": key,
    }
    # Die Variante steht dort, wo die alte Übung stand, und behält deren Farbe;
    # die abgeschlossene Übung bekommt bei Bedarf eine freie Farbe.
    exercises.insert(idx, new)
    _normalize_exercise_colors(exercises)
    boosts = [b for b in g.get("boosts", [])
              if not (b.get("exercise_key") == key and b.get("week_number") == cur_week)]
    await db.user_goals.update_one(
        {"user_id": user.user_id},
        {"$set": {"exercises": exercises, "boosts": boosts, "used_keys": sorted(used)}},
    )
    await _notify(user.user_id, {"type": "goals_updated", "user_id": user.user_id})
    return await get_my_goals(user)


@api_router.post("/goals/me/reset-start")
async def reset_start_date(user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    g = await db.user_goals.find_one({"user_id": user.user_id}, {"_id": 0})
    exercises = g.get("exercises", []) if g else []
    for ex in exercises:
        ex["progression_last_changed_week"] = 1
        ex["added_week"] = 1
        # Override-History zurücksetzen: Programm-Neustart -> aktueller pct gilt ab Woche 1
        try:
            init_pct = int(round(float(ex.get("progression_pct", 10))))
        except (TypeError, ValueError):
            init_pct = 10
        init_pct = max(0, min(10, init_pct))
        ex["progression_overrides"] = [{"from_week": 1, "pct": init_pct}]
    await db.user_goals.update_one(
        {"user_id": user.user_id},
        {"$set": {"start_date": now, "exercises": exercises, "rules_from_week": 1, "pause_loss_from_week": 1}},
    )
    await db.progress_entries.delete_many({"user_id": user.user_id})
    await db.user_goals.update_one(
        {"user_id": user.user_id},
        {"$set": {"boosts": []}},
    )
    await _notify(user.user_id, {"type": "goals_updated", "user_id": user.user_id})
    g = await db.user_goals.find_one({"user_id": user.user_id}, {"_id": 0})
    return g


def _next_monday(now: datetime) -> datetime:
    days = (7 - now.weekday()) % 7 or 7
    return (now + timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)


class OnboardingRequest(BaseModel):
    start: str = "now"                     # "now" | "monday"
    language: Optional[str] = None
    goals: dict = {}                       # {exercise_key: Startwert}
    progression_pct: Optional[int] = None  # für alle Startübungen


@api_router.post("/me/onboarding")
async def finish_onboarding(payload: OnboardingRequest, user: User = Depends(get_current_user)):
    """Abschluss des Einführungs-Tutorials: Startwerte und Startzeitpunkt setzen.
    "monday" = Programm beginnt am nächsten Montag (bis dahin kein Eintragen)."""
    g = await _load_goals(user.user_id)
    now = datetime.now(timezone.utc)
    start = _next_monday(now) if payload.start == "monday" and now.weekday() != 0 else now
    exercises = g.get("exercises", [])
    lang = i18n_messages.normalize(payload.language)
    if lang:
        _rename_defaults(exercises, lang)
        await db.users.update_one({"user_id": user.user_id}, {"$set": {"language": lang}})
    for ex in exercises:
        if ex["key"] in payload.goals:
            try:
                ex["base_value"] = max(0.0, float(payload.goals[ex["key"]]))
            except (TypeError, ValueError):
                pass
        if payload.progression_pct is not None:
            pct = max(0, min(10, int(payload.progression_pct)))
            ex["progression_pct"] = pct
            ex["progression_overrides"] = [{"from_week": 1, "pct": pct}]
        ex["added_week"] = 1
    await db.user_goals.update_one(
        {"user_id": user.user_id},
        {"$set": {"exercises": exercises, "start_date": start.isoformat(), "rules_from_week": 1,
                  "pause_loss_from_week": 1}},
    )
    await db.progress_entries.delete_many({"user_id": user.user_id})
    # Nach dem Einführungs-Dialog geht es mit der geführten Tour auf der echten Seite weiter.
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"onboarding_done": True, "tour_step": 0}})
    await _notify(user.user_id, {"type": "goals_updated", "user_id": user.user_id})
    return {"ok": True, "start_date": start.isoformat(), "starts_on": _starts_on({"start_date": start.isoformat()})}


TOUR_MAX_STEP = 20


class TourUpdate(BaseModel):
    step: int  # nächster Schritt (0 = von vorn), -1 = fertig oder übersprungen

    @field_validator("step")
    @classmethod
    def _check_step(cls, v):
        if v < -1 or v > TOUR_MAX_STEP:
            raise ValueError("Ungültiger Tour-Schritt")
        return v


@api_router.put("/me/tour")
async def set_tour_step(payload: TourUpdate, user: User = Depends(get_current_user)):
    """Fortschritt der geführten Tour am Konto speichern (gilt auf allen Geräten).
    Aus den Einstellungen ("Tour starten") wird mit step=0 neu begonnen."""
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"tour_step": payload.step}})
    return {"tour_step": payload.step}

# -------------------- Friends --------------------
async def _get_friend_ids_ordered(user_id: str) -> List[str]:
    udoc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "friends": 1, "friend_order": 1})
    if not udoc:
        return []
    friends = list(udoc.get("friends") or [])
    order = list(udoc.get("friend_order") or [])
    seen = set()
    result = []
    for uid in order:
        if uid in friends and uid not in seen:
            result.append(uid)
            seen.add(uid)
    for uid in friends:
        if uid not in seen:
            result.append(uid)
            seen.add(uid)
    return result

@api_router.get("/friends")
async def list_friends(user: User = Depends(get_current_user)):
    ordered_ids = await _get_friend_ids_ordered(user.user_id)
    if not ordered_ids:
        return {"friends": []}
    docs = await db.users.find({"user_id": {"$in": ordered_ids}}, {"_id": 0, "user_id": 1, "name": 1, "handle": 1, "picture": 1}).to_list(500)
    by_id = {d["user_id"]: d for d in docs}
    out = []
    for uid in ordered_ids:
        d = by_id.get(uid)
        if not d:
            continue
        out.append({
            "user_id": d["user_id"],
            "name": d.get("name", ""),
            "handle": d.get("handle"),
            "picture": _picture_ref(d["user_id"], d.get("picture")),
        })
    return {"friends": out}

@api_router.post("/friends/add")
async def add_friend(payload: FriendAddRequest, user: User = Depends(get_current_user)):
    handle = (payload.handle or "").strip().upper().lstrip("#")
    name = (payload.name or "").strip()
    if not handle or not name:
        raise HTTPException(status_code=400, detail="Name und Hashtag erforderlich")
    if len(handle) != 5:
        raise HTTPException(status_code=400, detail="Hashtag muss 5 Zeichen lang sein")

    target = await db.users.find_one({"handle": handle}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Kein User mit diesem Hashtag")
    if (target.get("name") or "").strip().lower() != name.lower():
        raise HTTPException(status_code=404, detail="Name passt nicht zum Hashtag")
    if target["user_id"] == user.user_id:
        raise HTTPException(status_code=400, detail="Dich selbst kannst du nicht hinzufügen")

    me_doc = await db.users.find_one(
        {"user_id": user.user_id}, {"_id": 0, "friends": 1, "friend_requests_in": 1}) or {}
    if target["user_id"] in (me_doc.get("friends") or []):
        raise HTTPException(status_code=400, detail="Bereits in deiner Crew")
    # Hat mir die Person selbst schon eine Anfrage geschickt? Dann einfach gegenseitig verbinden.
    if any(r.get("from") == target["user_id"] for r in (me_doc.get("friend_requests_in") or [])):
        await _connect_friends(target["user_id"], user.user_id)
        await _connect_friends(user.user_id, target["user_id"])
        await _drop_requests(user.user_id, target["user_id"])
        await manager.send_to({target["user_id"]}, {"type": "friend_accepted", "user_id": user.user_id})
        return {"ok": True, "status": "connected", "friend": _public_user(target)}
    if any(r.get("from") == user.user_id for r in (target.get("friend_requests_in") or [])):
        raise HTTPException(status_code=400, detail="Anfrage schon gesendet")
    if target.get("accept_friend_requests", True) is False:
        raise HTTPException(status_code=403, detail="Nimmt gerade keine Freundschaftsanfragen an")
    await db.users.update_one(
        {"user_id": target["user_id"]},
        {"$push": {"friend_requests_in": {"from": user.user_id, "at": datetime.now(timezone.utc).isoformat()}}},
    )
    await manager.send_to({target["user_id"]}, {"type": "friend_request", "user_id": user.user_id})
    return {"ok": True, "status": "requested", "friend": _public_user(target)}


def _public_user(doc: dict) -> dict:
    return {"user_id": doc["user_id"], "name": doc.get("name", ""),
            "handle": doc.get("handle"), "picture": _picture_ref(doc["user_id"], doc.get("picture"))}


async def _connect_friends(follower_id: str, target_id: str) -> None:
    """`follower` sieht `target` ab jetzt in seiner Crew (Freundschaft ist einseitig)."""
    if follower_id == target_id:
        return
    await db.users.update_one(
        {"user_id": follower_id},
        {"$addToSet": {"friends": target_id, "friend_order": target_id}},
    )


async def _drop_requests(a: str, b: str) -> None:
    """Offene Anfragen zwischen a und b (beide Richtungen) entfernen."""
    await db.users.update_one({"user_id": a}, {"$pull": {"friend_requests_in": {"from": b}}})
    await db.users.update_one({"user_id": b}, {"$pull": {"friend_requests_in": {"from": a}}})


@api_router.get("/friends/requests")
async def list_friend_requests(user: User = Depends(get_current_user)):
    """Eingehende Anfragen (mit Name/Code/Bild) und eigene, noch offene Anfragen."""
    me_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "friend_requests_in": 1}) or {}
    incoming = me_doc.get("friend_requests_in") or []
    ids = [r.get("from") for r in incoming]
    docs = await db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1, "handle": 1, "picture": 1}).to_list(500)
    by_id = {d["user_id"]: d for d in docs}
    out_in = [{**_public_user(by_id[r["from"]]), "at": r.get("at")} for r in incoming if r.get("from") in by_id]
    out_docs = await db.users.find(
        {"friend_requests_in.from": user.user_id},
        {"_id": 0, "user_id": 1, "name": 1, "handle": 1, "picture": 1},
    ).to_list(500)
    return {"incoming": out_in, "outgoing": [_public_user(d) for d in out_docs]}


@api_router.post("/friends/requests/{from_user_id}/accept")
async def accept_friend_request(from_user_id: str, payload: FriendRequestAnswer, user: User = Depends(get_current_user)):
    """Anfrage annehmen: der Anfragende sieht mich ab jetzt; mit `add_back` sehe ich ihn auch."""
    me_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "friend_requests_in": 1}) or {}
    if not any(r.get("from") == from_user_id for r in (me_doc.get("friend_requests_in") or [])):
        raise HTTPException(status_code=404, detail="Anfrage nicht gefunden")
    await _connect_friends(from_user_id, user.user_id)
    if payload.add_back:
        await _connect_friends(user.user_id, from_user_id)
    await _drop_requests(user.user_id, from_user_id)
    await manager.send_to({from_user_id}, {"type": "friend_accepted", "user_id": user.user_id})
    return {"ok": True}


@api_router.post("/friends/requests/{from_user_id}/decline")
async def decline_friend_request(from_user_id: str, user: User = Depends(get_current_user)):
    await db.users.update_one({"user_id": user.user_id}, {"$pull": {"friend_requests_in": {"from": from_user_id}}})
    return {"ok": True}


INVITE_DAYS = 7  # Einladungslinks gelten eine Woche (Dean 2026-11-27)


def _invite_expires(inv: dict) -> Optional[datetime]:
    try:
        created = inv.get("created_at")
        if isinstance(created, str):
            created = datetime.fromisoformat(created)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return created + timedelta(days=INVITE_DAYS)
    except Exception:
        return None


@api_router.get("/me/invite")
async def get_invite(user: User = Depends(get_current_user)):
    """Aktueller Einladungslink-Code (eine Woche gültig). Abgelaufen -> neuer Code."""
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "invite": 1}) or {}
    inv = doc.get("invite") or {}
    exp = _invite_expires(inv) if inv.get("code") else None
    now = datetime.now(timezone.utc)
    # Läuft er bald ab (< 1 Tag), gleich einen frischen ausgeben, damit geteilte Links nicht sofort verfallen
    if not exp or exp - now < timedelta(days=1):
        inv = {"code": secrets.token_urlsafe(7).replace("-", "x").replace("_", "y")[:10], "created_at": now.isoformat()}
        await db.users.update_one({"user_id": user.user_id}, {"$set": {"invite": inv}})
        exp = _invite_expires(inv)
    return {"code": inv["code"], "expires_at": exp.isoformat()}


@api_router.post("/friends/join")
async def join_via_invite(payload: FriendJoinRequest, user: User = Depends(get_current_user)):
    """Einladungslink /join/<CODE>: der Besitzer teilt ihn bewusst, daher sofort
    gegenseitig verbunden – auch wenn er Anfragen per Code ausgeschaltet hat.
    Der Code im Link gilt eine Woche (alte Links mit dem festen 5er-Code gelten nicht mehr)."""
    code = (payload.handle or "").strip()
    target = await db.users.find_one({"invite.code": code}, {"_id": 0}) if len(code) == 10 else None
    if not target:
        raise HTTPException(status_code=404, detail="Einladungslink ungültig")
    exp = _invite_expires(target.get("invite") or {})
    if not exp or exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Einladungslink abgelaufen")
    if target["user_id"] == user.user_id:
        raise HTTPException(status_code=400, detail="Dich selbst kannst du nicht hinzufügen")
    await _connect_friends(user.user_id, target["user_id"])
    await _connect_friends(target["user_id"], user.user_id)
    await _drop_requests(user.user_id, target["user_id"])
    await manager.send_to({target["user_id"]}, {"type": "friend_joined", "user_id": user.user_id})
    return {"ok": True, "friend": _public_user(target)}


@api_router.get("/me/friend-requests-setting")
async def get_friend_requests_setting(user: User = Depends(get_current_user)):
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "accept_friend_requests": 1}) or {}
    return {"accept": doc.get("accept_friend_requests", True) is not False}


@api_router.put("/me/friend-requests-setting")
async def set_friend_requests_setting(payload: FriendRequestsSetting, user: User = Depends(get_current_user)):
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"accept_friend_requests": bool(payload.accept)}})
    return {"accept": bool(payload.accept)}

@api_router.delete("/friends/{friend_user_id}")
async def remove_friend(friend_user_id: str, user: User = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$pull": {"friends": friend_user_id, "friend_order": friend_user_id}},
    )
    return {"ok": True}

@api_router.put("/friends/order")
async def reorder_friends(payload: FriendOrderUpdate, user: User = Depends(get_current_user)):
    me_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "friends": 1})
    friends = set((me_doc or {}).get("friends") or [])
    cleaned = []
    seen = set()
    for uid in payload.order:
        if uid in friends and uid not in seen:
            cleaned.append(uid)
            seen.add(uid)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"friend_order": cleaned}},
    )
    return {"ok": True, "order": cleaned}
