"""Verlauf je Übung in den Insights (Plan 5): Wochenwert, Ziel, Status, Bestwoche."""
from test_progression import goals, set_start


def test_history_lists_past_and_current_weeks(auth, user, db):
    set_start(db, user, 2)  # Woche 3
    g = goals(auth)
    w1 = g["state"]["ex2"]["progression"][0]["goal"]
    auth.put("/api/progress/me", json={"week_number": 1, "values": {"ex2": w1}})
    auth.put("/api/progress/me", json={"week_number": 2, "values": {"ex2": 10}})
    auth.put("/api/progress/me", json={"week_number": 3, "values": {"ex2": 300}})
    ex = next(e for e in auth.get("/api/insights/me").json()["exercises"] if e["key"] == "ex2")
    hist = ex["history"]
    assert [h["week"] for h in hist] == [1, 2, 3]
    assert [h["status"] for h in hist] == ["completed", "missed", "current"]
    assert [h["value"] for h in hist] == [w1, 10, 300]
    assert hist[0]["goal"] == w1
    assert ex["best_week"] == 3


def test_history_without_entries_has_no_best_week(auth, user, db):
    set_start(db, user, 1)  # Woche 2
    ex = next(e for e in auth.get("/api/insights/me").json()["exercises"] if e["key"] == "ex1")
    assert [h["week"] for h in ex["history"]] == [1, 2]
    assert ex["best_week"] is None
