"""Prozent-Vergleiche (nur echte Daten, erst ab genug Nutzern).

Teil von server.py (aufgeteilt 2026-11-25, BACKLOG W1)."""
from fastapi import Depends
import math
import re
from pydantic import BaseModel, field_validator
from typing import Optional, List
from core import STATS_MIN_USERS, User, api_router, db, get_current_user
from goals import _load_goals

# -------------------- Prozent-Vergleiche (Plan 1e, nur echte Daten) --------------------
# Das Frontend erkennt die Übungsart am Namen (lib/exercises.js) und meldet je eigener Übung nur
# {key, kind, factor} (factor = Umrechnung in die Basis-Einheit km/Wdh./Sek.). Die Werte nimmt der Server
# selbst aus den Einträgen (bester Wochenwert), damit niemand Zahlen erfinden kann. Varianten
# („+10 kg“) zählen nicht. Ergebnis erst ab STATS_MIN_USERS Nutzern je Art, sonst nichts.
STAT_KIND_RE = re.compile(r"^[a-z_]{2,24}$")
PERCENTILE_LEVELS = (1, 5, 10, 25, 50)
_stats_cache = {"at": 0.0, "values": {}}


class StatKindItem(BaseModel):
    key: str
    kind: str
    factor: float

    @field_validator("kind")
    @classmethod
    def _k(cls, v):
        if not STAT_KIND_RE.match(v or ""):
            raise ValueError("invalid kind")
        return v

    @field_validator("factor")
    @classmethod
    def _f(cls, v):
        if not math.isfinite(v) or not (1e-6 <= v <= 100000):
            raise ValueError("invalid factor")
        return v


class StatKinds(BaseModel):
    items: List[StatKindItem]


def _week_values(pe: dict) -> dict:
    """Wochensumme je Übung aus einem Eintrag (Tage oder Gesamtwerte)."""
    out: dict = {}
    days = pe.get("days") or {}
    if days:
        for d in days.values():
            if isinstance(d, dict):
                for k, v in d.items():
                    try:
                        out[k] = out.get(k, 0.0) + float(v or 0)
                    except (TypeError, ValueError):
                        continue
    else:
        for k, v in (pe.get("values") or {}).items():
            try:
                out[k] = float(v or 0)
            except (TypeError, ValueError):
                continue
    return out


async def _stat_values() -> dict:
    """{kind: {user_id: bester Wochenwert in Basis-Einheit}} über alle Nutzer, 10 Minuten zwischengespeichert."""
    import time
    if time.time() - _stats_cache["at"] < 600:
        return _stats_cache["values"]
    values: dict = {}
    async for u in db.users.find({"stat_kinds": {"$exists": True}}, {"_id": 0, "user_id": 1, "stat_kinds": 1}):
        kinds = u.get("stat_kinds") or {}
        if not kinds:
            continue
        g = await db.user_goals.find_one({"user_id": u["user_id"]}, {"_id": 0, "exercises": 1}) or {}
        no_variant = {e["key"] for e in g.get("exercises", []) if not (e.get("variant") or "").strip()}
        best: dict = {}
        async for pe in db.progress_entries.find({"user_id": u["user_id"]}, {"_id": 0, "values": 1, "days": 1}):
            for k, v in _week_values(pe).items():
                if v > best.get(k, 0.0):
                    best[k] = v
        for key, info in kinds.items():
            if key not in no_variant or key not in best:
                continue
            val = best[key] * float(info.get("factor") or 1)
            per = values.setdefault(info["kind"], {})
            per[u["user_id"]] = max(per.get(u["user_id"], 0.0), val)
    _stats_cache.update(at=time.time(), values=values)
    return values


def _percentile_out(per_kind: dict, uid: str) -> Optional[dict]:
    """Obere X % für einen Nutzer (Rang 1 = bester). None, wenn zu wenige Nutzer oder kein Wert."""
    vals = [v for v in per_kind.values() if v > 0]
    mine = per_kind.get(uid, 0.0)
    if len(vals) < STATS_MIN_USERS or mine <= 0:
        return None
    # Anteil der Nutzer mit gleichem oder besserem Wert (Gleichstand zählt mit -> nie geschönt)
    rank = sum(1 for v in vals if v >= mine)
    top = math.ceil(100 * rank / len(vals))
    level = next((lv for lv in PERCENTILE_LEVELS if top <= lv), None)
    return {"n": len(vals), "top_pct": top, "level": level}


@api_router.post("/me/stat-kinds")
async def set_stat_kinds(payload: StatKinds, user: User = Depends(get_current_user)):
    g = await _load_goals(user.user_id)
    keys = {e["key"] for e in g.get("exercises", [])}
    kinds = {it.key: {"kind": it.kind, "factor": it.factor} for it in payload.items[:20] if it.key in keys}
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"stat_kinds": kinds}})
    _stats_cache["at"] = 0.0
    return {"ok": True, "count": len(kinds)}


@api_router.get("/me/percentiles")
async def my_percentiles(user: User = Depends(get_current_user)):
    """Je Übungsart: obere X % der TrackYourCrew-Athleten (nur ab STATS_MIN_USERS Nutzern)."""
    values = await _stat_values()
    udoc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "stat_kinds": 1, "percentile_seen": 1}) or {}
    out = {}
    for kind in {i.get("kind") for i in (udoc.get("stat_kinds") or {}).values()}:
        res = _percentile_out(values.get(kind, {}), user.user_id)
        if res:
            out[kind] = res
    return {"min_users": STATS_MIN_USERS, "kinds": out, "seen": udoc.get("percentile_seen") or {}}


class PercentileSeen(BaseModel):
    kind: str
    level: int

    @field_validator("kind")
    @classmethod
    def _k(cls, v):
        if not STAT_KIND_RE.match(v or ""):
            raise ValueError("invalid kind")
        return v

    @field_validator("level")
    @classmethod
    def _l(cls, v):
        if v not in PERCENTILE_LEVELS:
            raise ValueError("invalid level")
        return v


@api_router.post("/me/percentile-seen")
async def mark_percentile_seen(payload: PercentileSeen, user: User = Depends(get_current_user)):
    """Gezeigte Stufe merken (je Art nur die beste), damit jede Meldung nur einmal kommt – auf allen Geräten."""
    udoc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "percentile_seen": 1}) or {}
    seen = dict(udoc.get("percentile_seen") or {})
    if payload.kind not in seen or payload.level < int(seen[payload.kind]):
        seen[payload.kind] = payload.level
        await db.users.update_one({"user_id": user.user_id}, {"$set": {"percentile_seen": seen}})
    return {"seen": seen}
