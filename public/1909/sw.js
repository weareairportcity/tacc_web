// Retired: the 1909 outreach is over.
//
// Pages still open from the live outreach check for a new worker every 30
// minutes and whenever they come back into view. When they pick this one up it
// clears the old cache, unregisters itself and reloads each open 1909 tab onto
// the new static "outreach has ended" page, which stops the old tabs polling
// Supabase and our API. The new pages never register a worker again, so this
// only runs once per device.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("sw1909-")).map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) client.navigate(client.url);
    })()
  );
});
