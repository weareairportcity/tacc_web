"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { SwCounts } from "./types";

/**
 * Live campaign totals.
 *
 * Subscribes to the single sw_counts row for the campaign, never to
 * sw_soul_entries — the public counter is only ever handed aggregates plus the
 * first name of the latest soul, so no personal data reaches the big screen.
 */
export function useCampaignCounts(campaignId: string, initial: SwCounts | null) {
  const [counts, setCounts] = useState<SwCounts | null>(initial);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`sw_counts:${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sw_counts",
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          const next = payload.new as SwCounts;
          if (next?.campaign_id) setCounts(next);
        }
      )
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));

    // A projector left running for a day can miss events through a network
    // blip; a slow poll re-anchors the totals without hammering the database.
    const resync = setInterval(() => {
      void supabase
        .from("sw_counts")
        .select("*")
        .eq("campaign_id", campaignId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setCounts(data as SwCounts);
        });
    }, 60_000);

    return () => {
      clearInterval(resync);
      void supabase.removeChannel(channel);
    };
  }, [campaignId]);

  return { counts, isLive };
}
