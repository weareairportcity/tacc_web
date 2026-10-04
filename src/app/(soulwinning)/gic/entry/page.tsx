import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SW_CAMPAIGN } from "@/lib/soulwinning/api";
import { getCampaignBySlug } from "@/lib/soulwinning/campaign";
import { FieldApp } from "./FieldApp";

// Static, rebuilt at most every 5 minutes: the field app is a client-side app
// that talks to the Cloudflare API directly, so a page load costs no server work.
export const revalidate = 300;

// A manifest of its own, scoped to /gic, so the outreach app installs on its
// own without disturbing the camp manifest already served at /manifest.json.
export const metadata: Metadata = {
  title: "Soul Winning — Log a Soul",
  description: "Log every soul won during the outreach.",
  manifest: "/gic/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Soul Winning",
    statusBarStyle: "default",
  },
};

export default async function EntryPage() {
  const campaign = await getCampaignBySlug(SW_CAMPAIGN);
  if (!campaign) notFound();

  return <FieldApp campaign={campaign} />;
}
