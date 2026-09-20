import { createClient } from "@/utils/supabase/server";
import type { SwCampaign, SwCounts } from "./types";
import { listMarqueePhotoPaths } from "./marquee-paths";

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
    return { ...campaign, goal_total: NINETEEN_OH_NINE_GOAL, active: false };
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

  const counts = (data as SwCounts) ?? null;
  if (!counts) return null;

  const paths = await listMarqueePhotoPaths(campaignId);
  if (paths.length === 0) return counts;

  return {
    ...counts,
    // last_photo_path stays whatever the latest soul is (often null). The
    // marquee always uses every submitted picture, not only the last one.
    recent_photo_paths: paths,
  };
}
