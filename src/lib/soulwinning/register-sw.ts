"use client";

import { useEffect } from "react";

/**
 * The outreach is over, so the 1909 PWA is retired: instead of registering the
 * service worker, remove any copy a phone or projector still has, along with
 * its cache. public/1909/sw.js is now a self-removing worker for the devices
 * that are still running the old page and never come back here.
 */
export function useSoulWinningServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        if (registration.scope.includes("/1909")) void registration.unregister();
      }
    });
    void caches.keys().then((keys) => {
      for (const key of keys) if (key.startsWith("sw1909-")) void caches.delete(key);
    });
  }, []);
}
