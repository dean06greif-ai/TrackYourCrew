// Erinnerungen per Push (Plan 5, nur Handy): reine Hilfsfunktionen, getestet.

// Kann dieses Gerät Push?  "ok" | "install-first" (iPhone: erst zum Home-Bildschirm) | "unsupported" | "desktop"
export function pushSupport({ platform, hasServiceWorker, hasPushManager, hasNotification }) {
  if (platform === "desktop") return "desktop";
  // iPhone/iPad: Web Push gibt es nur in der installierten App (ab iOS 16.4)
  if (platform === "ios") return "install-first";
  if (!hasServiceWorker || !hasPushManager || !hasNotification) {
    return platform === "inapp" ? "install-first" : "unsupported";
  }
  return "ok";
}

// VAPID-Schlüssel (Base64url) -> Uint8Array für pushManager.subscribe
export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ArrayBuffer -> Base64url (für die Schlüssel des Abos)
export function bufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Zeitzone des Geräts (für „Sonntag 18 Uhr“ in Ortszeit)
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
  } catch {
    return "Europe/Berlin";
  }
}
