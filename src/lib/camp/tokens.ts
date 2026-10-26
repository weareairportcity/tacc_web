import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { campSecret } from "./codes";

/**
 * Links that carry a registration id, signed with CAMP_SECRET so they can't
 * be made up or pointed at someone else:
 *   pay      a pay link a parent or sponsor can open without signing in
 *   checkin  the QR on the attendee's pass, which a coordinator scans
 * Each purpose has its own signature, so a pay link can't check anyone in.
 */

export type TokenPurpose = "pay" | "checkin";

const sign = (purpose: TokenPurpose, id: string) =>
  createHmac("sha256", campSecret()).update(`camp-${purpose}.${id}`).digest("base64url").slice(0, 22);

export const makeToken = (purpose: TokenPurpose, registrationId: string) => `${registrationId}.${sign(purpose, registrationId)}`;

/** The registration id a token names, or null if it wasn't made by us for this purpose. */
export function readToken(purpose: TokenPurpose, token: string): string | null {
  const [id, signature] = String(token ?? "").split(".");
  if (!id || !signature || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const a = createHash("sha256").update(signature).digest();
  const b = createHash("sha256").update(sign(purpose, id)).digest();
  return timingSafeEqual(a, b) ? id : null;
}
