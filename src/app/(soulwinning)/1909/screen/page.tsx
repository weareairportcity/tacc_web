import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaignBySlug, getCampaignCounts } from "@/lib/soulwinning/campaign";
import { CounterView } from "../CounterView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "1909 — Big Screen",
  description: "Souls won for Christ, live.",
};

/**
 * The projector view: same live data, built to be read across a hall. No entry
 * form, no controls, nothing to tap — it is meant to be opened once and left up.
 */
export default async function BigScreenPage() {
  const campaign = await getCampaignBySlug("1909");
  if (!campaign) notFound();

  const counts = await getCampaignCounts(campaign.id);

  return <CounterView campaign={campaign} initialCounts={counts} variant="projector" />;
}
