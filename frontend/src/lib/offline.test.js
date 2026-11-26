import { describe, test, expect } from "vitest";
import { mergeDays, queueEntry, sumsFromDays, isNetworkError, alreadyApplied } from "./offline";

describe("mergeDays: Konflikt ohne Datenverlust", () => {
  test("eigene Änderung wird auf den neueren Server-Stand aufgerechnet", () => {
    const base = { 3: { push: 10 } };            // Stand, als ich offline ging
    const local = { 3: { push: 30, lauf: 5 } };  // offline: +20 Liegestütze, +5 km
    const server = { 3: { push: 15 }, 2: { pull: 8 } }; // inzwischen am PC: +5 Liegestütze, gestern Klimmzüge
    expect(mergeDays(server, base, local)).toEqual({ 3: { push: 35, lauf: 5 }, 2: { pull: 8 } });
  });
  test("offline verringert: Abzug, aber nie unter 0", () => {
    expect(mergeDays({ 3: { push: 4 } }, { 3: { push: 10 } }, { 3: { push: 0 } })).toEqual({ 3: { push: 0 } });
  });
  test("keine eigene Änderung -> Server-Stand bleibt", () => {
    expect(mergeDays({ 1: { a: 2 } }, { 1: { a: 1 } }, { 1: { a: 1 } })).toEqual({ 1: { a: 2 } });
  });
});

describe("queueEntry: ein Eintrag je Woche, Basis bleibt", () => {
  test("zweite Offline-Änderung ersetzt die erste, behält aber Basis + base_updated_at", () => {
    const e1 = { userId: "u", baseDays: { 3: { push: 10 } }, payload: { week_number: 9, base_updated_at: "T1", days: { 3: { push: 20 } } } };
    const e2 = { userId: "u", baseDays: { 3: { push: 20 } }, payload: { week_number: 9, base_updated_at: "T2", days: { 3: { push: 25 } } } };
    const box = queueEntry(queueEntry([], e1), e2);
    expect(box).toHaveLength(1);
    expect(box[0].baseDays).toEqual({ 3: { push: 10 } });
    expect(box[0].payload).toEqual({ week_number: 9, base_updated_at: "T1", days: { 3: { push: 25 } } });
  });
  test("andere Woche = eigener Eintrag", () => {
    const a = { userId: "u", baseDays: {}, payload: { week_number: 9, days: {} } };
    const b = { userId: "u", baseDays: {}, payload: { week_number: 10, days: {} } };
    expect(queueEntry(queueEntry([], a), b)).toHaveLength(2);
  });
});

test("sumsFromDays", () => {
  expect(sumsFromDays({ 0: { push: 10, lauf: 2.5 }, 3: { push: 5, lauf: 0.1 } })).toEqual({ push: 15, lauf: 2.6 });
});

test("isNetworkError: nur ohne Antwort", () => {
  expect(isNetworkError({ message: "Network Error" })).toBe(true);
  expect(isNetworkError({ response: { status: 409 } })).toBe(false);
  expect(isNetworkError({ code: "ERR_CANCELED" })).toBe(false);
});

describe("alreadyApplied: nie doppelt zählen", () => {
  const base = { 3: { push: 10 } };
  const local = { 3: { push: 30 } };
  test("Anfrage kam an, Antwort ging verloren -> schon da", () => {
    expect(alreadyApplied({ 3: { push: 30 }, 2: { pull: 4 } }, base, local)).toBe(true);
  });
  test("anderes Gerät hat dieselbe Übung geändert -> nicht da, aufrechnen", () => {
    expect(alreadyApplied({ 3: { push: 15 } }, base, local)).toBe(false);
  });
  test("ohne eigene Änderung -> nichts zu tun gilt nicht als angekommen", () => {
    expect(alreadyApplied({ 3: { push: 10 } }, base, base)).toBe(false);
  });
});
