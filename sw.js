const CACHE = "acma-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./css/styles.css",
  "./js/store.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      return (
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          if (res.ok && e.request.url.startsWith(self.location.origin)) {
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }).catch(() => caches.match("./offline.html"))
      );
    })
  );
});
