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
  
  // If playing, ensure a view event is also logged if not yet tracked in this session
  if (eventType === "play" && !sessionStorage.getItem(`tracked_view_${songId}`)) {
    trackSongEvent(songId, "view");
  }

  // Deduplicate rapid view calls in session storage
  const sessionKey = `tracked_${eventType}_${songId}`;
  if (eventType === "view" && sessionStorage.getItem(sessionKey)) {
    return;
  }
  if (eventType === "view") {
    sessionStorage.setItem(sessionKey, "1");
  }

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
