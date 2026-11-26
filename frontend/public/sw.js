// Service Worker (Plan 10): Installieren als App, Erinnerungen per Push (Plan 5)
// und seit 2026-11-26 Offline-Start: die App-Dateien liegen am Gerät, damit die Seite ohne Netz lädt.
// - Seitenaufrufe: erst Netz (immer neueste Version), ohne Netz die gespeicherte Seite
// - /assets/* (Dateinamen mit Hash, ändern sich nie): aus dem Speicher, sonst Netz
// - übrige eigene Dateien (Icons, Coach-Aufnahmen …): aus dem Speicher, im Hintergrund auffrischen
// - Server-Daten (api.trackyourcrew.de) fasst er nicht an; die speichert die App selbst (lib/offline.js)
const CACHE = "tyc-app-v1";
const SHELL = "/index.html";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(new Request("/", { cache: "reload" })).then(() => c.match("/")).then((r) => r && c.put(SHELL, r))).catch(() => {})
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Server-Daten und fremde Seiten: wie ohne Service Worker

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(SHELL, copy)); }
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  if (url.pathname === "/sw.js") return;
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit || Response.error());
      return hit || net;
    })
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "TrackYourCrew";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "tyc",
      renotify: false,
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
