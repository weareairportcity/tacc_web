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

// Covers the whole site: on commune.… a camp's pages have short addresses (/youth-camp-2026/me)
// that don't start with /camps, where the older /camps-only cookie wasn't sent.
const COOKIE = "commune_attendee";
// Sessions from before 31 Oct 2026, still honoured until they expire or the person signs in again.
const LEGACY = { name: "camp_attendee", path: "/camps" };
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
  const jar = await cookies();
  jar.set(COOKIE, `${registrationId}.${expires}.${sign(`${registrationId}.${expires}.${codeHash}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor((expires - Date.now()) / 1000),
  });
  jar.delete(LEGACY);
}

export async function endAttendeeSession() {
  const jar = await cookies();
  jar.delete({ name: COOKIE, path: "/" });
  jar.delete(LEGACY);
}

/** Whoever this phone is signed in as, if the cookie's signature checks out. Any camp. */
export async function signedInRegistration(): Promise<Registration | null> {
  const jar = await cookies();
  const [id, expires, signature] = (jar.get(COOKIE) ?? jar.get(LEGACY.name))?.value.split(".") ?? [];
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
