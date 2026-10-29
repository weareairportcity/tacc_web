import { clientIp } from "./rate-limit";

/**
 * Cloudflare Turnstile: the free "are you a person" check on Register and Lost code, so a
 * script can't fill the camp with fake registrations or spend the SMS credit. Off until
 * TURNSTILE_SECRET_KEY (and NEXT_PUBLIC_TURNSTILE_SITE_KEY for the page) are set.
 */
export async function isHuman(token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  const ip = await clientIp();
  if (ip !== "unknown") body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, cache: "no-store" }).catch(() => null);
  // Cloudflare unreachable: let people through rather than close registration.
  if (!response) {
    console.error("turnstile: siteverify unreachable");
    return true;
  }
  const data = (await response.json().catch(() => null)) as { success?: boolean } | null;
  return Boolean(data?.success);
}
