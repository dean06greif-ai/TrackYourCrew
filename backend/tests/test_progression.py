"""Progression: Ziele frei setzen, Pausieren/Abschließen, Abzug nach 4 verfehlten
Wochen, eindeutige Übungs-Schlüssel, Live-Vorschau, Wochen-geschafft-Event."""
from datetime import datetime, timedelta, timezone

from conftest import befriend, run


def set_start(db, user, weeks_ago):
    """Programmstart vor `weeks_ago` Wochen -> aktuelle Woche = weeks_ago + 1."""
    start = (datetime.now(timezone.utc) - timedelta(weeks=weeks_ago)).isoformat()
    run(db.user_goals.update_one({"user_id": user["user_id"]}, {"$set": {"start_date": start}}))


def goals(auth):
    return auth.get("/api/goals/me").json()


def payload(g, **changes):
    """Übungsliste für PUT /goals/me; changes = {key: {feld: wert}}."""
    out = []
    for e in g["exercises"]:
        item = {k: e[k] for k in ("key", "name", "unit", "icon", "base_value", "progression_pct")}
        item.update(changes.get(e["key"], {}))
        out.append(item)
    return {"exercises": out}


def log_all(auth, week, factor):
    """Trägt in `week` für alle Übungen Ziel x factor ein."""
    g = goals(auth)
    vals = {k: st["progression"][week - 1]["goal"] * factor for k, st in g["state"].items()}
    auth.put("/api/progress/me", json={"week_number": week, "values": vals})


def test_new_users_get_relaxed_defaults(auth):
    ex = {e["key"]: e for e in goals(auth)["exercises"]}
    assert (ex["ex1"]["base_value"], ex["ex2"]["base_value"], ex["ex3"]["base_value"]) == (5.0, 150, 20)
    assert all(e["progression_pct"] == 5 for e in ex.values())


def test_goal_change_applies_from_this_week_only(auth, user, db):
    set_start(db, user, 3)  # Woche 4
    for w in (1, 2, 3):
        log_all(auth, w, 1.0)
    before = goals(auth)["state"]["ex2"]["progression"]
    auth.put("/api/goals/me", json=payload(goals(auth), ex2={"set_goal": 100}))
    after = goals(auth)["state"]["ex2"]
    assert after["current_goal"] == 100
    assert [p["goal"] for p in after["progression"][:3]] == [p["goal"] for p in before[:3]]
    assert after["missed_weeks"] == []
    assert after["progression"][4]["goal"] == 105  # wächst ab 100 weiter (+5 %)


def test_start_value_not_retroactive_after_first_week(auth, user, db):
    set_start(db, user, 2)
    auth.put("/api/goals/me", json=payload(goals(auth), ex2={"base_value": 999}))
    assert goals(auth)["state"]["ex2"]["progression"][0]["goal"] == 150


def test_start_value_free_in_first_week(auth):
    auth.put("/api/goals/me", json=payload(goals(auth), ex2={"set_goal": 80}))
    assert goals(auth)["state"]["ex2"]["current_goal"] == 80


def test_default_exercises_can_be_deleted_any_time(auth, user, db):
    set_start(db, user, 5)
    body = payload(goals(auth))
    body["exercises"] = body["exercises"][:1]
    r = auth.put("/api/goals/me", json=body)
    assert r.status_code == 200, r.text
    assert [e["key"] for e in goals(auth)["exercises"]] == ["ex1"]


def test_new_exercise_never_reuses_old_key(auth, user, db):
    set_start(db, user, 1)
    auth.put("/api/progress/me", json={"week_number": 1, "values": {"ex3": 50}})
    body = payload(goals(auth))
    body["exercises"] = [e for e in body["exercises"] if e["key"] != "ex3"]
    auth.put("/api/goals/me", json=body)
    body["exercises"].append({"key": "ex3", "name": "Dips", "unit": "", "icon": "pushup",
                              "base_value": 30, "progression_pct": 5})
    auth.put("/api/goals/me", json=body)
    keys = [e["key"] for e in goals(auth)["exercises"]]
    assert "ex3" not in keys and len(keys) == 3
    me = auth.get("/api/board").json()["users"][0]
    assert me["all_time"][keys[-1]] == 0  # alte Klimmzüge zählen nicht für Dips


def test_pause_hides_exercise_from_card(auth, user, db):
    set_start(db, user, 2)  # Woche 3
    auth.post("/api/goals/me/exercises/ex3/status", json={"action": "pause"})
    g = goals(auth)
    assert g["state"]["ex3"]["status"] == "paused"
    assert g["state"]["ex3"]["progression"][2]["status"] == "paused"
    me = auth.get("/api/board").json()["users"][0]
    assert [e["key"] for e in me["exercises"]] == ["ex1", "ex2"]


def test_paused_weeks_do_not_break_streak(auth, user, db):
    set_start(db, user, 1)  # Woche 2
    log_all(auth, 1, 1.0)
    auth.post("/api/goals/me/exercises/ex3/status", json={"action": "pause"})
    set_start(db, user, 3)  # Woche 4, Pause seit Woche 2
    log_all(auth, 2, 1.0)
    log_all(auth, 3, 1.0)
    streak = auth.get("/api/board").json()["users"][0]["streak"]
    assert streak["current"] == 3


def test_resume_continues_with_last_goal(auth, user, db):
    set_start(db, user, 1)  # Woche 2
    log_all(auth, 1, 1.0)
    auth.post("/api/goals/me/exercises/ex2/status", json={"action": "pause"})
    set_start(db, user, 4)  # Woche 5, Pause lief Woche 2-4
    g = auth.post("/api/goals/me/exercises/ex2/status", json={"action": "resume"}).json()
    prog = g["state"]["ex2"]["progression"]
    assert [p["status"] for p in prog[1:4]] == ["paused"] * 3
    # keine Steigerung nach der Pause; 3 Pausenwochen = Formverlust 95 % (seit 2026-11-25): 150 -> 143
    assert g["state"]["ex2"]["current_goal"] == int(prog[0]["goal"] * 0.95 + 0.5)


def test_pause_and_resume_in_same_week_leaves_no_trace(auth):
    auth.post("/api/goals/me/exercises/ex2/status", json={"action": "pause"})
    g = auth.post("/api/goals/me/exercises/ex2/status", json={"action": "resume"}).json()
    ex2 = next(e for e in g["exercises"] if e["key"] == "ex2")
    assert ex2["pauses"] == []
    assert g["state"]["ex2"]["status"] == "active"


def test_complete_moves_to_archive_with_history(auth, user, db):
    set_start(db, user, 2)
    log_all(auth, 1, 1.0)
    log_all(auth, 2, 0.5)
    auth.post("/api/goals/me/exercises/ex3/status", json={"action": "complete"})
    me = auth.get("/api/board").json()["users"][0]
    assert "ex3" not in [e["key"] for e in me["exercises"]]
    arch = me["archived_exercises"]
    assert [a["key"] for a in arch] == ["ex3"]
    assert (arch[0]["weeks_done"], arch[0]["weeks_total"]) == (1, 2)
    assert [h["status"] for h in arch[0]["history"]] == ["completed", "missed"]


def test_friends_see_archived_exercises(auth, client, user, make_user, db):
    bob = make_user("Bob", handle="BOB22")
    client.post("/api/goals/me/exercises/ex3/status", json={"action": "complete"}, headers=bob["headers"])
    befriend(db, user, bob)
    bob_entry = auth.get("/api/board").json()["users"][1]
    assert [a["key"] for a in bob_entry["archived_exercises"]] == ["ex3"]


def test_last_active_exercise_can_be_paused(auth):
    # Seit 2026-11-25 (Urlaub/Krank entfernt) dürfen alle Übungen pausiert sein.
    auth.post("/api/goals/me/exercises/ex1/status", json={"action": "pause"})
    auth.post("/api/goals/me/exercises/ex2/status", json={"action": "pause"})
    assert auth.post("/api/goals/me/exercises/ex3/status", json={"action": "pause"}).status_code == 200


def test_paused_exercise_cannot_be_boosted(auth):
    auth.post("/api/goals/me/exercises/ex2/status", json={"action": "pause"})
    assert auth.post("/api/boost", json={"exercise_key": "ex2"}).status_code == 400


def test_deload_after_four_missed_weeks(auth, user, db):
    set_start(db, user, 5)  # Woche 6, Wochen 1-5 nichts eingetragen
    prog = goals(auth)["state"]["ex2"]["progression"]
    assert [p["status"] for p in prog[:5]] == ["missed"] * 5
    assert [p["goal"] for p in prog[:4]] == [150, 150, 150, 150]
    assert prog[4]["goal"] == 135  # nach 4 verfehlten Wochen -10 %


def test_no_deload_when_misses_are_interrupted(auth, user, db):
    set_start(db, user, 5)
    auth.put("/api/progress/me", json={"week_number": 4, "values": {"ex2": 150}})
    prog = goals(auth)["state"]["ex2"]["progression"]
    assert [p["status"] for p in prog[:4]] == ["missed", "missed", "missed", "completed"]
    assert prog[4]["goal"] == round(150 * 1.05)


def test_preview_does_not_save(auth):
    r = auth.post("/api/goals/me/preview", json=payload(goals(auth), ex2={"set_goal": 42})).json()
    assert r["state"]["ex2"]["current_goal"] == 42
    assert goals(auth)["state"]["ex2"]["current_goal"] == 150


def test_week_completed_event_on_progress(auth, user):
    g = goals(auth)
    with auth.websocket_connect(f"/api/ws?token={user['token']}") as ws:
        ws.receive_json()
        ws.receive_json()
        vals = {k: st["current_goal"] for k, st in g["state"].items()}
        auth.put("/api/progress/me", json={"week_number": 1, "values": vals})
        assert [ws.receive_json()["type"], ws.receive_json()["type"]] == ["progress_updated", "week_completed"]


def test_color_stays_with_exercise_when_reordered(auth):
    g = goals(auth)
    colors = {e["key"]: e["color"] for e in g["exercises"]}
    body = payload(g)
    for item in body["exercises"]:
        item["color"] = colors[item["key"]]
    body["exercises"].reverse()
    auth.put("/api/goals/me", json=body)
    after = {e["key"]: e["color"] for e in goals(auth)["exercises"]}
    assert after == colors


def test_new_exercise_does_not_steal_colors(auth):
    g = goals(auth)
    body = payload(g)
    colors = {e["key"]: e["color"] for e in g["exercises"]}
    for item in body["exercises"]:
        item["color"] = colors[item["key"]]
    body["exercises"].insert(1, {"key": "tmp", "name": "Dips", "unit": "", "icon": "pushup",
                                 "base_value": 30, "progression_pct": 5})
    auth.put("/api/goals/me", json=body)
    after = {e["key"]: e["color"] for e in goals(auth)["exercises"]}
    assert all(after[k] == c for k, c in colors.items())
    assert len(set(after.values())) == 4


def test_existing_users_keep_old_rules_for_past_weeks(auth, user, db):
    """Bestandsnutzer: Wochen vor dem Update werden wie früher berechnet."""
    set_start(db, user, 5)  # Woche 6, nichts eingetragen
    run(db.user_goals.update_one({"user_id": user["user_id"]}, {"$unset": {"rules_from_week": ""}}))
    g = goals(auth)  # erstes Laden nach dem Update -> rules_from_week = 6
    stored = run(db.user_goals.find_one({"user_id": user["user_id"]}))
    assert stored["rules_from_week"] == 6
    prog = g["state"]["ex2"]["progression"]
    # alte Regel: verfehlte 1. Woche steigert trotzdem, danach eingefroren, kein Abzug
    assert [p["goal"] for p in prog[:6]] == [150, 158, 158, 158, 158, 158]


# -------------------- Einführung (Tutorial) --------------------
def test_onboarding_sets_goals_and_starts_now(auth, user, db):
    run(db.users.update_one({"user_id": user["user_id"]}, {"$set": {"onboarding_done": False}}))
    assert auth.get("/api/auth/me").json()["onboarding_done"] is False
    r = auth.post("/api/me/onboarding", json={"start": "now", "goals": {"ex1": 3, "ex2": 80}, "progression_pct": 3}).json()
    assert r["starts_on"] is None
    g = goals(auth)
    assert g["state"]["ex1"]["current_goal"] == 3
    assert g["state"]["ex2"]["current_goal"] == 80
    assert all(e["progression_pct"] == 3 for e in g["exercises"])
    assert auth.get("/api/auth/me").json()["onboarding_done"] is True


def test_onboarding_start_monday_blocks_logging_until_then(auth):
    from datetime import datetime, timezone
    r = auth.post("/api/me/onboarding", json={"start": "monday"}).json()
    if datetime.now(timezone.utc).weekday() == 0:
        assert r["starts_on"] is None  # montags startet es sofort
        return
    assert r["starts_on"] is not None
    assert auth.get("/api/board").json()["users"][0]["starts_on"] == r["starts_on"]
    assert auth.put("/api/progress/me", json={"week_number": 1, "values": {"ex1": 1}}).status_code == 400
    assert auth.post("/api/boost", json={"exercise_key": "ex1"}).status_code == 400


def test_existing_users_have_no_onboarding_flag(auth):
    assert auth.get("/api/auth/me").json()["onboarding_done"] is None


# -------------------- Eingaben prüfen (BACKLOG S7) --------------------
def test_progress_rejects_bad_values(auth):
    for bad in (-5, 10_000_001, "abc"):
        r = auth.put("/api/progress/me", json={"week_number": 1, "values": {"ex1": bad}})
        assert r.status_code == 400, bad
    r = auth.put("/api/progress/me", json={"week_number": 1, "days": {"9": {"ex1": 1}}})
    assert r.status_code == 400


def test_progress_rejects_future_week(auth):
    assert auth.put("/api/progress/me", json={"week_number": 2, "values": {"ex1": 1}}).status_code == 400
    assert auth.put("/api/progress/me", json={"week_number": 0, "values": {"ex1": 1}}).status_code == 400
