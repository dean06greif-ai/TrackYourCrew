import { installPlatform, shouldAutoShow, snoozedState, REMIND_AFTER_DAYS } from "./install";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const ANDROID_WHATSAPP = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 WhatsApp/2.24";
const IPHONE_GOOGLE_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/350.0.123 Mobile/15E148 Safari/604.1";
const IPHONE_WEBVIEW = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_GOOGLE_APP = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 GSA/15.0";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("installPlatform", () => {
  test.each([
    [IPHONE_SAFARI, "ios"],
    [IPHONE_CHROME, "inapp"],
    [IPHONE_INSTAGRAM, "inapp"],
    [ANDROID_CHROME, "android"],
    [ANDROID_WHATSAPP, "inapp"],
    [WINDOWS, "desktop"],
    [IPHONE_GOOGLE_APP, "inapp"],
    [IPHONE_WEBVIEW, "inapp"],
    [ANDROID_GOOGLE_APP, "inapp"],
  ])("%#", (ua, expected) => {
    expect(installPlatform({ ua })).toBe(expected);
  });

  test("schon installiert gewinnt immer", () => {
    expect(installPlatform({ ua: IPHONE_SAFARI, standalone: true })).toBe("installed");
  });

  test("iPad mit Desktop-Ansicht", () => {
    expect(installPlatform({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", touchMac: true })).toBe("ios");
  });
});

describe("shouldAutoShow: nicht nerven", () => {
  const now = 1_000_000_000_000;
  test("nie beim ersten Besuch, ab dem zweiten oder nach dem ersten Eintrag", () => {
    expect(shouldAutoShow("ios", { visits: 1 }, now)).toBe(false);
    expect(shouldAutoShow("ios", { visits: 2 }, now)).toBe(true);
    expect(shouldAutoShow("android", { visits: 1, logged: true }, now)).toBe(true);
  });
  test("nie in App-Browsern (Google-App, Instagram, Chrome am iPhone)", () => {
    expect(shouldAutoShow("inapp", { visits: 5, logged: true }, now)).toBe(false);
  });
  test("nie am PC und nie wenn installiert", () => {
    expect(shouldAutoShow("desktop", { visits: 5 }, now)).toBe(false);
    expect(shouldAutoShow("installed", { visits: 5 }, now)).toBe(false);
  });
  test("Später = 14 Tage Ruhe, Nicht mehr zeigen = nie", () => {
    const s = snoozedState({ visits: 3 }, now);
    expect(shouldAutoShow("ios", s, now + 1000)).toBe(false);
    expect(shouldAutoShow("ios", s, now + REMIND_AFTER_DAYS * 24 * 3600 * 1000 + 1)).toBe(true);
    expect(shouldAutoShow("ios", { visits: 9, never: true }, now)).toBe(false);
  });
});
