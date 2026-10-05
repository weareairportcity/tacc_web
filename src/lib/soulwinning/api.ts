/**
 * The soul winning API on Cloudflare (workers/soulwinning). Phones call it
 * directly; the counter goes through the cached /api/soulwinning/live route;
 * admin calls go through the Next.js server with the admin secret.
 */

export const SW_API = process.env.NEXT_PUBLIC_SW_API_URL || "https://sw-api.theairportcitychurch.com";

/**
 * The address the Next.js *server* uses. Cloudflare's bot protection on
 * theairportcitychurch.com answers requests from Vercel's data-centre IPs with
 * 403, so server-to-server calls go to the Worker's workers.dev address, which
 * sits outside the zone. Browsers keep using the custom domain.
 */
export const SW_API_SERVER = process.env.SW_API_SERVER_URL || "https://soulwinning-api.jak-anyen.workers.dev";

/** Which campaign the soul winning pages serve. */
export const SW_CAMPAIGN = process.env.NEXT_PUBLIC_SW_CAMPAIGN ?? "gic";

// A request on weak signal can hang without ever failing. Sync runs one pass at a
// time, so one hung request would leave the phone on "pending sync" until the
// page is reloaded. Give up and let the queue retry instead.
const POST_TIMEOUT_MS = 20_000;
const PHOTO_TIMEOUT_MS = 45_000;

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ms) : undefined;
}

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
    signal: timeoutSignal(POST_TIMEOUT_MS),
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
      signal: timeoutSignal(PHOTO_TIMEOUT_MS),
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
