"""Ziele und Progression (einzige Rechenstelle), Übungen, Pausen, Varianten, Boost.

Teil von server.py (aufgeteilt 2026-11-25, BACKLOG W1)."""
from fastapi import HTTPException, Depends
import math
from pydantic import BaseModel, field_validator
from typing import Optional
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from core import BASE_INCREASE, BOOST_INCREASE, BoostRequest, FUTURE_WEEKS, GoalsUpdate, User, _normalize_exercise_colors, _notify, api_router, db, default_exercises, get_current_user

# -------------------- Goals --------------------
def _tz(name: Optional[str]):
    """Zeitzone des Nutzers (IANA-Name vom Gerät), sonst UTC."""
    if not name:
        return timezone.utc
    try:
        return ZoneInfo(name)
    except Exception:
        return timezone.utc


def _calc_week_number(start_date: datetime, tz: Optional[str] = None) -> int:
    """Programmwoche (Montag–Sonntag). „Heute“ zählt in der Ortszeit des Nutzers (Dean 2026-11-27):
    die Woche endet Sonntag 24:00 dort, wo er ist. Der Start-Montag bleibt wie gespeichert (UTC),
    damit sich bei Bestandsnutzern keine Wochennummern verschieben."""
    if start_date.tzinfo is None:
        start_date = start_date.replace(tzinfo=timezone.utc)
    start_monday = (start_date - timedelta(days=start_date.weekday())).date()
    today = datetime.now(_tz(tz)).date()
    today_monday = today - timedelta(days=today.weekday())
    return max(1, (today_monday - start_monday).days // 7 + 1)

def _round_goal(value: float, unit: str) -> float:
    u = (unit or "").lower()
    if "km" in u or "m" == u or "mi" in u:
        return float(int(value * 10 + 0.5)) / 10.0
    return float(int(value + 0.5))

async def _load_goals(user_id: str) -> dict:
    g = await db.user_goals.find_one({"user_id": user_id}, {"_id": 0})
    now = datetime.now(timezone.utc)
    if not g:
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "language": 1}) or {}
        g = {
            "user_id": user_id,
            "exercises": default_exercises(u.get("language") or "en"),
            "boosts": [],
            "weekly_increase": BASE_INCREASE,
            "start_date": now.isoformat(),
            "rules_from_week": 1,
            "pause_loss_from_week": 1,
        }
        await db.user_goals.insert_one(dict(g))
        return g
    if "exercises" not in g:
        legacy = [
            {"key": "ex1", "name": "Lauf",         "unit": "km", "icon": "run",    "color": "#CCFF00", "base_value": float(g.get("base_run_km", 10.0))},
            {"key": "ex2", "name": "Liegestütze",  "unit": "",   "icon": "pushup", "color": "#FF3B30", "base_value": float(g.get("base_pushups", 500))},
            {"key": "ex3", "name": "Klimmzüge",    "unit": "",   "icon": "pullup", "color": "#00F0FF", "base_value": float(g.get("base_pullups", 50))},
        ]
        await db.user_goals.update_one(
            {"user_id": user_id},
            {"$set": {"exercises": legacy, "boosts": g.get("boosts", [])},
             "$unset": {"base_run_km": "", "base_pushups": "", "base_pullups": ""}},
        )
        g["exercises"] = legacy
        g["boosts"] = g.get("boosts", [])
    if "boosts" not in g:
        g["boosts"] = []
        await db.user_goals.update_one({"user_id": user_id}, {"$set": {"boosts": []}})
    if "rules_from_week" not in g:
        # Einmalige Umstellung beim ersten Laden nach dem Update: neue Regeln
        # (Abzug nach 4 Wochen, Einfrieren auch nach der 1. Woche) erst ab jetzt.
        sd = g.get("start_date")
        sd = datetime.fromisoformat(sd) if isinstance(sd, str) else (sd or now)
        g["rules_from_week"] = _calc_week_number(sd, g.get("tz"))
        await db.user_goals.update_one({"user_id": user_id}, {"$set": {"rules_from_week": g["rules_from_week"]}})
    if "pause_loss_from_week" not in g:
        # Formverlust nach Pausen (2026-11-25) zählt bei Bestandsnutzern erst ab jetzt – nichts rückwirkend.
        sd = g.get("start_date")
        sd = datetime.fromisoformat(sd) if isinstance(sd, str) else (sd or now)
        g["pause_loss_from_week"] = _calc_week_number(sd, g.get("tz"))
        await db.user_goals.update_one({"user_id": user_id}, {"$set": {"pause_loss_from_week": g["pause_loss_from_week"]}})
    _normalize_exercise_colors(g.get("exercises", []))
    _ensure_progression_pct(g.get("exercises", []))
    return g

def _ensure_progression_pct(exercises: list) -> list:
    if not exercises:
        return exercises
    for ex in exercises:
        if not isinstance(ex, dict):
            continue
        try:
            v = int(round(float(ex.get("progression_pct", 10))))
        except (TypeError, ValueError):
            v = 10
        ex["progression_pct"] = max(0, min(10, v))
    return exercises

def _boosted_weeks_for(g: dict, exercise_key: str) -> set:
    return {b["week_number"] for b in g.get("boosts", []) if b.get("exercise_key") == exercise_key}

def _boost_versions_for(g: dict, exercise_key: str) -> dict:
    """Mapping week_number -> formula_version.
    Version 1 (Altdaten): Boost addiert +25% multiplikativ ZUSÄTZLICH zur Wochen-Steigerung.
    Version 2 (Neuverhalten): Boost ERSETZT die Wochen-Steigerung -> insgesamt +25% in der Boost-Woche.
    Boosts ohne gespeicherte Version werden als Version 1 (alt) behandelt, damit
    historische Werte der User unveraendert bleiben."""
    out = {}
    for b in g.get("boosts", []):
        if b.get("exercise_key") != exercise_key:
            continue
        try:
            v = int(b.get("formula_version") or 1)
        except (TypeError, ValueError):
            v = 1
        out[b["week_number"]] = 2 if v >= 2 else 1
    return out

def _get_pct_for_week(exercise: dict, week: int) -> int:
    """Liefert die für die angegebene Woche geltende Steigerung (in Prozent, 0..10).

    Eine pro Übung gepflegte History `progression_overrides: List[{from_week, pct}]`
    bestimmt, welche Steigerung ab welcher Woche gilt. Es wird der jüngste Eintrag
    mit ``from_week <= week`` verwendet. Existieren keine Overrides (Legacy-Daten),
    wird ``progression_pct`` als Fallback für alle Wochen verwendet.
    """
    try:
        default_pct = int(round(float(exercise.get("progression_pct", 10))))
    except (TypeError, ValueError):
        default_pct = 10
    default_pct = max(0, min(10, default_pct))

    overrides = exercise.get("progression_overrides") or []
    if not isinstance(overrides, list) or not overrides:
        return default_pct

    chosen = None
    chosen_from = -1
    for o in overrides:
        if not isinstance(o, dict):
            continue
        try:
            fw = int(o.get("from_week"))
        except (TypeError, ValueError):
            continue
        if fw <= week and fw > chosen_from:
            try:
                pct = int(round(float(o.get("pct", default_pct))))
            except (TypeError, ValueError):
                pct = default_pct
            chosen = max(0, min(10, pct))
            chosen_from = fw
    return chosen if chosen is not None else default_pct


async def _progress_by_week(user_id: str, exercises: list, entries: Optional[list] = None) -> dict:
    """Wochenwerte je Übung. `entries` = schon geladene progress_entries (spart eine Abfrage)."""
    if entries is None:
        entries = await db.progress_entries.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    out = {}
    ex_keys = {e["key"] for e in exercises}
    for pe in entries:
        wn = pe.get("week_number")
        if wn is None:
            continue
        if "values" in pe:
            out[wn] = {k: float(v or 0) for k, v in pe["values"].items() if k in ex_keys}
        else:
            legacy = {
                "ex1": float(pe.get("run_km", 0) or 0),
                "ex2": float(pe.get("pushups", 0) or 0),
                "ex3": float(pe.get("pullups", 0) or 0),
            }
            out[wn] = {k: v for k, v in legacy.items() if k in ex_keys}
    return out

DELOAD_AFTER_MISSES = 4     # nach so vielen verfehlten Wochen am Stück ...
DELOAD_FACTOR = 0.9         # ... sinkt das Ziel um 10 %
# Formverlust nach Pausen (Dean, 2026-11-25): eine Kurve für alle Übungen (Kraft-Werte aus Studien:
# ~3 Wochen bleibt fast alles erhalten). (ab so vielen Pausenwochen, Ziel danach)
PAUSE_LOSS = ((7, 0.80), (5, 0.85), (4, 0.90), (3, 0.95))


def _pause_loss_factor(weeks: int) -> float:
    for threshold, factor in PAUSE_LOSS:
        if weeks >= threshold:
            return factor
    return 1.0


def _overrides_by_week(exercise: dict) -> dict:
    """`goal_overrides: [{from_week, value}]` -> {week: value}. Ein Override setzt
    das Ziel ab dieser Woche neu (manuell in den Einstellungen gewählt)."""
    out = {}
    for o in exercise.get("goal_overrides") or []:
        if not isinstance(o, dict):
            continue
        try:
            out[int(o.get("from_week"))] = max(0.0, float(o.get("value") or 0))
        except (TypeError, ValueError):
            continue
    return out


def _paused_weeks(exercise: dict, last_week: int) -> set:
    """Alle Wochen, in denen die Übung pausiert oder abgeschlossen war.
    `pauses: [{from_week, to_week}]`, to_week = erste aktive Woche danach (None = offen)."""
    out = set()
    for p in exercise.get("pauses") or []:
        if not isinstance(p, dict):
            continue
        try:
            fw = int(p.get("from_week"))
        except (TypeError, ValueError):
            continue
        tw = p.get("to_week")
        try:
            tw = int(tw) if tw is not None else last_week + 1
        except (TypeError, ValueError):
            tw = last_week + 1
        out.update(range(fw, tw))
    return out


def _week_monday(g: dict, week: int):
    """Datum (date) des Montags der Programmwoche `week`."""
    sd = g.get("start_date")
    sd = datetime.fromisoformat(sd) if isinstance(sd, str) else sd
    if sd.tzinfo is None:
        sd = sd.replace(tzinfo=timezone.utc)
    start_monday = (sd - timedelta(days=sd.weekday())).date()
    return start_monday + timedelta(days=7 * (week - 1))


def _exercise_status(exercise: dict) -> str:
    """'active' | 'paused' | 'completed' (abgeschlossen = pausiert + archiviert)."""
    pauses = exercise.get("pauses") or []
    open_pause = any(isinstance(p, dict) and p.get("to_week") is None for p in pauses)
    if not open_pause:
        return "active"
    return "completed" if exercise.get("archived") else "paused"


def _compute_progression(exercise: dict, all_boost_weeks: set, progress_by_week: dict,
                        current_week: int, future_weeks: int = FUTURE_WEEKS,
                        boost_versions: Optional[dict] = None, rules_from_week: int = 1,
                        pause_loss_from_week: int = 1) -> dict:
    """Berechnet Woche für Woche das Ziel einer Übung.

    Regeln:
    - Start: `base_value` in `added_week`, danach je Woche +progression_pct
      (je Woche aus `progression_overrides`).
    - Verfehlte Woche: das Ziel bleibt in der Folgewoche gleich (keine Steigerung),
      auch wenn es die allererste Woche der Übung war.
    - Nach DELOAD_AFTER_MISSES verfehlten Wochen am Stück: Ziel x DELOAD_FACTOR.
    - Boost: +25 % dauerhaft. v2 (aktuell) ersetzt die Steigerung dieser Woche,
      v1 (Altdaten) kam obendrauf. Verfehlte Boost-Woche: dieser Boost verfällt.
    - Manuelles Ziel (`goal_overrides`): ab dieser Woche gilt der Wert, alles davor
      (Steigerungen, Boosts, Abzüge) ist darin aufgegangen. Vergangenheit bleibt.
    - Pausierte/abgeschlossene Wochen: kein Ziel, kein Verfehlen, keine Streak-Wirkung.
      Nach einer Pause geht es mit dem letzten Ziel weiter (ohne Steigerung).

    Wochen vor `rules_from_week` (Update-Woche) werden wie früher berechnet, damit
    sich bei bestehenden Nutzern nichts rückwirkend ändert: dort wird bei einer
    verfehlten Woche nur deren eigene Steigerung zurückgenommen, und es gibt
    keinen Abzug nach 4 Wochen.
    """
    unit = exercise.get("unit", "")
    ex_key = exercise["key"]
    is_activity = exercise.get("type") == "activity"
    try:
        added_week = max(1, int(exercise.get("added_week") or 1))
    except (TypeError, ValueError):
        added_week = 1
    boost_versions = boost_versions or {}
    last_week = max(current_week, 1) + future_weeks
    overrides = _overrides_by_week(exercise)
    paused = _paused_weeks(exercise, last_week)

    anchor = float(exercise.get("base_value", 0) or 0)
    eff_factors: list = []
    active_boosts: list = []   # (woche, version)
    deload_mult = 1.0
    miss_streak = 0
    hold_next = False          # nach Pause: erste aktive Woche ohne Steigerung
    pause_run = 0              # Pausenwochen am Stück (ab pause_loss_from_week) -> Formverlust
    prev_missed = False        # Vorwoche verfehlt -> diese Woche keine Steigerung
    missed = []
    progression = []

    for w in range(1, last_week + 1):
        if w < added_week:
            progression.append({"week": w, "goal": 0, "status": "pre_existence",
                                "boost": False, "voided_boost": False})
            continue
        if w in paused:
            progression.append({"week": w, "goal": 0, "status": "paused",
                                "boost": False, "voided_boost": False})
            hold_next = True
            prev_missed = False
            if w >= pause_loss_from_week:
                pause_run += 1
            continue
        after_pause = None
        if pause_run:
            f = 1.0 if is_activity else _pause_loss_factor(pause_run)
            if f < 1.0 and w not in overrides:
                deload_mult *= f
                after_pause = {"weeks": pause_run, "factor": f}
            pause_run = 0

        boost_this_week = w in all_boost_weeks
        is_v2_boost = boost_this_week and boost_versions.get(w, 1) == 2

        legacy = w < rules_from_week
        added_factor = False
        if w in overrides:
            anchor = overrides[w]
            eff_factors = []
            active_boosts = []
            deload_mult = 1.0
            miss_streak = 0
        elif w > added_week and not is_activity and not is_v2_boost and not hold_next and not (prev_missed and not legacy):
            eff_factors.append(1.0 + _get_pct_for_week(exercise, w) / 100.0)
            added_factor = True
        hold_next = False
        if boost_this_week and w not in overrides:
            active_boosts.append((w, boost_versions.get(w, 1)))

        prog_mult = 1.0
        for f in eff_factors:
            prog_mult *= f
        goal_raw = anchor * prog_mult * ((1 + BOOST_INCREASE) ** len(active_boosts)) * deload_mult
        goal_rounded = _round_goal(goal_raw, unit)

        voided_boost = False
        if w < current_week:
            logged = float(progress_by_week.get(w, {}).get(ex_key, 0) or 0)
            tol = max(0.01, goal_rounded * 0.005)  # Float-Toleranz 0,5 %
            if logged + tol < goal_rounded:
                missed.append(w)
                status = "missed"
                voided_boost = boost_this_week and any(b[0] == w for b in active_boosts)
                active_boosts = [b for b in active_boosts if b[0] != w]
                if legacy:
                    # Alte Regel: nur die Steigerung dieser Woche zurücknehmen, kein Abzug.
                    if added_factor and eff_factors:
                        eff_factors.pop()
                else:
                    prev_missed = True
                    miss_streak += 1
                    if miss_streak >= DELOAD_AFTER_MISSES and not is_activity:
                        deload_mult *= DELOAD_FACTOR
                        miss_streak = 0
            else:
                status = "completed"
                miss_streak = 0
                prev_missed = False
        elif w == current_week:
            status = "current"
        else:
            status = "future"

        entry = {"week": w, "goal": goal_rounded, "status": status,
                 "boost": boost_this_week, "voided_boost": voided_boost}
        # Geschafft (bisher/aktuell): für den Aktivitäten-Verlauf in den Einstellungen
        if w <= current_week:
            entry["done"] = round(float(progress_by_week.get(w, {}).get(exercise.get("key"), 0) or 0), 2)
        if after_pause:
            entry["after_pause"] = after_pause
        if w in overrides:
            entry["manual"] = True
        progression.append(entry)

    current = next((p for p in progression if p["week"] == current_week), None)
    return {
        "missed_weeks": missed,
        "effective_boost_weeks": sorted(b[0] for b in active_boosts),
        "current_goal": current["goal"] if current else 0,
        "progression": progression,
        "added_week": added_week,
        "status": _exercise_status(exercise),
        "miss_streak": miss_streak,
    }

async def _compute_user_state(user_id: str, g: dict, current_week: int,
                              progress_by_week: Optional[dict] = None) -> dict:
    exercises = g["exercises"]
    if progress_by_week is None:
        progress_by_week = await _progress_by_week(user_id, exercises)
    state = {}
    for ex in exercises:
        bws = _boosted_weeks_for(g, ex["key"])
        bvs = _boost_versions_for(g, ex["key"])
        state[ex["key"]] = _compute_progression(ex, bws, progress_by_week, current_week, boost_versions=bvs,
                                                rules_from_week=int(g.get("rules_from_week") or 1),
                                                pause_loss_from_week=int(g.get("pause_loss_from_week") or 1))
    return state

@api_router.get("/goals/me")
async def get_my_goals(user: User = Depends(get_current_user)):
    g = await _load_goals(user.user_id)
    sd = g["start_date"]
    if isinstance(sd, str):
        sd = datetime.fromisoformat(sd)
    cur_week = _calc_week_number(sd, g.get("tz"))
    state = await _compute_user_state(user.user_id, g, cur_week)
    g["current_week"] = cur_week
    g["state"] = state
    g["starts_on"] = _starts_on(g)
    return g

MAX_EXERCISES = 7  # gleichzeitig aktive oder pausierte Übungen (abgeschlossene zählen nicht)


def _current_week_of(g: dict) -> int:
    sd = g["start_date"]
    if isinstance(sd, str):
        sd = datetime.fromisoformat(sd)
    return _calc_week_number(sd, g.get("tz"))


def _new_exercise_key(used: set) -> str:
    while True:
        k = f"x{uuid.uuid4().hex[:8]}"
        if k not in used:
            return k


ACTIVITY_UNIT = "×"


def _is_activity(ex: dict) -> bool:
    return (ex or {}).get("type") == "activity"


def _per_week(v) -> float:
    """Aktivität: 1–7 Mal pro Woche (ganze Zahl)."""
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        n = 1
    return float(max(1, min(7, n)))


def _activity_fields(ex: dict) -> dict:
    """Aktivitäten haben feste Regeln: keine Steigerung, keine Variante, Einheit „×“."""
    return {"progression_pct": 0, "variant": "", "unit": ACTIVITY_UNIT, "base_value": _per_week(ex.get("base_value") or 1)}


def _merge_exercises(g: dict, incoming: list, cur_week: int) -> list:
    """Übernimmt die vom Client gesendete Übungsliste und schützt dabei alles,
    was nur der Server verwalten darf (Historie, Pausen, Overrides, Schlüssel).

    - Neue Übung: bekommt einen nie benutzten Schlüssel (alte Fortschritte einer
      gelöschten Übung dürfen nie einer neuen zugeordnet werden), startet in cur_week.
    - `set_goal`: Ziel ab dieser Woche. In der Startwoche einer Übung ist das der
      Startwert, danach ein Eintrag in `goal_overrides` (Vergangenheit bleibt).
    - `base_value` ist nach der Startwoche nicht mehr änderbar (würde rückwirkend wirken).
    - Steigerung: gilt ab dieser Woche (`progression_overrides`).
    Setzt g["used_keys"].
    """
    old_by_key = {e["key"]: e for e in g.get("exercises", [])}
    used = set(g.get("used_keys") or []) | set(old_by_key)
    keys = [e.key for e in incoming]
    if len(set(keys)) != len(keys):
        raise HTTPException(status_code=400, detail="Übungs-Keys müssen eindeutig sein")

    out = []
    for inc in incoming:
        ex = inc.model_dump()
        set_goal = ex.pop("set_goal", None)
        old = old_by_key.get(ex["key"])
        if old:
            ex["type"] = old.get("type", "exercise")  # Typ ändert sich nie nachträglich
        if ex.get("type") == "activity":
            ex.update(_activity_fields(ex))
            if set_goal is not None:
                set_goal = _per_week(set_goal)
        if not old:
            # Schlüssel immer vom Server: der vom Browser ist nur vorläufig.
            ex["key"] = _new_exercise_key(used)
            used.add(ex["key"])
            ex["added_week"] = cur_week
            ex["is_default"] = False
            if set_goal is not None:
                ex["base_value"] = max(0.0, float(set_goal))
            ex["progression_overrides"] = [{"from_week": cur_week, "pct": int(ex.get("progression_pct", 10))}]
            ex["goal_overrides"] = []
            ex["pauses"] = []
            ex["archived"] = False
            out.append(ex)
            continue

        added_week = int(old.get("added_week") or 1)
        merged = dict(old)
        for field in ("name", "unit", "icon"):
            merged[field] = ex.get(field, old.get(field))
        # Selbst umbenannt -> Name bleibt bei jedem Sprachwechsel so (Dean 2026-11-27, _rename_defaults)
        if (merged.get("name") or "").strip() != (old.get("name") or "").strip():
            merged["name_custom"] = True
        merged["type"] = old.get("type", "exercise")
        # Die Variante einer bestehenden Übung ändert sich nur über /upgrade
        # (alte Übung wird abgeschlossen, die Variante startet neu).
        merged["variant"] = old.get("variant", "")
        if cur_week == added_week:
            merged["base_value"] = float(ex.get("base_value") or 0)

        # Steigerung: ab dieser Woche.
        old_pct = int(old.get("progression_pct", 10))
        new_pct = int(ex.get("progression_pct", old_pct))
        ovs = list(old.get("progression_overrides") or []) or [{"from_week": added_week, "pct": old_pct}]
        if new_pct != old_pct:
            ovs = [o for o in ovs if isinstance(o, dict) and int(o.get("from_week") or 0) != cur_week]
            ovs.append({"from_week": cur_week, "pct": new_pct})
            ovs.sort(key=lambda o: int(o.get("from_week") or 0))
        merged["progression_pct"] = new_pct
        merged["progression_overrides"] = ovs

        # Ziel ab dieser Woche.
        if set_goal is not None:
            val = max(0.0, float(set_goal))
            others = [o for o in (old.get("goal_overrides") or [])
                      if isinstance(o, dict) and int(o.get("from_week") or 0) != cur_week]
            if cur_week == added_week:
                merged["base_value"] = val
                merged["goal_overrides"] = others
            else:
                others.append({"from_week": cur_week, "value": val})
                others.sort(key=lambda o: int(o.get("from_week") or 0))
                merged["goal_overrides"] = others
        out.append(merged)

    not_done = [e for e in out if _exercise_status(e) != "completed"]
    if len([e for e in not_done if not _is_activity(e)]) > MAX_EXERCISES:
        raise HTTPException(status_code=400, detail="Maximal 7 Übungen gleichzeitig")
    if len([e for e in not_done if _is_activity(e)]) > MAX_EXERCISES:
        raise HTTPException(status_code=400, detail="Maximal 7 Aktivitäten gleichzeitig")
    if not not_done:
        raise HTTPException(status_code=400, detail="Mindestens eine Übung muss aktiv sein")
    _normalize_exercise_colors(out)
    _ensure_progression_pct(out)
    g["used_keys"] = sorted(used)
    return out


@api_router.post("/goals/me/preview")
async def preview_my_goals(payload: GoalsUpdate, user: User = Depends(get_current_user)):
    """Berechnet die Ziele für eine ungespeicherte Übungsliste (Live-Vorschau in
    den Einstellungen). Speichert nichts. So gibt es die Rechenlogik nur einmal."""
    g = await _load_goals(user.user_id)
    cur_week = _current_week_of(g)
    preview = dict(g)
    preview["exercises"] = _merge_exercises(dict(g), payload.exercises, cur_week)
    state = await _compute_user_state(user.user_id, preview, cur_week)
    return {"current_week": cur_week, "exercises": preview["exercises"], "state": state}


@api_router.put("/goals/me")
async def update_my_goals(payload: GoalsUpdate, user: User = Depends(get_current_user)):
    g = await _load_goals(user.user_id)
    cur_week = _current_week_of(g)
    exercises = _merge_exercises(g, payload.exercises, cur_week)
    # Boosts gelöschter Übungen mitlöschen, damit "diese Woche schon geboostet" nicht hängt.
    keys = {e["key"] for e in exercises}
    pruned_boosts = [b for b in g.get("boosts", []) if b.get("exercise_key") in keys]
    await db.user_goals.update_one(
        {"user_id": user.user_id},
        {"$set": {"exercises": exercises, "boosts": pruned_boosts, "used_keys": g["used_keys"]}},
    )
    await _notify(user.user_id, {"type": "goals_updated", "user_id": user.user_id})
    return await get_my_goals(user)


class GoalNow(BaseModel):
    value: float

    @field_validator("value")
    @classmethod
    def _check(cls, v):
        if not math.isfinite(v) or v <= 0 or v > 1_000_000:
            raise ValueError("Ungültiges Ziel")
        return v


@api_router.post("/goals/me/exercises/{key}/goal")
async def set_goal_now(key: str, payload: GoalNow, user: User = Depends(get_current_user)):
    """Ziel ab dieser Woche setzen (wie „Ziel jetzt“ in den Einstellungen), z. B. aus dem Ziel-Vorschlag."""
    g = await _load_goals(user.user_id)
    cur_week = _current_week_of(g)
    ex = next((e for e in g.get("exercises", []) if e["key"] == key), None)
    if not ex or _exercise_status(ex) != "active":
        raise HTTPException(status_code=404, detail="Übung nicht gefunden")
    val = _round_goal(float(payload.value), ex.get("unit", ""))
    if cur_week == int(ex.get("added_week") or 1):
        ex["base_value"] = val
    else:
        ovs = [o for o in (ex.get("goal_overrides") or [])
               if isinstance(o, dict) and int(o.get("from_week") or 0) != cur_week]
        ovs.append({"from_week": cur_week, "value": val})
        ovs.sort(key=lambda o: int(o.get("from_week") or 0))
        ex["goal_overrides"] = ovs
    await db.user_goals.update_one({"user_id": user.user_id}, {"$set": {"exercises": g["exercises"]}})
    await _notify(user.user_id, {"type": "goals_updated", "user_id": user.user_id})
    return await get_my_goals(user)


class ExerciseStatusUpdate(BaseModel):
    action: str  # "pause" | "resume" | "complete"


@api_router.post("/goals/me/exercises/{key}/status")
async def set_exercise_status(key: str, payload: ExerciseStatusUpdate, user: User = Depends(get_current_user)):
    """Pausieren, Fortsetzen oder Abschließen einer Übung, wirksam ab dieser Woche.
    Abgeschlossen = pausiert + archiviert (Historie bleibt, für Freunde sichtbar)."""
    g = await _load_goals(user.user_id)
    cur_week = _current_week_of(g)
    exercises = g.get("exercises", [])
    ex = next((e for e in exercises if e["key"] == key), None)
    if not ex:
        raise HTTPException(status_code=404, detail="Übung nicht gefunden")
    status = _exercise_status(ex)
    pauses = [dict(p) for p in (ex.get("pauses") or []) if isinstance(p, dict)]
    action = payload.action

    if action in ("pause", "complete"):
        if status == "active":
            pauses.append({"from_week": cur_week, "to_week": None})
        ex["archived"] = action == "complete"
    elif action == "resume":
        if status == "active":
            return await get_my_goals(user)
        not_done = sum(1 for e in exercises if _exercise_status(e) != "completed")
        if status == "completed" and not_done >= MAX_EXERCISES:
            raise HTTPException(status_code=400, detail="Maximal 7 Übungen gleichzeitig")
        for p in pauses:
            if p.get("to_week") is None:
                p["to_week"] = max(int(p.get("from_week") or 0), cur_week)
        # In derselben Woche pausiert und fortgesetzt: leere Pause entfernen.
        pauses = [p for p in pauses if int(p.get("to_week") or 0) > int(p.get("from_week") or 0)]
        ex["archived"] = False
    else:
        raise HTTPException(status_code=400, detail="Unbekannte Aktion")

    ex["pauses"] = pauses
    # Alle pausieren ist erlaubt (Dean, 2026-11-25) – nur abschließen darf nicht alles.
    if not any(_exercise_status(e) != "completed" for e in exercises):
        raise HTTPException(status_code=400, detail="Mindestens eine Übung muss aktiv bleiben")
    # Ein Boost dieser Woche auf eine nun pausierte Übung verfällt.
    boosts = g.get("boosts", [])
    if action in ("pause", "complete"):
        boosts = [b for b in boosts if not (b.get("exercise_key") == key and b.get("week_number") == cur_week)]
    await db.user_goals.update_one(
        {"user_id": user.user_id},
        {"$set": {"exercises": exercises, "boosts": boosts}},
    )
    await _notify(user.user_id, {"type": "goals_updated", "user_id": user.user_id})
    return await get_my_goals(user)

def _starts_on(g: dict) -> Optional[str]:
    """Startdatum (ISO), falls das Programm erst in der Zukunft beginnt, sonst None."""
    sd = g.get("start_date")
    if isinstance(sd, str):
        sd = datetime.fromisoformat(sd)
    if not isinstance(sd, datetime):
        return None
    if sd.tzinfo is None:
        sd = sd.replace(tzinfo=timezone.utc)
    return sd.isoformat() if sd > datetime.now(timezone.utc) else None


# -------------------- Boost --------------------
@api_router.post("/boost")
async def boost_exercise(payload: BoostRequest, user: User = Depends(get_current_user)):
    g = await _load_goals(user.user_id)
    sd = g["start_date"]
    if isinstance(sd, str):
        sd = datetime.fromisoformat(sd)
    cur_week = _calc_week_number(sd, g.get("tz"))
    existing_keys = {e["key"] for e in g["exercises"]}
    if payload.exercise_key not in existing_keys:
        raise HTTPException(status_code=400, detail="Unknown exercise")
    if _starts_on(g):
        raise HTTPException(status_code=400, detail="Dein Programm startet erst am Montag")
    target_ex = next(e for e in g["exercises"] if e["key"] == payload.exercise_key)
    if _exercise_status(target_ex) != "active":
        raise HTTPException(status_code=400, detail="Pausierte Übungen können nicht geboostet werden")
    if target_ex.get("type") == "activity":
        raise HTTPException(status_code=400, detail="Aktivitäten können nicht geboostet werden")

    # Verwaiste Boosts (Uebung wurde inzwischen geloescht) zaehlen NICHT mehr
    # als "diese Woche bereits geboostet". Gleichzeitig raeumen wir solche
    # Eintraege beim naechsten Boost-Versuch direkt aus der DB auf, damit sie
    # auch nicht ins Boost-Ranking spielen.
    all_boosts = g.get("boosts", [])
    stale_boosts = [b for b in all_boosts if b.get("exercise_key") not in existing_keys]
    valid_boosts = [b for b in all_boosts if b.get("exercise_key") in existing_keys]
    if stale_boosts:
        await db.user_goals.update_one(
            {"user_id": user.user_id},
            {"$pull": {"boosts": {"exercise_key": {"$nin": list(existing_keys)}}}},
        )

    if any(b["week_number"] == cur_week for b in valid_boosts):
        raise HTTPException(status_code=400, detail="Du hast diese Woche bereits geboostet")
    new_boost = {
        "exercise_key": payload.exercise_key,
        "week_number": cur_week,
        "applied_at": datetime.now(timezone.utc).isoformat(),
        # Version 2: Boost ERSETZT die Wochen-Steigerung (insgesamt +25% in der
        # Boost-Woche statt zusaetzlich +25%). Alte Boosts ohne dieses Feld
        # behalten ihr urspruengliches Verhalten (siehe _boost_versions_for).
        "formula_version": 2,
    }
    await db.user_goals.update_one(
        {"user_id": user.user_id},
        {"$push": {"boosts": new_boost}},
    )
    await _notify(user.user_id, {
        "type": "boost_applied",
        "user_id": user.user_id,
        "user_name": user.name,
        "exercise_key": payload.exercise_key,
        "week_number": cur_week,
    })
    return {"ok": True, "boost": new_boost}

@api_router.delete("/boost")
async def cancel_boost(user: User = Depends(get_current_user)):
    g = await _load_goals(user.user_id)
    sd = g["start_date"]
    if isinstance(sd, str):
        sd = datetime.fromisoformat(sd)
    cur_week = _calc_week_number(sd, g.get("tz"))
    existing_keys = {e["key"] for e in g["exercises"]}
    boosts = g.get("boosts", [])
    # Nur Boosts beachten, deren Uebung noch existiert. Verwaiste Eintraege
    # werden ohnehin nicht ausgewertet und beim naechsten /boost aufgeraeumt.
    target = next(
        (b for b in boosts
         if b["week_number"] == cur_week and b.get("exercise_key") in existing_keys),
        None,
    )
    if not target:
        raise HTTPException(status_code=404, detail="Kein aktiver Boost diese Woche")
    await db.user_goals.update_one(
        {"user_id": user.user_id},
        {"$pull": {"boosts": {"week_number": cur_week, "exercise_key": target["exercise_key"]}}},
    )
    await _notify(user.user_id, {
        "type": "boost_canceled",
        "user_id": user.user_id,
        "user_name": user.name,
        "exercise_key": target["exercise_key"],
        "week_number": cur_week,
    })
    return {"ok": True}
