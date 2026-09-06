const CACHE_NAME = "aethercode-shell-v2";
const APP_SHELL = [
  "/",
  "/arena.html",
  "/arena.js",
  "/manifest.json",
  "/favicon.svg",
  "/static/site/aethermore.css",
  "/static/site/aethermore.js",
  "/static/cookie-consent.js",
  "/static/galactic-theme.css",
  "/static/galactic-stars.js",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/v1/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/mesh/") ||
    url.pathname.startsWith("/ws/")
  ) {
    return;
  }

  const isShellAsset = APP_SHELL.includes(url.pathname);
  const isNavigation = req.mode === "navigate";
  if (!isShellAsset && !isNavigation) return;

  event.respondWith(
    fetch(req)
      .then(async (res) => {
        if (res && res.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, res.clone());
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (isNavigation) {
          const home = await caches.match("/");
          if (home) return home;
        }
        return Response.error();
      })
  );
});
