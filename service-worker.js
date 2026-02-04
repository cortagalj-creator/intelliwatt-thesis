// service-worker.js

const VERSION = "intelliwatt-v7"; // <-- change this number when you update files
const APP_SHELL = [
  "/",
  "/index.html",
  "/appliances.html",
  "/balance.html",
  "/history.html",
  "/ai.html",
  "/css/style.css",
  "/js/dashboard.js",
  "/js/appliances.js",
  "/js/balance.js",
  "/js/history.js",
  "/js/ai.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== VERSION ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// ✅ Network-first for HTML so navigation always gets newest page
// ✅ Cache-first for CSS/JS/icons so it still works offline
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // Always go network-first for API
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Network-first for HTML pages
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((fresh) => {
          const copy = fresh.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
          return fresh;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Cache-first for assets
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
