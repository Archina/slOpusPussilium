// Scope-aware so the same build works at "/" and at a subpath such as
// https://<user>.github.io/<repo>/ (GitHub Pages).
const SCOPE = self.registration.scope;
const INDEX = SCOPE;
const CACHE = "opus-pusillium-v5";

self.addEventListener("install", (event) => event.waitUntil(
  caches.open(CACHE)
    .then((cache) => cache.addAll([INDEX, new URL("manifest.webmanifest", SCOPE).href]))
    .then(() => self.skipWaiting()),
));

self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()),
));

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(INDEX))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  })));
});
