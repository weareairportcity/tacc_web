import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { campSecret } from "./codes";
import { getCampBySlug } from "./camps";
import { allow } from "./rate-limit";
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

/**
 * Carrying the sign-in over to the Home Screen app. On an iPhone the app
 * keeps its own cookies, apart from Safari's, so it would open signed out.
 * Its start address carries this pass instead: the registration, an expiry
 * and a signature over both and the code's hash, so a new code ("forgot your
 * code") turns old passes off, like sessions.
 *
 * The address can be copied and shared, so a pass is made to be useless
 * afterwards: it works for an hour, and only once. The app
 * keeps its own session after that first sign-in.
 */
const PASS_MS = 60 * 60 * 1000;
const passSignature = (id: string, expires: string, codeHash: string) => sign(`app-pass.${id}.${expires}.${codeHash}`).slice(0, 32);

export async function appPass(registrationId: string) {
  const found = await getRegistrationWithCode(registrationId).catch(() => null);
  if (!found) return null;
  const expires = String(Date.now() + PASS_MS);
  return `${registrationId}.${expires}.${passSignature(registrationId, expires, found.codeHash)}`;
}

/** Signs in with an app pass for this camp. False if it doesn't check out, has run out or was already used. */
export async function signInWithAppPass(camp: Camp, pass: string) {
  const [id, expires, signature] = String(pass ?? "").split(".");
  if (!id || !expires || !signature || !/^[0-9a-f-]{36}$/i.test(id) || !(Number(expires) > Date.now())) return false;
  const found = await getRegistrationWithCode(id).catch(() => null);
  if (!found || found.registration.camp_id !== camp.id || found.registration.status === "cancelled") return false;
  if (!same(signature, passSignature(id, expires, found.codeHash))) return false;
  // Once: the first use claims it. Checked after the signature, so guesses never write.
  if (!(await allow(`app-pass:${signature}`, 1, PASS_MS * 2))) return false;
  await startAttendeeSession(id, found.codeHash, camp.ends_on);
  return true;
}
