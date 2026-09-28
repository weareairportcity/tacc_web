"use client";

import { useEffect } from "react";

const CHECK_MS = 30 * 60 * 1000;

/**
 * Keep the outreach PWA from sitting on an old build.
 *
 * The worker already skip-waits on install. The missing piece is asking the
 * browser to look for a new worker while the hall screen or a member's phone
 * stays open for hours — browsers only check on navigation by default.
 */
export function useSoulWinningServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          if (registration.scope.includes("/1909")) void registration.unregister();
        }
      });
      void caches.keys().then((keys) => {
        for (const key of keys) if (key.startsWith("sw1909-")) void caches.delete(key);
      });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastCheck = 0;
    let onVisible: (() => void) | null = null;

    const check = async (registration: ServiceWorkerRegistration) => {
      const now = Date.now();
      if (lastCheck !== 0 && now - lastCheck < CHECK_MS) return;
      lastCheck = now;
      await registration.update();
    };

    // First install should not reload; a later worker taking over should.
    let reloadOnChange = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      if (!reloadOnChange) {
        reloadOnChange = true;
        return;
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator.serviceWorker
      .register("/1909/sw.js", { scope: "/1909", updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;
        lastCheck = Date.now();
        void registration.update();
        timer = setInterval(() => void check(registration), CHECK_MS);
        onVisible = () => {
          if (document.visibilityState === "visible") void check(registration);
        };
        document.addEventListener("visibilitychange", onVisible);
      });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
}
