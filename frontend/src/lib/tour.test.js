import { TOUR_STEPS } from "./tour";

describe("Tutorial-Schritte", () => {
  test("jeder Schritt mit Rückfall sagt, was geöffnet werden muss (Pfeil darf nicht zurückspringen)", () => {
    TOUR_STEPS.forEach((s) => {
      if (Number.isInteger(s.fallback)) expect(s.needs).toBeTruthy();
    });
  });

  test("Schritte mit Eintrag-Formular öffnen es, der erste schließt es", () => {
    const byId = Object.fromEntries(TOUR_STEPS.map((s) => [s.id, s]));
    ["mode", "gear", "options", "save"].forEach((id) => expect(byId[id].needs).toBe("log"));
    expect(byId.log.needs).toBe("log-closed");
    expect(byId.invite.needs).toBe("crew");
    expect(byId.back.needs).toBe("card-back");
    expect(byId.flip.needs).toBe("card-front");
  });
});

describe("Begrüßung und Rückfälle", () => {
  test("erster Schritt begrüßt ohne Ziel", () => {
    expect(TOUR_STEPS[0]).toMatchObject({ id: "welcome", target: null, advance: null });
  });
  test("Rückfälle zeigen auf den passenden Schritt", () => {
    const byId = Object.fromEntries(TOUR_STEPS.map((s) => [s.id, s]));
    ["mode", "gear", "options", "save"].forEach((id) => expect(TOUR_STEPS[byId[id].fallback].id).toBe("log"));
    expect(TOUR_STEPS[byId.invite.fallback].id).toBe("crew");
  });
});
