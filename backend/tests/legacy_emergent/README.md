# Legacy-Tests (Emergent)

Diese Tests stammen aus der Emergent-Vorschauumgebung. Sie brauchen `mongosh`,
eine laufende Instanz unter einer Emergent-URL und prüfen teils eine alte API
(`session_id`). Sie laufen lokal nicht und werden von pytest nicht eingesammelt
(siehe `collect_ignore` in `tests/conftest.py`).

Sie bleiben als Ideensammlung liegen. Brauchbare Fälle nach und nach in die
Offline-Tests unter `tests/` übernehmen, dann diesen Ordner löschen.
