import { crewScore, crewTable } from "./score";

const u = (name, completed, current) => ({ user_id: name, name, streak: { completed_weeks: completed, current } });

test("10 Punkte je geschaffter Woche + 2 je Woche laufender Streak", () => {
  expect(crewScore(u("a", [1, 2, 3, 5, 6], 2))).toEqual({ weeks: 5, streak: 2, points: 54 });
  expect(crewScore({})).toEqual({ weeks: 0, streak: 0, points: 0 });
});

test("Tabelle: Punkte, dann Streak, dann Name", () => {
  const rows = crewTable([u("Mia", [1, 2], 0), u("Leo", [1], 1), u("Anton", [1], 1), u("Dean", [1, 2, 3], 3)]);
  expect(rows.map((r) => r.user.name)).toEqual(["Dean", "Mia", "Anton", "Leo"]);
});
