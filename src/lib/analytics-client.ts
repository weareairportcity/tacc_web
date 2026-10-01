"use client";

import { SW_API } from "./soulwinning/api";

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";

  let visitorId = localStorage.getItem("tacc_visitor_id");
  if (!visitorId) {
    visitorId = "v_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem("tacc_visitor_id", visitorId);
  }
  return visitorId;
}

export function trackSongEvent(songId: string, eventType: "view" | "play" | "repeat") {
  if (typeof window === "undefined" || !songId) return;

  const visitorId = getOrCreateVisitorId();

  // Straight to the Cloudflare API: a play costs no Vercel function.
  fetch(`${SW_API}/v1/sotw/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      song_id: songId,
      event_type: eventType,
      visitor_id: visitorId,
    }),
  }).catch((err) => console.warn("Failed to log analytics event:", err));
}
