// Soul Winning Tracker service worker.
//
// Deliberately narrow: it is registered with scope "/gic", so it only ever
// controls the outreach app. Bookings, Song of the Week, camp and the rest of
// theairportcitychurch.com are never routed through it and can never be served
// a stale response from this cache.

const CACHE = "swgic-v1";
const SHELL = ["/gic/entry", "/gic/manifest.json", "/logo.png"];

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
          keys.filter((key) => key.startsWith("swgic-") && key !== CACHE).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Allow the page to force an immediate update after a deploy.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// On weak field signal a request can hang for a minute without failing, and
// the phone shows a white screen the whole time. Past this, serve the cached
// shell (the app works offline) and let the network response refresh the cache.
const NETWORK_TIMEOUT_MS = 4000;

async function networkFirst(request, timeoutMs = 0) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  });
  network.catch(() => {}); // handled below; avoid an unhandled rejection after a timeout
  const fallback = async () =>
    (await cache.match(request)) || (await cache.match("/gic/entry"));

  try {
    const timedOut = timeoutMs
      ? new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
      : network;
    const first = await Promise.race([network, timedOut]);
    if (first) return first;
    // Slow: use the cache if there is one, otherwise keep waiting on the network.
    return (await fallback()) || (await network);
  } catch {
    const cached = await fallback();
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
  if (request.mode === "navigate" && url.pathname.startsWith("/gic")) {
    event.respondWith(networkFirst(request, NETWORK_TIMEOUT_MS));
    return;
  }

  // Next.js build assets are content-hashed, so they are safe to cache forever.
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/logo.png") {
    event.respondWith(cacheFirst(request));
    return;
  }

  // RSC payloads for the app's own routes.
  if (url.pathname.startsWith("/gic")) {
    event.respondWith(networkFirst(request));
  }
});
