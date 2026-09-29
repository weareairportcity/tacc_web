import { SW_API_SERVER as SW_API } from "./api";
import type { SwCampaign, SwLive } from "./types";

/**
 * Server-side reads for the soul winning pages. Both are cached by Next.js, so
 * the pages are static and rebuilt at most every few minutes — opening the
 * counter on 50 phones doesn't run 50 server renders.
 */

export async function getCampaignBySlug(slug: string): Promise<SwCampaign | null> {
  try {
    const response = await fetch(`${SW_API}/v1/campaign/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return ((await response.json()) as { campaign: SwCampaign }).campaign;
  } catch {
    return null;
  }
}

export async function getLive(slug: string): Promise<SwLive | null> {
  try {
    const response = await fetch(`${SW_API}/v1/live/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;
    return (await response.json()) as SwLive;
  } catch {
    return null;
  }
}
