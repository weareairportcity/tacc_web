/**
 * The soul winning API on Cloudflare (workers/soulwinning). Phones call it
 * directly; the counter goes through the cached /api/soulwinning/live route;
 * admin calls go through the Next.js server with the admin secret.
 */

export const SW_API = process.env.NEXT_PUBLIC_SW_API_URL ?? "https://sw-api.theairportcitychurch.com";

/** Which campaign the soul winning pages serve. */
export const SW_CAMPAIGN = process.env.NEXT_PUBLIC_SW_CAMPAIGN ?? "gic";

export class SwApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function swPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${SW_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new SwApiError(response.status, data.error ?? `request failed (${response.status})`);
  return data as T;
}

export async function swPutPhoto(key: string, photo: Blob): Promise<boolean> {
  try {
    const response = await fetch(`${SW_API}/v1/photos/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: photo,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type CampaignWindow = { opens_at: string; closes_at: string };

export type CampaignPhase = "before" | "open" | "closed";

export function campaignPhase(c: CampaignWindow, now = Date.now()): CampaignPhase {
  if (now < Date.parse(c.opens_at)) return "before";
  if (now > Date.parse(c.closes_at)) return "closed";
  return "open";
}
