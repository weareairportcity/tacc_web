import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { campSecret } from "./codes";
import { getRegistrationWithCode } from "./registrations";
import type { Registration } from "./types";

/**
 * An attendee's signed-in session: an httpOnly cookie naming their
 * registration, signed with CAMP_SECRET. The signature covers the code's
 * hash, so issuing a new code ("forgot your code") signs out old sessions.
 */

const COOKIE = "camp_attendee";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const sign = (payload: string) => createHmac("sha256", campSecret()).update(`camp-session.${payload}`).digest("base64url");
const same = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export async function startAttendeeSession(registrationId: string, codeHash: string) {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  (await cookies()).set(COOKIE, `${registrationId}.${expires}.${sign(`${registrationId}.${expires}.${codeHash}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/camps",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endAttendeeSession() {
  (await cookies()).delete({ name: COOKIE, path: "/camps" });
}

/** The signed-in attendee's registration for this camp, or null. Checked on every request. */
export async function currentAttendee(campId: string): Promise<Registration | null> {
  const [id, expires, signature] = (await cookies()).get(COOKIE)?.value.split(".") ?? [];
  if (!id || !signature || !(Number(expires) > Date.now())) return null;
  const found = await getRegistrationWithCode(id).catch(() => null);
  if (!found || found.registration.camp_id !== campId) return null;
  return same(signature, sign(`${id}.${expires}.${found.codeHash}`)) ? found.registration : null;
}
