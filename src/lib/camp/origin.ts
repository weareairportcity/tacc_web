import { headers } from "next/headers";

/**
 * The site address for links we send out (sign-in texts, room texts,
 * Paystack's return URL). CAMP_PUBLIC_URL pins it in production so a request's
 * Host header can't change where those links point; without it (local dev)
 * the request's own host is used.
 */
export async function campOrigin() {
  const fixed = process.env.CAMP_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
