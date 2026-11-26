"""TrackYourCrew API – setzt die App zusammen (BACKLOG W1: Code liegt in Modulen).

  core.py         Konfiguration, Datenbank, App/Router, Modelle, Live-Verbindungen, Login-Helfer, Admin-Meldungen
  goals.py        Ziele + Progression (einzige Rechenstelle), Übungen, Pausen, Varianten, Boost
  social.py       Freunde/Anfragen, Emojis, Challenges
  routes_auth.py  Google-Login, Konto, Einstellungen, Profil, Daten-Export/Löschen
  board.py        Fortschritt, Crew-Board, Ziel-Vorschläge, Animationen, Meilensteine, Auswertung
  push.py         Erinnerungen (Web Push), WebSocket
  stats.py        Prozent-Vergleiche

Alle Namen der Module werden hier weiter exportiert, damit `server.xyz` (Tests, dev_server) gültig bleibt.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, Depends, BackgroundTasks
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.exception_handlers import http_exception_handler
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import math
from contextlib import asynccontextmanager
import base64
import hashlib
import re
import os
import logging
import httpx
from pathlib import Path
from pydantic import BaseModel, field_validator
from typing import Optional, List, Set
import uuid
from datetime import datetime, timezone, timedelta
import secrets
from urllib.parse import urlencode
from google.oauth2 import id_token
from google.auth.transport import requests as g_requests
import i18n_messages

from core import (  # noqa: F401
    ALERT_COOLDOWN_S,
    ALERT_MAX_PER_DAY,
    AuthPreferencesUpdate,
    BACKEND_PUBLIC_URL,
    BASE_INCREASE,
    BOOST_INCREASE,
    BoostRequest,
    CRON_SECRET,
    ClientError,
    ConnectionManager,
    CustomStepsUpdate,
    DEFAULT_EXERCISES,
    EXERCISE_PALETTE,
    Exercise,
    FEEDBACK_CATEGORIES,
    FEEDBACK_MAX_PER_HOUR,
    FRONTEND_URL,
    FUTURE_WEEKS,
    FeedbackRequest,
    FriendAddRequest,
    FriendJoinRequest,
    FriendOrderUpdate,
    FriendRequestAnswer,
    FriendRequestsSetting,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CLOCK_SKEW_SECONDS,
    GoalsUpdate,
    HANDLE_ALPHABET,
    HideBoostButtonsUpdate,
    LiveSaveUpdate,
    ProfileUpdate,
    ProgressUpdate,
    ROOT_DIR,
    SESSION_HINT_COOKIE,
    STATS_MIN_USERS,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    User,
    VAPID_PRIVATE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_SUBJECT,
    VARIANT_MAX_LEN,
    _alert_admin,
    _alert_state,
    _audience,
    _backfill_handles,
    _challenge_query_for,
    _clean_variant_text,
    _create_session_and_set_cookie,
    _crew_ids,
    _deliver_feedback,
    _generate_unique_handle,
    _normalize_exercise_colors,
    _notify,
    _picture_ref,
    _picture_version,
    _rename_defaults,
    _send_telegram,
    _set_session_cookies,
    _upsert_google_user,
    api_router,
    app,
    client,
    db,
    default_exercises,
    get_current_user,
    logger,
    manager,
    mongo_url,
    report_client_error,
    send_feedback,
    translated_http_exception,
    unhandled_exception,
    user_avatar,
)
from goals import (  # noqa: F401
    DELOAD_AFTER_MISSES,
    DELOAD_FACTOR,
    ExerciseStatusUpdate,
    GoalNow,
    MAX_EXERCISES,
    PAUSE_LOSS,
    _boost_versions_for,
    _boosted_weeks_for,
    _calc_week_number,
    _compute_progression,
    _compute_user_state,
    _current_week_of,
    _ensure_progression_pct,
    _exercise_status,
    _get_pct_for_week,
    _load_goals,
    _merge_exercises,
    _new_exercise_key,
    _overrides_by_week,
    _pause_loss_factor,
    _paused_weeks,
    _progress_by_week,
    _round_goal,
    _starts_on,
    _week_monday,
    boost_exercise,
    cancel_boost,
    get_my_goals,
    preview_my_goals,
    set_exercise_status,
    set_goal_now,
    update_my_goals,
)
from social import (  # noqa: F401
    CHALLENGE_KINDS,
    CHALLENGE_MAX_INVITES,
    CHALLENGE_MAX_OPEN,
    ChallengeAccept,
    ChallengeCreate,
    EMOJIS,
    EMOJI_DAILY_MAX,
    EMOJI_PAIR_COOLDOWN_S,
    EmojiSeen,
    EmojiSend,
    ExerciseUpgrade,
    OnboardingRequest,
    PauseAll,
    TOUR_MAX_STEP,
    TourUpdate,
    UPGRADE_START_FACTOR,
    _challenge_out,
    _challenge_status,
    _challenge_value,
    _connect_friends,
    _drop_requests,
    _ex_brief,
    _get_challenge_for,
    _get_friend_ids_ordered,
    _next_monday,
    _participants,
    _program_week_for_monday,
    _public_user,
    _same_unit,
    _set_participant,
    _this_monday,
    accept_challenge,
    accept_friend_request,
    add_friend,
    create_challenge,
    decline_challenge,
    decline_friend_request,
    finish_onboarding,
    get_friend_requests_setting,
    join_via_invite,
    list_challenges,
    list_friend_requests,
    list_friends,
    mark_emojis_seen,
    pause_all,
    remove_friend,
    reorder_friends,
    reset_start_date,
    send_emoji,
    set_friend_requests_setting,
    set_tour_step,
    unseen_emojis,
    upgrade_exercise,
    withdraw_challenge,
)
from routes_auth import (  # noqa: F401
    AccountDelete,
    LanguageUpdate,
    _sanitize_custom_steps,
    delete_my_account,
    export_my_data,
    get_auth_prefs,
    get_custom_steps,
    get_hide_boost_buttons,
    get_live_save,
    google_callback,
    google_login_start,
    health_check,
    logout,
    me,
    process_session,
    set_auth_prefs,
    set_custom_steps,
    set_hide_boost_buttons,
    set_language,
    set_live_save,
    update_profile,
)
from board import (  # noqa: F401
    MAX_PROGRESS_VALUE,
    MILESTONES_MAX_PER_CALL,
    MILESTONE_ID_RE,
    MilestonesReport,
    SUGGEST_DOWN_MISSES,
    SUGGEST_DOWN_RATIO,
    SUGGEST_DOWN_WINDOW,
    SUGGEST_UP_RATIO,
    SUGGEST_UP_WEEKS,
    SeenEffectMark,
    _board_entry,
    _clean_number,
    _goal_suggestion,
    _milestones_out,
    _streak_info,
    _week_done,
    board,
    board_user,
    get_seen_effects,
    insights_me,
    mark_seen_effect,
    my_progress,
    report_milestones,
    update_progress,
)
from push import (  # noqa: F401
    PushSubscribe,
    REMINDER_DEFAULT,
    ReminderSettings,
    _local_now,
    _push_enabled,
    _reminder_loop,
    _reminder_of,
    _reminder_text,
    _resolve_ws_user_id,
    _send_push,
    add_push_subscription,
    cron_reminders,
    get_reminder,
    push_config,
    remove_push_subscription,
    root,
    run_reminders,
    set_reminder,
    test_push,
    websocket_endpoint,
)
from stats import (  # noqa: F401
    PERCENTILE_LEVELS,
    PercentileSeen,
    STAT_KIND_RE,
    StatKindItem,
    StatKinds,
    _percentile_out,
    _stat_values,
    _stats_cache,
    _week_values,
    mark_percentile_seen,
    my_percentiles,
    set_stat_kinds,
)

@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
async def site_root():
    """Antwortet 200 auf der Hauptadresse. Uptime-/Wecker-Dienste (z. B. cron-job.org)
    werten 404 als Fehler und deaktivieren den Job nach mehreren Fehlschlägen."""
    return {"ok": True, "service": "TrackYourCrew API", "health": "/api/health"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    # Nie '*' (Cookies/Credentials sind aktiv). Ohne Angabe nur die eigene Website.
    allow_origins=[o.strip() for o in os.environ.get('CORS_ORIGINS', FRONTEND_URL).split(',') if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

@asynccontextmanager
async def lifespan(_app):
    """Start/Ende des Servers (ersetzt das veraltete @app.on_event, BACKLOG W7).
    DB-Aufgaben laufen im Hintergrund, damit der Server sofort Anfragen annimmt
    (/api/health), auch wenn MongoDB langsam oder nicht erreichbar ist."""
    import asyncio
    app.state.db_startup_task = asyncio.create_task(startup_db_indexes())
    app.state.reminder_task = None
    if _push_enabled() and os.environ.get("DISABLE_REMINDER_LOOP") != "1":
        app.state.reminder_task = asyncio.create_task(_reminder_loop())
    try:
        yield
    finally:
        for task in (app.state.reminder_task, app.state.db_startup_task):
            if task and not task.done():
                task.cancel()
        client.close()


app.router.lifespan_context = lifespan


async def startup_db_indexes():
    try:
        await db.users.create_index("handle", unique=True, sparse=True)
    except Exception as e:
        logger.warning(f"handle index create failed: {e}")
    try:
        await _backfill_handles()
    except Exception as e:
        logger.warning(f"handle backfill failed: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=5000)