import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaignBySlug, getCampaignCounts } from "@/lib/soulwinning/campaign";
import { CounterView } from "./CounterView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "1909 — Souls Won for Christ",
  description: "Souls won for Christ, live.",
};

/** The public live counter — what /1909 shows anyone who opens it. */
export default async function CounterPage() {
  const campaign = await getCampaignBySlug("1909");
  if (!campaign) notFound();

  const counts = await getCampaignCounts(campaign.id);

  return <CounterView campaign={campaign} initialCounts={counts} variant="public" />;
}
