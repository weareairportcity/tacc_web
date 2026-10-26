/**
 * Commune's service worker. Network first, always: with signal, every
 * refresh is the latest version; without it, the last copy of a page (your
 * registration and pass, say) opens from the phone. Hashed build files are
 * cached for good since they never change. The check-in page is kept under
 * one address whatever pass it was opened with, so a pass scanned by the
 * camera app with no signal still opens it. Registered at "/" only on
 * commune.theairportcitychurch.com, where every path is Commune.
 */

const WORKER = `
const CACHE = "commune-v2";
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Commune</title><body style="margin:0;background:#fafaf9;font:16px/1.6 system-ui,sans-serif;color:#0c0a09;display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center"><div><p style="font-size:22px;margin:0 0 8px">No signal</p><p style="margin:0;color:#78716c">Open this page once while online and it will work offline next time.</p></div>';

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("commune-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Payments, sign-in callbacks and APIs are never served from a cache.
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/paid") || url.pathname.includes("/pay/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/commune/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      })),
    );
    return;
  }

  // Check-in (…/check-in?t=PASS): one copy, whichever pass opened it. The page reads the pass from the address.
  const key = request.mode === "navigate" && url.pathname.endsWith("/check-in") ? url.origin + url.pathname : request;
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(key).then((hit) => hit || (request.mode === "navigate" ? new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } }) : Response.error())),
      ),
  );
});
`;

export const dynamic = "force-static";

export function GET() {
  return new Response(WORKER, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // A changed worker is picked up on the next visit.
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
