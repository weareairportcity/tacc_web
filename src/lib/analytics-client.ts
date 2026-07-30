"use client";

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";

  let visitorId = localStorage.getItem("tacc_visitor_id");
  if (!visitorId) {
    visitorId = "v_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem("tacc_visitor_id", visitorId);
  }
  return visitorId;
}

export function trackSongEvent(songId: string, eventType: "view" | "play") {
  if (typeof window === "undefined" || !songId) return;

  const visitorId = getOrCreateVisitorId();

  fetch("/api/sotw/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      song_id: songId,
      event_type: eventType,
      visitor_id: visitorId,
    }),
  }).catch((err) => console.warn("Failed to log analytics event:", err));
}
