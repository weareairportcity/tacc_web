import { createClient } from "@/utils/supabase/server";
import type { SwCampaign, SwCounts } from "./types";

const NINETEEN_OH_NINE_GOAL = 1909;

/** The campaign a soul-winning route is serving, looked up by its slug (e.g. "1909"). */
export async function getCampaignBySlug(slug: string): Promise<SwCampaign | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sw_campaigns")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  const campaign = (data as SwCampaign) ?? null;
  if (!campaign) return null;
  if (campaign.slug === "1909") {
    return { ...campaign, goal_total: NINETEEN_OH_NINE_GOAL };
  }
  return campaign;
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
