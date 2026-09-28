"use client";

import { useEffect, useState } from "react";
import { campaignPhase } from "./api";
import type { SwCampaign, SwCounts, SwLive } from "./types";

// While the campaign is open, every screen polls the cached live route. The
// route is served from Vercel's CDN, so this interval sets how fresh the
// screens are — not how much work the server does.
const OPEN_POLL_MS = 15_000;
// Before opening nothing changes except the clock, so check rarely.
const BEFORE_POLL_MS = 60_000;

/**
 * Live campaign totals for the counter and big screen. Replaces the 1909
 * Supabase realtime channel plus the marquee and photo-signing polls. Stops
 * polling on its own once the campaign closes, so a projector left running
 * overnight costs nothing.
 */
export function useLiveCounts(campaign: SwCampaign, initial: SwCounts | null) {
  const [counts, setCounts] = useState<SwCounts | null>(initial);
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const response = await fetch("/api/soulwinning/live");
        if (!response.ok) throw new Error(String(response.status));
        const live = (await response.json()) as SwLive;
        if (cancelled) return;
        if (live.counts) setCounts(live.counts);
        setIsLive(true);
      } catch {
        if (!cancelled) setIsLive(false);
      }
      if (cancelled) return;
      const phase = campaignPhase(campaign);
      if (phase === "closed") return; // final numbers are in; stop polling
      timer = setTimeout(tick, phase === "open" ? OPEN_POLL_MS : BEFORE_POLL_MS);
    };

    void tick();

    // A tab coming back into view refreshes straight away.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || campaignPhase(campaign) !== "open") return;
      if (timer) clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [campaign]);

  return { counts, isLive };
}
