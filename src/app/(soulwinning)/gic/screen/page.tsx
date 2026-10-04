import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SW_CAMPAIGN } from "@/lib/soulwinning/api";
import { getCampaignBySlug, getLive } from "@/lib/soulwinning/campaign";
import { CounterView } from "../CounterView";

// Static, rebuilt at most once a minute. The live numbers come from the
// CDN-cached /api/soulwinning/live feed the page polls, never a render per view.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Soul Winning — Big Screen",
  description: "Souls won for Christ, live.",
};

export default async function Page() {
  const campaign = await getCampaignBySlug(SW_CAMPAIGN);
  if (!campaign) notFound();
  const live = await getLive(SW_CAMPAIGN);

  return <CounterView campaign={campaign} initialCounts={live?.counts ?? null} variant="projector" />;
}
