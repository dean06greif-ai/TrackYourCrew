"""Fortschritt eintragen, Crew-Board, Ziel-Vorschläge, gesehene Animationen, Meilensteine, Auswertung.

Teil von server.py (aufgeteilt 2026-11-25, BACKLOG W1)."""
from fastapi import HTTPException, Depends
import re
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime, timezone
from core import ProgressUpdate, User, _notify, _picture_ref, api_router, db, get_current_user, manager
from goals import _calc_week_number, _compute_user_state, _current_week_of, _exercise_status, _get_pct_for_week, _load_goals, _progress_by_week, _round_goal, _starts_on
from social import _get_friend_ids_ordered

# -------------------- Progress --------------------
async def _week_done(user_id: str, g: dict, week: int) -> bool:
    """Hat der Nutzer in `week` alle aktiven Übungen geschafft?"""
    pbw = await _progress_by_week(user_id, g["exercises"])
    state = await _compute_user_state(user_id, g, week, pbw)
    return week in _streak_info(state, g["exercises"], pbw, week)["completed_weeks"]


@api_router.get("/progress/me")
async def my_progress(week: Optional[int] = None, user: User = Depends(get_current_user)):
    g = await _load_goals(user.user_id)
    sd = g["start_date"]
    if isinstance(sd, str):
        sd = datetime.fromisoformat(sd)
    target_week = week if week else _calc_week_number(sd)
    entry = await db.progress_entries.find_one(
        {"user_id": user.user_id, "week_number": target_week},
        {"_id": 0},
    )
    if not entry:
        entry = {
            "user_id": user.user_id,
            "week_number": target_week,
            "values": {e["key"]: 0 for e in g["exercises"]},
            "updated_at": None,
        }
    elif "values" not in entry:
        entry["values"] = {
            "ex1": entry.get("run_km", 0),
            "ex2": entry.get("pushups", 0),
            "ex3": entry.get("pullups", 0),
        }
    return entry

MAX_PROGRESS_VALUE = 1_000_000


def _clean_number(v) -> float:
    """Eingabewert prüfen: Zahl, endlich, 0 bis MAX_PROGRESS_VALUE (BACKLOG S7)."""
    try:
        f = float(v or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Ungültiger Wert")
    if f != f or f in (float("inf"), float("-inf")) or f < 0 or f > MAX_PROGRESS_VALUE:
        raise HTTPException(status_code=400, detail="Wert außerhalb des erlaubten Bereichs")
    return f


@api_router.put("/progress/me")
async def update_progress(payload: ProgressUpdate, user: User = Depends(get_current_user)):
    g0 = await _load_goals(user.user_id)
    if _starts_on(g0):
        raise HTTPException(status_code=400, detail="Dein Programm startet erst am Montag")
    if not (1 <= payload.week_number <= _current_week_of(g0)):
        raise HTTPException(status_code=400, detail="Diese Woche kann nicht bearbeitet werden")
    now = datetime.now(timezone.utc).isoformat()
    days = {}
    for d, vals in (payload.days or {}).items():
        if str(d) not in {"0", "1", "2", "3", "4", "5", "6"} or not isinstance(vals, dict):
            raise HTTPException(status_code=400, detail="Ungültiger Wochentag")
        days[str(d)] = {str(k): _clean_number(v) for k, v in vals.items()}
    if days:
        totals = {}
        for vals in days.values():
            for k, v in vals.items():
                totals[k] = totals.get(k, 0) + v
        values = totals
    else:
        values = {str(k): _clean_number(v) for k, v in (payload.values or {}).items()}
    doc = {
        "user_id": user.user_id,
        "week_number": payload.week_number,
        "values": values,
        "days": days,
        "updated_at": now,
    }
    if "base_updated_at" in payload.model_fields_set:
        existing = await db.progress_entries.find_one(
            {"user_id": user.user_id, "week_number": payload.week_number}, {"_id": 0, "updated_at": 1})
        if (existing or {}).get("updated_at") != payload.base_updated_at:
            raise HTTPException(status_code=409, detail="Auf einem anderen Gerät wurde inzwischen gespeichert")
    g = await _load_goals(user.user_id)
    cur_week = _current_week_of(g)
    was_done = await _week_done(user.user_id, g, cur_week)
    await db.progress_entries.update_one(
        {"user_id": user.user_id, "week_number": payload.week_number},
        {"$set": doc, "$unset": {"run_km": "", "pushups": "", "pullups": ""}},
        upsert=True,
    )
    await _notify(user.user_id, {
        "type": "progress_updated",
        "user_id": user.user_id,
        "week_number": payload.week_number,
        "values": values,
    })
    if payload.week_number == cur_week and not was_done and await _week_done(user.user_id, g, cur_week):
        await _notify(user.user_id, {
            "type": "week_completed",
            "user_id": user.user_id,
            "user_name": user.name,
            "week_number": cur_week,
        })
    return doc

# -------------------- Live Board --------------------
def _streak_info(state: dict, exercises: list, progress_by_week: dict, current_week: int):
    """Eine Woche zählt als geschafft, wenn ALLE in dieser Woche aktiven Übungen
    ihr Ziel erreicht haben. Pausierte/abgeschlossene oder noch nicht vorhandene
    Übungen zählen in der Woche nicht mit."""
    completed = []
    neutral = set()  # keine aktive Übung (alles pausiert): zählt nicht und unterbricht nicht
    for w in range(1, current_week + 1):
        all_done = True
        any_active = False
        for ex in exercises:
            prog = state[ex["key"]]["progression"]
            cell = next((p for p in prog if p["week"] == w), None)
            if not cell or cell["status"] in ("pre_existence", "paused"):
                continue
            any_active = True
            if cell["status"] == "missed":
                all_done = False
                break
            target = cell["goal"]
            logged = float(progress_by_week.get(w, {}).get(ex["key"], 0) or 0)
            tol = max(0.01, (target or 0) * 0.005)
            if logged + tol < target:
                all_done = False
                break
        if all_done and any_active:
            completed.append(w)
        elif not any_active:
            neutral.add(w)

    completed_set = set(completed)
    cur = 0
    # Starte beim aktuellen Wochen-Index. Wenn die aktuelle Woche noch nicht
    # abgeschlossen ist (z.B. gerade erst gestartet), wird ab der Vorwoche
    # gezählt – sonst würde der Streak beim Wochenwechsel fälschlicherweise
    # auf 0 fallen, obwohl die Vorwoche(n) erledigt waren.
    w = current_week
    while w >= 1 and w in neutral:
        w -= 1
    if w not in completed_set:
        w -= 1
    while w >= 1 and (w in completed_set or w in neutral):
        if w in completed_set:
            cur += 1
        w -= 1
    best = 0
    run = 0
    prev = None
    for w in completed:
        gap_neutral = prev is not None and all(x in neutral for x in range(prev + 1, w))
        run = run + 1 if gap_neutral else 1
        best = max(best, run)
        prev = w
    return {"current": cur, "best": best, "completed_weeks": completed}

# -------------------- Smarter Ziel-Vorschlag (Plan 12f) --------------------
SUGGEST_UP_WEEKS = 3        # so viele Wochen am Stück ...
SUGGEST_UP_RATIO = 1.3      # ... mindestens 130 % -> Ziel erhöhen?
SUGGEST_DOWN_WINDOW = 4     # von den letzten 4 aktiven Wochen ...
SUGGEST_DOWN_MISSES = 3     # ... mindestens 3 verfehlt ...
SUGGEST_DOWN_RATIO = 0.7    # ... und im Schnitt unter 70 % (aber mehr als 20 %) -> Ziel senken?


def _goal_suggestion(ex: dict, st: dict, progress_by_week: dict, cur_week: int) -> Optional[dict]:
    """Vorschlag für eine Übung aus den letzten abgeschlossenen Wochen (nur eigene Karte).
    up: 3 Wochen am Stück >= 130 % -> neues Ziel = kleinster dieser Wochenwerte.
    down: 3 von 4 verfehlt und Schnitt 20–70 % -> neues Ziel = Schnitt der 4 Wochen."""
    if ex.get("type") == "activity":
        return None
    goal_now = float(st.get("current_goal") or 0)
    if goal_now <= 0:
        return None
    unit = ex.get("unit", "")
    past = [p for p in st.get("progression", [])
            if p["week"] < cur_week and p["status"] in ("completed", "missed") and p["goal"] > 0]
    if not past:
        return None
    vals = {p["week"]: float(progress_by_week.get(p["week"], {}).get(ex["key"], 0) or 0) for p in past}

    last_up = past[-SUGGEST_UP_WEEKS:]
    if len(last_up) == SUGGEST_UP_WEEKS and all(vals[p["week"]] >= p["goal"] * SUGGEST_UP_RATIO for p in last_up):
        new = _round_goal(min(vals[p["week"]] for p in last_up), unit)
        if new >= goal_now * 1.1:
            ratio = sum(vals[p["week"]] / p["goal"] for p in last_up) / len(last_up)
            return {"key": ex["key"], "kind": "up", "goal": goal_now, "suggested": new,
                    "weeks": SUGGEST_UP_WEEKS, "pct": int(round(ratio * 100))}

    last_down = past[-SUGGEST_DOWN_WINDOW:]
    if len(last_down) == SUGGEST_DOWN_WINDOW:
        misses = sum(1 for p in last_down if p["status"] == "missed")
        ratio = sum(vals[p["week"]] / p["goal"] for p in last_down) / len(last_down)
        if misses >= SUGGEST_DOWN_MISSES and 0.2 < ratio < SUGGEST_DOWN_RATIO:
            new = _round_goal(sum(vals[p["week"]] for p in last_down) / len(last_down), unit)
            if 0 < new <= goal_now * 0.9:
                return {"key": ex["key"], "kind": "down", "goal": goal_now, "suggested": new,
                        "weeks": SUGGEST_DOWN_WINDOW, "pct": int(round(ratio * 100))}
    return None


async def _board_entry(u: dict, viewer_id: str, week: Optional[int] = None) -> dict:
    """Eine Karte des Boards (für /board und /board/users/{id}, BACKLOG P4)."""
    g = await _load_goals(u["user_id"])
    sd = g["start_date"]
    if isinstance(sd, str):
        sd = datetime.fromisoformat(sd)
    cur_week = week if week else _calc_week_number(sd)
    # Einträge nur einmal pro Nutzer laden (Plan 9 / BACKLOG P2) und dreifach nutzen:
    # Wochenwerte, aktuelle Woche, All-Time-Summen.
    all_entries = await db.progress_entries.find({"user_id": u["user_id"]}, {"_id": 0}).to_list(1000)
    progress_by_week = await _progress_by_week(u["user_id"], g["exercises"], all_entries)
    state = await _compute_user_state(u["user_id"], g, cur_week, progress_by_week)
    exercises_out = []
    for ex in g["exercises"]:
        st = state[ex["key"]]
        if st["status"] != "active":
            continue  # pausierte und abgeschlossene Übungen nicht auf der Karte
        exercises_out.append({
            "key": ex["key"],
            "name": ex["name"],
            "unit": ex.get("unit", ""),
            "icon": ex.get("icon", "pushup"),
            "color": ex.get("color", "#CCFF00"),
            "variant": ex.get("variant", ""),
            "type": ex.get("type", "exercise"),
            "goal": st["current_goal"],
            "progression_pct": _get_pct_for_week(ex, cur_week),
            "boosted_this_week": cur_week in st["effective_boost_weeks"],
            "boosted_weeks": st["effective_boost_weeks"],
            "missed_weeks": st["missed_weeks"],
            "miss_streak": st["miss_streak"],
            "added_week": int(ex.get("added_week") or 1),
        })
    entry = next((dict(e) for e in all_entries if e.get("week_number") == cur_week), None)
    if entry and "values" not in entry:
        entry["values"] = {
            "ex1": entry.get("run_km", 0),
            "ex2": entry.get("pushups", 0),
            "ex3": entry.get("pullups", 0),
        }
    values = entry["values"] if entry else {e["key"]: 0 for e in g["exercises"]}
    days = entry.get("days", {}) if entry else {}
    all_time_totals = {ex["key"]: 0.0 for ex in g["exercises"]}
    # 🏆 Rang-Bestwert pro Übung: höchster je in EINER Woche „erspielter"
    #    Wert (= min(weekValue, weekGoal)). Damit bleiben einmal erreichte
    #    Ränge auch dann erhalten, wenn in einer späteren Woche das Ziel
    #    nicht (oder noch nicht) erfüllt wird. Wird vom Frontend für die
    #    Rang-Anzeige auf der Kartenrückseite genutzt – als verlässliche
    #    Quelle der Wahrheit zusätzlich/an Stelle des lokalen Speichers,
    #    damit der Rang auch auf fremden Geräten, in anderen Browsern und
    #    beim Anzeigen fremder Karten korrekt erscheint.
    best_goals = {ex["key"]: 0.0 for ex in g["exercises"]}
    # Höchster je erreichter Wochenwert (uncapped) – wird ab S+ angezeigt.
    best_weeklies = {ex["key"]: 0.0 for ex in g["exercises"]}
    # Wochenziele pro Übung × Woche (aus der berechneten Progression).
    goal_by_week_by_ex = {}
    for ex in g["exercises"]:
        st_ex = state.get(ex["key"], {})
        prog = st_ex.get("progression", []) or []
        goal_by_week_by_ex[ex["key"]] = {
            int(p.get("week") or 0): float(p.get("goal") or 0) for p in prog
        }
    for pe in all_entries:
        week_vals = {}
        pe_days = pe.get("days") or {}
        if pe_days:
            for d_key, d_vals in pe_days.items():
                if not isinstance(d_vals, dict):
                    continue
                for k, v in d_vals.items():
                    try:
                        week_vals[k] = week_vals.get(k, 0.0) + float(v or 0)
                    except (TypeError, ValueError):
                        continue
        elif pe.get("values"):
            for k, v in (pe.get("values") or {}).items():
                try:
                    week_vals[k] = float(v or 0)
                except (TypeError, ValueError):
                    continue
        else:
            week_vals = {
                "ex1": float(pe.get("run_km", 0) or 0),
                "ex2": float(pe.get("pushups", 0) or 0),
                "ex3": float(pe.get("pullups", 0) or 0),
            }
        wn = int(pe.get("week_number") or 0)
        for k, v in week_vals.items():
            if k in all_time_totals:
                all_time_totals[k] += v
            if k in best_weeklies and v > best_weeklies[k]:
                best_weeklies[k] = v
            if k in best_goals:
                wk_goal = float(goal_by_week_by_ex.get(k, {}).get(wn, 0) or 0)
                if wk_goal > 0:
                    earned = v if v < wk_goal else wk_goal
                    if earned > best_goals[k]:
                        best_goals[k] = earned
    streak = _streak_info(state, g["exercises"], progress_by_week, cur_week)
    # Abgeschlossene Übungen: Historie für die Kartenrückseite (auch für Freunde).
    archived_out = []
    for ex in g["exercises"]:
        st = state[ex["key"]]
        if st["status"] != "completed":
            continue
        prog = st["progression"]
        active_weeks = [p for p in prog if p["status"] in ("completed", "missed") and p["week"] < cur_week]
        pause_start = max((int(p.get("from_week") or 0) for p in ex.get("pauses") or [] if p.get("to_week") is None), default=cur_week)
        archived_out.append({
            "key": ex["key"],
            "name": ex["name"],
            "unit": ex.get("unit", ""),
            "icon": ex.get("icon", "pushup"),
            "color": ex.get("color", "#CCFF00"),
            "variant": ex.get("variant", ""),
            "type": ex.get("type", "exercise"),
            "added_week": int(ex.get("added_week") or 1),
            "completed_week": pause_start,
            "weeks_done": sum(1 for p in active_weeks if p["status"] == "completed"),
            "weeks_total": len(active_weeks),
            "last_goal": next((p["goal"] for p in reversed(prog) if p["goal"] and p["week"] < pause_start), 0),
            "history": [{"week": p["week"], "goal": p["goal"],
                         "value": round(float(progress_by_week.get(p["week"], {}).get(ex["key"], 0) or 0), 2),
                         "status": p["status"]}
                        for p in prog if p["status"] in ("completed", "missed")],
        })
    is_me = u["user_id"] == viewer_id
    return {
        "user_id": u["user_id"],
        "name": u["name"],
        "handle": u.get("handle"),
        # E-Mail nur im eigenen Eintrag (Freunde brauchen sie nicht, BACKLOG S3).
        "email": u["email"] if is_me else None,
        "picture": _picture_ref(u["user_id"], u.get("picture")),
        "week_number": cur_week,
        "exercises": exercises_out,
        "archived_exercises": archived_out,
        "starts_on": _starts_on(g),
        # Alles pausiert: Karte zeigt „Pause“ statt Werten (ersetzt Urlaub/Krank)
        "all_paused": bool(g["exercises"]) and not exercises_out
                      and any(state[e["key"]]["status"] == "paused" for e in g["exercises"]),
        # Ziel-Vorschläge nur für die eigene Karte, nur in der echten aktuellen Woche.
        "goal_suggestions": ([sg for ex in g["exercises"]
                              if state[ex["key"]]["status"] == "active"
                              for sg in [_goal_suggestion(ex, state[ex["key"]], progress_by_week, cur_week)] if sg]
                             if is_me and not week and not _starts_on(g) else []),
        "values": values,
        "days": days,
        "updated_at": entry.get("updated_at") if entry else None,
        "streak": streak,
        "all_time": {k: round(v, 2) for k, v in all_time_totals.items()},
        # 🏆 Höchster je in EINER Woche „erspielter" Wert pro Übung
        # (= min(weekValue, weekGoal)). Verlässliche Quelle für die
        # Rang-Anzeige auf der Kartenrückseite. Einmal erreichte Ränge
        # bleiben so auch in folgenden Wochen erhalten, in denen das
        # Ziel noch nicht erfüllt wurde – und sind auf jedem Gerät und
        # für jeden Betrachter sichtbar.
        "best_goals": {k: round(v, 2) for k, v in best_goals.items()},
        "best_weeklies": {k: round(v, 2) for k, v in best_weeklies.items()},
        "milestones": _milestones_out(u),
        "is_online": u["user_id"] in manager.online_user_ids(),
    }


@api_router.get("/board")
async def board(week: Optional[int] = None, user: User = Depends(get_current_user)):
    friend_ids = await _get_friend_ids_ordered(user.user_id)
    target_ids = [user.user_id] + [fid for fid in friend_ids if fid != user.user_id]
    users_docs = await db.users.find({"user_id": {"$in": target_ids}}, {"_id": 0}).to_list(500)
    by_id = {u["user_id"]: u for u in users_docs}
    users = [by_id[uid] for uid in target_ids if uid in by_id]
    result = [await _board_entry(u, user.user_id, week) for u in users]
    visible = set(target_ids)
    return {"week_number": week, "users": result, "online_user_ids": sorted(manager.online_user_ids() & visible)}


@api_router.get("/board/users/{target_id}")
async def board_user(target_id: str, week: Optional[int] = None, user: User = Depends(get_current_user)):
    """Nur eine Karte neu laden (Live-Event „X hat eingetragen“), statt des ganzen Boards (BACKLOG P4).
    Erlaubt: die eigene Karte und Karten der eigenen Crew."""
    if target_id != user.user_id:
        friend_ids = await _get_friend_ids_ordered(user.user_id)
        if target_id not in friend_ids:
            raise HTTPException(status_code=404, detail="Nicht in deiner Crew")
    u = await db.users.find_one({"user_id": target_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    return {"week_number": week, "user": await _board_entry(u, user.user_id, week)}

# -------------------- Seen Effects (Animationen pro Viewer 1× pro Event) --------------------
# Ziel: Wenn jemand die Usercard eines anderen Users öffnet, soll die
# Celebration-/Failed-Animation für diese (target_user_id, week_number, type)
# nur EINMAL pro Viewer abgespielt werden – auch über Page-Reloads hinweg.
# Daher persistieren wir die "gesehen"-Markierung pro Viewer in der DB.

class SeenEffectMark(BaseModel):
    target_user_id: str
    week_number: int = 0
    type: str  # "celebration" | "failure" | "milestone"
    effect_id: Optional[str] = None  # nur bei "milestone": Meilenstein-ID

    @field_validator("type")
    @classmethod
    def _validate_type(cls, v):
        if v not in ("celebration", "failure", "milestone"):
            raise ValueError("type must be celebration|failure|milestone")
        return v

    @field_validator("effect_id")
    @classmethod
    def _validate_effect_id(cls, v):
        if v is not None and not MILESTONE_ID_RE.match(v):
            raise ValueError("invalid effect_id")
        return v

@api_router.get("/me/seen-effects")
async def get_seen_effects(user: User = Depends(get_current_user)):
    docs = await db.seen_effects.find(
        {"viewer_user_id": user.user_id},
        {"_id": 0, "target_user_id": 1, "week_number": 1, "type": 1, "effect_id": 1},
    ).to_list(5000)
    return {"items": docs}

@api_router.post("/me/seen-effects")
async def mark_seen_effect(payload: SeenEffectMark, user: User = Depends(get_current_user)):
    key = {
        "viewer_user_id": user.user_id,
        "target_user_id": payload.target_user_id,
        "week_number": int(payload.week_number),
        "type": payload.type,
    }
    if payload.type == "milestone":
        if not payload.effect_id:
            raise HTTPException(status_code=400, detail="effect_id fehlt")
        key["effect_id"] = payload.effect_id
    await db.seen_effects.update_one(
        key,
        {"$set": {**key, "seen_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


# -------------------- Meilensteine (Plan 1e) --------------------
# Welche Meilensteine erreicht sind, rechnet das Frontend aus den All-Time-Summen
# (lib/milestones.js, dort liegt auch die Übungserkennung). Der Server merkt sich je
# Nutzer, WANN ein Meilenstein zuerst erreicht wurde, damit er auf allen Geräten
# gleich ist und nie doppelt kommt (auch wenn Einträge später gelöscht werden).
# Beim allerersten Melden werden alle schon erreichten Meilensteine still
# gespeichert (silent), damit Bestandsnutzer keine Flut an Meldungen bekommen.
MILESTONE_ID_RE = re.compile(r"^[a-z0-9_:-]{1,48}$")
MILESTONES_MAX_PER_CALL = 100


class MilestonesReport(BaseModel):
    ids: List[str]
    # Für wen das Frontend rechnet. Schutz gegen einen zweiten Tab mit anderem Konto
    # (gleicher Browser-Speicher = gleiches Token): dann würden fremde Meilensteine gemeldet.
    for_user: Optional[str] = None

    @field_validator("ids")
    @classmethod
    def _validate_ids(cls, v):
        if len(v) > MILESTONES_MAX_PER_CALL:
            raise ValueError("Zu viele Meilensteine")
        out = []
        for i in v:
            if not isinstance(i, str) or not MILESTONE_ID_RE.match(i):
                raise ValueError("Ungültige Meilenstein-ID")
            if i not in out:
                out.append(i)
        return out


def _milestones_out(user_doc: dict) -> list:
    ms = user_doc.get("milestones") or {}
    items = [{"id": k, "at": v.get("at"), "silent": bool(v.get("silent"))}
             for k, v in ms.items() if isinstance(v, dict)]
    return sorted(items, key=lambda m: m["at"] or "")


@api_router.post("/me/milestones")
async def report_milestones(payload: MilestonesReport, user: User = Depends(get_current_user)):
    if payload.for_user and payload.for_user != user.user_id:
        raise HTTPException(status_code=409, detail="Falsches Konto")
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "milestones": 1}) or {}
    existing = doc.get("milestones")
    first = existing is None
    existing = existing or {}
    new = [i for i in payload.ids if i not in existing]
    if not new and not first:
        return {"new": [], "silent": False}
    now = datetime.now(timezone.utc).isoformat()
    update = {f"milestones.{i}": {"at": now, "silent": first} for i in new}
    if first and not new:
        update = {"milestones": {}}
    await db.users.update_one({"user_id": user.user_id}, {"$set": update})
    if new and not first:
        await _notify(user.user_id, {"type": "milestone_reached", "user_id": user.user_id, "ids": new})
    return {"new": new, "silent": first}

# -------------------- Insights --------------------
@api_router.get("/insights/me")
async def insights_me(user: User = Depends(get_current_user)):
    g = await _load_goals(user.user_id)
    exercises = [e for e in g["exercises"] if _exercise_status(e) == "active"]
    ex_keys = {e["key"] for e in exercises}
    entries = await db.progress_entries.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)

    # Aktuelle Woche + heutiger Wochentag (0=Mo .. 6=So) für "erreichbare Tage"-Logik
    sd = g.get("start_date")
    if isinstance(sd, str):
        try:
            sd = datetime.fromisoformat(sd)
        except ValueError:
            sd = datetime.now(timezone.utc)
    if not isinstance(sd, datetime):
        sd = datetime.now(timezone.utc)
    current_week_num = _calc_week_number(sd)
    current_dow = datetime.now(timezone.utc).weekday()  # 0=Mo..6=So

    by_weekday = {k: [0.0] * 7 for k in ex_keys}
    weeks_active = {k: [0] * 7 for k in ex_keys}
    # Pro Wochentag: in wie vielen protokollierten Wochen war dieser Tag bereits erreichbar?
    reachable_per_day = [0] * 7
    weeks_with_data = 0

    for entry in entries:
        raw_days = entry.get("days") or {}
        if not isinstance(raw_days, dict) or not raw_days:
            continue
        active_today = {k: [False] * 7 for k in ex_keys}
        week_contributed = False
        for d_key, d_vals in raw_days.items():
            try:
                d = int(d_key)
            except (ValueError, TypeError):
                continue
            if d < 0 or d > 6 or not isinstance(d_vals, dict):
                continue
            for k, v in d_vals.items():
                if k not in ex_keys:
                    continue
                try:
                    fv = float(v) if v not in (None, "") else 0.0
                except (ValueError, TypeError):
                    fv = 0.0
                if fv > 0:
                    by_weekday[k][d] += fv
                    active_today[k][d] = True
                    week_contributed = True
        if week_contributed:
            weeks_with_data += 1
            for k, flags in active_today.items():
                for i, was_active in enumerate(flags):
                    if was_active:
                        weeks_active[k][i] += 1
            # Erreichbarkeit der Wochentage in dieser Woche bestimmen.
            # - Vergangene Wochen: alle 7 Tage erreichbar.
            # - Aktuelle (oder spätere) Woche: nur Tage bis einschließlich heute.
            try:
                week_num = int(entry.get("week_number", 0))
            except (ValueError, TypeError):
                week_num = 0
            if week_num < current_week_num:
                for d in range(7):
                    reachable_per_day[d] += 1
            else:
                for d in range(7):
                    if d <= current_dow:
                        reachable_per_day[d] += 1

    # Verlauf je Übung (Plan 5): Wochenwert vs. Ziel über alle bisherigen Wochen.
    progress_by_week = await _progress_by_week(user.user_id, exercises)
    state = await _compute_user_state(user.user_id, g, current_week_num, progress_by_week)

    out = []
    for ex in exercises:
        k = ex["key"]
        u = (ex.get("unit", "") or "").lower()
        is_distance = "km" in u or u == "m" or "mi" in u
        history = []
        for pw in state.get(k, {}).get("progression", []):
            if pw["status"] in ("pre_existence", "future") or pw["week"] > current_week_num:
                continue
            val = float(progress_by_week.get(pw["week"], {}).get(k, 0) or 0)
            history.append({
                "week": pw["week"],
                "goal": pw["goal"],
                "value": round(val, 2),
                "status": pw["status"],  # completed | missed | current | paused
            })
        best = max(history, key=lambda h: h["value"], default=None)
        if is_distance:
            totals = [round(v, 1) for v in by_weekday[k]]
        else:
            totals = [float(int(v + 0.5)) for v in by_weekday[k]]
        total_sum = sum(totals)

        # Power-Day: Tag mit dem höchsten Wert (>0)
        nonzero = [(i, v) for i, v in enumerate(totals) if v > 0]
        power_day = max(nonzero, key=lambda x: x[1])[0] if nonzero else None

        # Loser-Day: Tag mit dem geringsten Wert (0 explizit erlaubt) — über alle
        # bereits erreichbaren Wochentage. Mehrere Tage mit gleichem Minimum
        # werden alle als Loser-Days zurückgegeben (z.B. mehrere 0-Tage).
        reachable_indices = [i for i in range(7) if reachable_per_day[i] > 0]
        if reachable_indices:
            min_val = min(totals[i] for i in reachable_indices)
            weakest_days = [i for i in reachable_indices if totals[i] == min_val]
            # Falls Power-Day == einziger Loser-Day (alle Werte gleich), keinen Loser zeigen
            if len(weakest_days) == 1 and weakest_days[0] == power_day:
                weakest_days = []
            elif power_day is not None and power_day in weakest_days:
                weakest_days = [i for i in weakest_days if i != power_day]
            weakest_day = weakest_days[0] if weakest_days else None
        else:
            weakest_days = []
            weakest_day = None

        share_per_day = [round(100 * t / total_sum, 1) if total_sum > 0 else 0 for t in totals]
        # Konsistenz: % der erreichbaren Wochen mit Aktivität an diesem Tag.
        # Nenner ist NICHT mehr weeks_with_data, sondern reachable_per_day[d]
        # — damit zukünftige Tage der laufenden Woche die Quote nicht drücken.
        consistency = [
            round(100 * weeks_active[k][d] / reachable_per_day[d]) if reachable_per_day[d] > 0 else 0
            for d in range(7)
        ]
        # Tages-basierter Wochendurchschnitt: total / (verstrichene Programm-Tage) * 7.
        # Beispiel: 10km in Woche 1, Montag Woche 2 -> 10 / 8 * 7 = 8.75 km/Woche.
        total_days_elapsed = (current_week_num - 1) * 7 + current_dow + 1
        if total_days_elapsed > 0 and total_sum > 0:
            avg_raw = total_sum / total_days_elapsed * 7
            avg = round(avg_raw, 1) if is_distance else round(avg_raw, 2)
        else:
            avg = 0
        out.append({
            "key": k,
            "name": ex["name"],
            "unit": ex.get("unit", ""),
            "icon": ex.get("icon", "pushup"),
            "color": ex.get("color", "#CCFF00"),
            "variant": ex.get("variant", ""),
            "type": ex.get("type", "exercise"),
            "by_weekday": totals,
            "share_per_day": share_per_day,
            "consistency": consistency,
            "power_day": power_day,
            "weakest_day": weakest_day,      # Backward-Compat: erster Loser-Day
            "weakest_days": weakest_days,    # Neu: Liste aller Loser-Days
            "total": round(total_sum, 2),
            "avg_per_week": avg,
            "history": history,
            "best_week": best["week"] if best and best["value"] > 0 else None,
        })

    return {"exercises": out, "weeks_tracked": weeks_with_data}
