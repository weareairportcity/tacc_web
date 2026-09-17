import { createClient } from "@/utils/supabase/server";
import type { SwCampaign, SwCounts } from "./types";

/** The campaign a soul-winning route is serving, looked up by its slug (e.g. "1909"). */
export async function getCampaignBySlug(slug: string): Promise<SwCampaign | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sw_campaigns")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  return (data as SwCampaign) ?? null;
}

/** Aggregate counts only — never raw entries, so nothing personal reaches a public page. */
export async function getCampaignCounts(campaignId: string): Promise<SwCounts | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sw_counts")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  return (data as SwCounts) ?? null;
}
