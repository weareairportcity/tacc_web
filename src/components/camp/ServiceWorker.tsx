"use client";

import { useEffect } from "react";

/**
 * Registers Commune's service worker (src/app/camps/sw.js). Whole-site scope
 * only on Commune's own host; on the main church site it stays inside /camps.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const ownHost = location.hostname.startsWith("commune.");
    navigator.serviceWorker.register("/camps/sw.js", { scope: ownHost ? "/" : "/camps/" }).catch(() => null);
  }, []);
  return null;
}
