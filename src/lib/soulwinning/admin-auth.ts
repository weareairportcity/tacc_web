import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Admin code access to the soul winning dashboard. SW_ADMIN_CODE lives in an
 * env var and never reaches the browser; a correct code earns an httpOnly
 * cookie signed with SW_COOKIE_SECRET. The signature covers the code too, so
 * changing the code signs everyone out.
 */

const COOKIE = "sw_admin";
const MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

const env = (key: string) => process.env[key]?.trim() ?? "";

function sign(payload: string) {
  const secret = env("SW_COOKIE_SECRET");
  if (secret.length < 32) throw new Error("SW_COOKIE_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function same(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export function isAdminCode(input: string) {
  const code = env("SW_ADMIN_CODE");
  return Boolean(code) && same(input.replace(/\s+/g, ""), code);
}

export async function startAdminSession() {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  (await cookies()).set(COOKIE, `${expires}.${sign(`${expires}.${env("SW_ADMIN_CODE")}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endAdminSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  const [expires, signature] = (await cookies()).get(COOKIE)?.value.split(".") ?? [];
  if (!signature || !(Number(expires) > Date.now())) return false;
  try {
    return same(signature, sign(`${expires}.${env("SW_ADMIN_CODE")}`));
  } catch {
    return false;
  }
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Your admin session has ended. Please enter the admin code again.");
}
