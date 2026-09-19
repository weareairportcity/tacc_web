import { supabaseAdmin } from "@/lib/supabase";

/** Storage paths of counted souls that have a photo — names never leave this query. */
export async function listMarqueePhotoPaths(campaignId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("sw_soul_entries")
    .select("photo_path")
    .eq("campaign_id", campaignId)
    .eq("counted", true)
    .not("photo_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(36);

  return (data ?? [])
    .map((row) => row.photo_path)
    .filter((path): path is string => Boolean(path));
}
