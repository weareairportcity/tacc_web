// Soul Winning Tracker service worker.
//
// Deliberately narrow: it is registered with scope "/1909", so it only ever
// controls the outreach app. Bookings, Song of the Week, camp and the rest of
// theairportcitychurch.com are never routed through it and can never be served
// a stale response from this cache.

const CACHE = "sw1909-v5";
const SHELL = ["/1909/entry", "/1909/manifest.json", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll rejects the whole install if any single item 404s; tolerate that.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("sw1909-") && key !== CACHE).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Allow the page to force an immediate update after a deploy.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = (await cache.match(request)) || (await cache.match("/1909/entry"));
    if (cached) return cached;
    throw new Error("offline and not cached");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase et al. go straight to the network

  // App shell: serve from cache when the signal drops mid-outreach.
  if (request.mode === "navigate" && url.pathname.startsWith("/1909")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Next.js build assets are content-hashed, so they are safe to cache forever.
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/logo.png") {
    event.respondWith(cacheFirst(request));
    return;
  }

  // RSC payloads for the app's own routes.
  if (url.pathname.startsWith("/1909")) {
    event.respondWith(networkFirst(request));
  }
});
