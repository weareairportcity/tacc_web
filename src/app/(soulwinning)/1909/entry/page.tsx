import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaignBySlug } from "@/lib/soulwinning/campaign";
import { FieldApp } from "./FieldApp";

export const dynamic = "force-dynamic";

const CAMPAIGN_SLUG = "1909";

// A manifest of its own, scoped to /1909, so the outreach app installs on its
// own without disturbing the camp manifest already served at /manifest.json.
export const metadata: Metadata = {
  title: "1909 — Log a Soul",
  description: "Log every soul won during the outreach.",
  manifest: "/1909/manifest.json",
  appleWebApp: {
    capable: true,
    title: "1909",
    statusBarStyle: "default",
  },
};

export default async function EntryPage() {
  const campaign = await getCampaignBySlug(CAMPAIGN_SLUG);
  if (!campaign) notFound();

  return <FieldApp campaign={campaign} />;
}
