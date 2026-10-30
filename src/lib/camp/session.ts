import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { campSecret } from "./codes";
import { getCampBySlug } from "./camps";
import { getRegistrationWithCode } from "./registrations";
import type { Camp, Registration } from "./types";

/**
 * An attendee's signed-in session: an httpOnly cookie naming their
 * registration, signed with CAMP_SECRET. The signature covers the code's
 * hash, so issuing a new code ("forgot your code") signs out old sessions.
 */

const COOKIE = "camp_attendee";
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAYS = 30;
// Browsers keep a cookie at most 400 days.
const MAX_DAYS = 400;

const sign = (payload: string) => createHmac("sha256", campSecret()).update(`camp-session.${payload}`).digest("base64url");
const same = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/**
 * Signed in until a few days after camp ends (at least 30 days), so most people type their
 * code once, on the day they register, and never again on that phone.
 */
export async function startAttendeeSession(registrationId: string, codeHash: string, campEndsOn?: string) {
  const untilCampEnds = campEndsOn ? Date.parse(`${campEndsOn}T23:59:59Z`) + 3 * DAY_MS : 0;
  const expires = Math.min(Date.now() + MAX_DAYS * DAY_MS, Math.max(Date.now() + MIN_DAYS * DAY_MS, untilCampEnds || 0));
  (await cookies()).set(COOKIE, `${registrationId}.${expires}.${sign(`${registrationId}.${expires}.${codeHash}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/camps",
    maxAge: Math.floor((expires - Date.now()) / 1000),
  });
}

export async function endAttendeeSession() {
  (await cookies()).delete({ name: COOKIE, path: "/camps" });
}

/** Whoever this phone is signed in as, if the cookie's signature checks out. Any camp. */
async function signedInRegistration(): Promise<Registration | null> {
  const [id, expires, signature] = (await cookies()).get(COOKIE)?.value.split(".") ?? [];
  if (!id || !signature || !(Number(expires) > Date.now())) return null;
  const found = await getRegistrationWithCode(id).catch(() => null);
  if (!found) return null;
  return same(signature, sign(`${id}.${expires}.${found.codeHash}`)) ? found.registration : null;
}

/** The signed-in attendee's registration for this camp, or null. Checked on every request. */
export async function currentAttendee(campId: string): Promise<Registration | null> {
  const me = await signedInRegistration();
  return me && me.camp_id === campId ? me : null;
}

/**
 * The camp from its address and the signed-in attendee, looked up at the same time rather
 * than one after the other: every attendee page needs both, and each lookup is a trip.
 */
export async function campAndAttendee(slug: string): Promise<{ camp: Camp | null; me: Registration | null }> {
  const [camp, me] = await Promise.all([getCampBySlug(slug), signedInRegistration()]);
  return { camp, me: camp && me && me.camp_id === camp.id ? me : null };
}
