"""Varianten (Plan 1d): Feld `variant` an der Übung und Umstieg per
POST /goals/me/exercises/{key}/upgrade (alte Übung abschließen + Variante neu)."""
from test_progression import goals, log_all, payload, set_start


def upgrade(auth, key, **body):
    return auth.post(f"/api/goals/me/exercises/{key}/upgrade", json=body)


def test_upgrade_completes_old_and_starts_variant(auth, user, db):
    set_start(db, user, 2)  # Woche 3
    log_all(auth, 1, 1.0)
    log_all(auth, 2, 1.0)
    before = goals(auth)
    old_goal = before["state"]["ex2"]["current_goal"]
    old_color = next(e["color"] for e in before["exercises"] if e["key"] == "ex2")

    r = upgrade(auth, "ex2", variant="  +10   kg ")
    assert r.status_code == 200
    g = r.json()
    keys = [e["key"] for e in g["exercises"]]
    new = g["exercises"][keys.index("ex2") - 1]  # steht an der alten Stelle
    old = next(e for e in g["exercises"] if e["key"] == "ex2")

    assert g["state"]["ex2"]["status"] == "completed"
    assert old["archived"] is True
    assert new["key"] not in ("ex1", "ex2", "ex3")
    assert (new["name"], new["variant"], new["icon"]) == ("Liegestütze", "+10 kg", "pushup")
    assert new["added_week"] == 3
    assert new["base_value"] == round(old_goal * 0.6)  # Vorschlag 60 %
    assert new["color"] == old_color
    assert new["upgraded_from"] == "ex2"
    assert g["state"][new["key"]]["status"] == "active"
    assert g["state"][new["key"]]["current_goal"] == new["base_value"]


def test_upgrade_with_own_start_value_and_km_rounding(auth):
    g = upgrade(auth, "ex1", variant="Weste", start_value=3.14159).json()
    new = next(e for e in g["exercises"] if e.get("variant") == "Weste")
    assert new["base_value"] == 3.1
    assert new["unit"] == "km"


def test_upgrade_shows_on_board_and_in_archive(auth):
    upgrade(auth, "ex3", variant="+5 kg", start_value=10)
    me = auth.get("/api/board").json()["users"][0]
    names = [(e["name"], e["variant"]) for e in me["exercises"]]
    assert ("Klimmzüge", "+5 kg") in names
    assert [a["key"] for a in me["archived_exercises"]] == ["ex3"]
    assert me["archived_exercises"][0]["variant"] == ""


def test_upgrade_rejects_bad_input(auth):
    assert upgrade(auth, "nope", variant="+10 kg").status_code == 404
    assert upgrade(auth, "ex2", variant="   ").status_code == 400
    assert upgrade(auth, "ex2", variant="x" * 31).status_code == 422
    assert upgrade(auth, "ex2", variant="+10 kg", start_value=-1).status_code == 422
    auth.post("/api/goals/me/exercises/ex3/status", json={"action": "complete"})
    assert upgrade(auth, "ex3", variant="+10 kg").status_code == 400


def test_same_variant_again_is_rejected(auth):
    g = upgrade(auth, "ex2", variant="+10 kg", start_value=50).json()
    new_key = next(e["key"] for e in g["exercises"] if e.get("variant") == "+10 kg")
    assert upgrade(auth, new_key, variant="+10 kg").status_code == 400
    # Weitere Steigerung derselben Übung ist erlaubt.
    assert upgrade(auth, new_key, variant="+20 kg", start_value=30).status_code == 200


def test_upgrade_keeps_exercise_count(auth):
    for i in range(4):
        g = goals(auth)
        p = payload(g)
        p["exercises"].append({"key": f"new{i}", "name": f"Extra {i}", "unit": "", "icon": "squat",
                               "base_value": 10, "progression_pct": 5, "set_goal": 10})
        assert auth.put("/api/goals/me", json=p).status_code == 200
    # 7 Übungen gleichzeitig: Umstieg geht trotzdem (alte wird abgeschlossen).
    assert upgrade(auth, "ex2", variant="+10 kg", start_value=50).status_code == 200


def test_variant_of_existing_exercise_only_changes_via_upgrade(auth):
    g = goals(auth)
    p = payload(g, ex2={"variant": "+10 kg"})
    g = auth.put("/api/goals/me", json=p).json()
    assert next(e for e in g["exercises"] if e["key"] == "ex2").get("variant", "") == ""


def test_new_exercise_can_start_with_variant(auth):
    g = goals(auth)
    p = payload(g)
    p["exercises"].append({"key": "tmp", "name": "Kniebeugen", "unit": "", "icon": "squat",
                           "base_value": 20, "progression_pct": 5, "set_goal": 20, "variant": "+20 kg"})
    g = auth.put("/api/goals/me", json=p).json()
    assert any(e["name"] == "Kniebeugen" and e["variant"] == "+20 kg" for e in g["exercises"])


def test_back_to_base_exercise(auth):
    """Variante auch wieder „kleiner“ machen: +20 kg -> +10 kg -> ohne Gewicht (Dean, 2026-11-25)."""
    g = upgrade(auth, "ex2", variant="+20 kg", start_value=40).json()
    k20 = next(e["key"] for e in g["exercises"] if e.get("variant") == "+20 kg")
    g = upgrade(auth, k20, variant="+10 kg", start_value=60).json()
    k10 = next(e["key"] for e in g["exercises"] if e.get("variant") == "+10 kg")
    r = upgrade(auth, k10, variant="", start_value=100)
    assert r.status_code == 200, r.text
    base = [e for e in r.json()["exercises"] if not e.get("variant") and not e.get("archived") and e["name"] == "Liegestütze"]
    assert len(base) == 1 and base[0]["base_value"] == 100
