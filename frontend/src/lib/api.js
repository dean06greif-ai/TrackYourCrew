import axios from "axios";
import { getLang } from "../i18n";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Profilbild-Quelle: der Server schickt für hochgeladene Bilder einen Link
// "/api/users/<id>/avatar?v=…" (Plan 9), Google-Bilder als volle URL.
export function avatarSrc(picture) {
  if (!picture) return null;
  return picture.startsWith("/api/") ? `${BACKEND_URL}${picture}` : picture;
}

// Profilbild beim Hochladen verkleinern: quadratisch zugeschnitten, 256×256 px,
// JPEG. Reicht für die größte Anzeige (128 px) auf hochauflösenden Displays.
export function shrinkImage(file, size = 256, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      const canvas = document.createElement("canvas");
      const out = Math.min(size, side);
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Token wird zusaetzlich zum HttpOnly-Cookie in localStorage gehalten.
// Grund: Cross-Site Cookies (SameSite=None) werden in Google-In-App-Browsern,
// Safari mit "Cross-Site-Tracking verhindern" und vielen Webviews blockiert.
// Mit Token in localStorage + Authorization-Header funktioniert Auth ueberall.
const TOKEN_KEY = "tracker_session_token";

export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
  },
  set(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  // Schutz gegen Render Cold Starts: keine endlos haengenden Requests.
  timeout: 15000,
});

// Bearer-Token automatisch an jeden Request anhaengen, falls vorhanden.
api.interceptors.request.use((config) => {
  const t = tokenStore.get();
  config.headers = config.headers || {};
  if (t) config.headers.Authorization = `Bearer ${t}`;
  // Server-Meldungen in der gewählten Sprache
  config.headers["Accept-Language"] = getLang();
  // Zeitzone des Geräts: der Server rechnet „heute“ und das Wochenende (So 24:00) in Ortszeit
  try { config.headers["X-Timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* egal */ }
  return config;
});

// 401 -> Token ist abgelaufen/ungueltig -> aufraeumen, damit der User nicht
// im Loop haengt.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) tokenStore.clear();
    return Promise.reject(err);
  }
);

export const wsUrl = () => {
  const url = new URL(BACKEND_URL);
  const proto = url.protocol === "https:" ? "wss:" : "ws:";
  const t = tokenStore.get();
  // Token auch an den WebSocket weiterreichen (Backend liest ?token=...).
  // Wichtig fuer Browser/Webviews, die Cookies blockieren.
  const qs = t ? `?token=${encodeURIComponent(t)}` : "";
  return `${proto}//${url.host}/api/ws${qs}`;
};