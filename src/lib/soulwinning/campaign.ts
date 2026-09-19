import { supabaseAdmin } from "@/lib/supabase";
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

  const counts = (data as SwCounts) ?? null;
  if (!counts) return null;

  // A later soul logged without a picture used to wipe last_photo_path, and
  // some live triggers never filled recent_photo_paths. Rebuild from entries
  // (paths only) so the hall marquee comes back after a refresh.
  if ((counts.recent_photo_paths?.length ?? 0) === 0 && !counts.last_photo_path) {
    const { data: photos } = await supabaseAdmin
      .from("sw_soul_entries")
      .select("photo_path")
      .eq("campaign_id", campaignId)
      .eq("counted", true)
      .not("photo_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(36);

    const paths = (photos ?? [])
      .map((row) => row.photo_path)
      .filter((path): path is string => Boolean(path));

    if (paths.length) {
      return { ...counts, last_photo_path: paths[0], recent_photo_paths: paths };
    }
  }

  return counts;
}
