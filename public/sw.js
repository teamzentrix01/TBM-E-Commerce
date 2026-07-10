/* Retires any legacy service worker that may be serving stale Next.js chunks. */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.map((key) => caches.delete(key))),
      ),
      self.registration.unregister(),
      self.clients.matchAll({ type: "window" }).then((clients) =>
        Promise.all(
          clients.map((client) =>
            "navigate" in client ? client.navigate(client.url) : null,
          ),
        ),
      ),
    ]),
  );
});
