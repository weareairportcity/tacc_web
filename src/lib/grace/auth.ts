import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Code access to the Grace in Continuity wall.
 *
 * Two codes live in env vars and never reach the browser: GRACE_VIEWER_CODE
 * opens the wall, GRACE_ADMIN_CODE also allows export and delete. A correct
 * code earns an httpOnly cookie signed with GRACE_COOKIE_SECRET. The signature
 * also covers the code itself, so changing a code in Vercel signs everyone who
 * used the old one out.
 */

export type Role = "viewer" | "admin";

const COOKIE = "grace_wall";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const env = (key: string) => process.env[key]?.trim() ?? "";

function codeFor(role: Role) {
  return env(role === "admin" ? "GRACE_ADMIN_CODE" : "GRACE_VIEWER_CODE");
}

function sign(payload: string) {
  const secret = env("GRACE_COOKIE_SECRET");
  if (secret.length < 32) throw new Error("GRACE_COOKIE_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// Hashing first makes both sides the same length for timingSafeEqual.
function same(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Which role a typed code unlocks, if any. */
export function roleForCode(input: string): Role | null {
  const code = input.replace(/\s+/g, "");
  if (!code) return null;
  const admin = codeFor("admin");
  const viewer = codeFor("viewer");
  // Check both every time so the response time doesn't hint which one matched.
  const isAdmin = Boolean(admin) && same(code, admin);
  const isViewer = Boolean(viewer) && same(code, viewer);
  return isAdmin ? "admin" : isViewer ? "viewer" : null;
}

export async function setSession(role: Role) {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${role}.${expires}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(`${payload}.${codeFor(role)}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in role, or null. Checks the signature and expiry every time. */
export async function currentRole(): Promise<Role | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  const [role, expires, signature] = value?.split(".") ?? [];
  if (role !== "viewer" && role !== "admin") return null;
  if (!signature || !(Number(expires) > Date.now())) return null;
  try {
    return same(signature, sign(`${role}.${expires}.${codeFor(role)}`)) ? role : null;
  } catch {
    return null;
  }
}
