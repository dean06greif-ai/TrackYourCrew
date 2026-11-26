import { pushSupport, urlBase64ToUint8Array, bufferToBase64Url } from "./push";

const all = { hasServiceWorker: true, hasPushManager: true, hasNotification: true };

describe("pushSupport", () => {
  test("Android mit allem -> ok", () => {
    expect(pushSupport({ platform: "android", ...all })).toBe("ok");
    expect(pushSupport({ platform: "installed", ...all })).toBe("ok");
  });
  test("iPhone im Browser -> erst installieren", () => {
    expect(pushSupport({ platform: "ios", ...all })).toBe("install-first");
  });
  test("PC -> desktop (wird nicht angezeigt)", () => {
    expect(pushSupport({ platform: "desktop", ...all })).toBe("desktop");
  });
  test("fehlende Browser-Funktion", () => {
    expect(pushSupport({ platform: "android", ...all, hasPushManager: false })).toBe("unsupported");
    expect(pushSupport({ platform: "inapp", ...all, hasNotification: false })).toBe("install-first");
  });
});

describe("Schlüssel umwandeln", () => {
  test("hin und zurück", () => {
    const key = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
    expect(bufferToBase64Url(bytes.buffer)).toBe(key);
  });
});
