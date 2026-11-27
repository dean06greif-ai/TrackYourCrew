"""Nutzungsstatistik + Wochenbericht per Telegram (Dean 2026-11-27).

Datensparsam: gezählt wird nur, welche Funktionen wie oft genutzt werden und wie lange man auf welcher
Seite ist – je Kalenderwoche und Nutzer, auf dem eigenen Server (kein Drittanbieter, keine Inhalte,
keine IP). Jeden Montag 0:00 (Berlin) geht der Bericht der Vorwoche an den Betreiber (Telegram).

Teil von server.py."""
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from core import CRON_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, User, _send_telegram, api_router, db, get_current_user, logger

REPORT_TZ = ZoneInfo("Europe/Berlin")

# Erlaubte Namen (alles andere wird verworfen) – Reihenfolge = Reihenfolge im Bericht
EVENTS = {
    "log_saved": "Fortschritt gespeichert",
    "voice_used": "Eintragen per Sprache",
    "stopwatch_started": "Stoppuhr",
    "workout_started": "Intervall-Timer gestartet",
    "music_played": "Workout-Musik",
    "challenge_sent": "Herausforderung gesendet",
    "emoji_sent": "Emoji geschickt",
    "card_flipped": "Karte umgedreht",
    "insights_opened": "Auswertung geöffnet",
    "ranking_opened": "Ranking geöffnet",
    "boost_used": "Boost benutzt",
    "friend_added": "Freund hinzugefügt",
    "invite_shared": "Einladungslink geteilt",
    "settings_saved": "Übungen gespeichert",
    "install_opened": "App-Installation geöffnet",
}
PAGES = {"dashboard": "Dashboard", "settings": "Einstellungen", "login": "Login", "legal": "Impressum/Datenschutz", "join": "Einladung"}
MAX_COUNT = 500          # je Meldung und Name
MAX_SECONDS = 4 * 3600   # je Meldung und Seite


def _week_tag(dt: datetime) -> str:
    y, w, _ = dt.astimezone(REPORT_TZ).isocalendar()
    return f"{y}-W{w:02d}"


class UsageReport(BaseModel):
    events: Dict[str, int] = {}
    pages: Dict[str, float] = {}


@api_router.post("/usage")
async def report_usage(payload: UsageReport, user: User = Depends(get_current_user)):
    inc = {}
    for k, v in (payload.events or {}).items():
        if k in EVENTS and isinstance(v, (int, float)) and v > 0:
            inc[f"events.{k}"] = int(min(v, MAX_COUNT))
    for k, v in (payload.pages or {}).items():
        if k in PAGES and isinstance(v, (int, float)) and v > 0:
            inc[f"pages.{k}"] = round(min(float(v), MAX_SECONDS), 1)
    if not inc:
        return {"ok": True}
    now = datetime.now(timezone.utc)
    await db.usage.update_one(
        {"week": _week_tag(now), "user_id": user.user_id},
        {"$inc": inc, "$set": {"last_at": now.isoformat()}},
        upsert=True,
    )
    return {"ok": True}


def _fmt_min(sec: float) -> str:
    m = sec / 60
    return f"{m:.1f} min" if m < 10 else f"{m:.0f} min"


async def build_weekly_report(week: str, week_start: datetime, week_end: datetime) -> str:
    docs = await db.usage.find({"week": week}, {"_id": 0}).to_list(100000)
    active = len(docs)
    total_users = await db.users.count_documents({})
    new_users = 0
    async for u in db.users.find({}, {"_id": 0, "created_at": 1}):
        c = u.get("created_at")
        try:
            c = datetime.fromisoformat(c) if isinstance(c, str) else c
            if c and c.tzinfo is None:
                c = c.replace(tzinfo=timezone.utc)
            if c and week_start <= c < week_end:
                new_users += 1
        except Exception:
            pass
    push = len(await db.push_subscriptions.distinct("user_id"))
    lines = [
        f"📊 TrackYourCrew – Woche {week}",
        f"({week_start.astimezone(REPORT_TZ):%d.%m.} – {(week_end - timedelta(days=1)).astimezone(REPORT_TZ):%d.%m.%Y})",
        "",
        f"👥 Nutzer gesamt: {total_users}  ·  neu: {new_users}",
        f"🟢 Aktiv diese Woche: {active}" + (f" ({active * 100 // total_users} %)" if total_users else ""),
        f"🔔 Erinnerungen an: {push}",
    ]
    if active:
        lines += ["", "⏱ Ø Zeit je aktivem Nutzer:"]
        tot_all = 0.0
        for k, label in PAGES.items():
            s = sum((d.get("pages") or {}).get(k, 0) for d in docs)
            tot_all += s
            if s:
                lines.append(f"  • {label}: {_fmt_min(s / active)}")
        lines.append(f"  • gesamt: {_fmt_min(tot_all / active)}")
        used, unused = [], []
        for k, label in EVENTS.items():
            n = sum((d.get("events") or {}).get(k, 0) for d in docs)
            people = sum(1 for d in docs if (d.get("events") or {}).get(k, 0) > 0)
            (used if n else unused).append((n, people, label))
        used.sort(key=lambda x: -x[0])
        lines += ["", "🔥 Funktionen (Anzahl · Nutzer):"]
        lines += [f"  • {label}: {n} · {people}" for n, people, label in used] or ["  –"]
        if unused:
            lines += ["", "💤 Nicht benutzt: " + ", ".join(label for _, _, label in unused)]
    else:
        lines += ["", "Keine Nutzung erfasst."]
    return "\n".join(lines)


def _last_week_bounds(now: datetime):
    local = now.astimezone(REPORT_TZ)
    this_monday = (local - timedelta(days=local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    prev_monday = this_monday - timedelta(days=7)
    return _week_tag(prev_monday), prev_monday, this_monday


async def run_weekly_report(now: Optional[datetime] = None, force: bool = False) -> bool:
    """Ab Montag 0:00 (Berlin) einmal den Bericht der Vorwoche schicken."""
    now = now or datetime.now(timezone.utc)
    week, start, end = _last_week_bounds(now)
    meta = await db.migrations.find_one({"_id": "weekly_report"}) or {}
    if not force and meta.get("week") == week:
        return False
    # Zähler höchstens 12 Monate aufheben (Datenschutz)
    await db.usage.delete_many({"week": {"$lt": _week_tag(now - timedelta(days=365))}})
    text = await build_weekly_report(week, start, end)
    ok = await _send_telegram(text)
    # Fehlgeschlagen (Netz)? Beim nächsten Durchlauf nochmal – außer Telegram ist gar nicht eingerichtet
    if ok or not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID):
        await db.migrations.update_one({"_id": "weekly_report"}, {"$set": {"week": week, "sent": ok}}, upsert=True)
    return ok


async def _weekly_report_loop():
    import asyncio
    while True:
        try:
            await run_weekly_report()
        except Exception as e:
            logger.warning(f"weekly report: {e}")
        await asyncio.sleep(600)


@api_router.post("/cron/weekly-report")
async def cron_weekly_report(request: Request):
    """Für einen externen Wecker (Header X-Cron-Secret), falls der Server montags schläft."""
    if not CRON_SECRET or request.headers.get("X-Cron-Secret", "") != CRON_SECRET:
        raise HTTPException(status_code=403, detail="forbidden")
    return {"sent": await run_weekly_report()}
