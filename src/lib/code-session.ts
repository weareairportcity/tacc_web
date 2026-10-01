import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * A code-protected admin area: one secret code in an env var, and an httpOnly
 * cookie signed with SW_COOKIE_SECRET once it's entered. The signature covers
 * the cookie name and the code, so a cookie from one area never opens another,
 * and changing a code signs everyone out of that area.
 */
export function codeSession(opts: { cookie: string; codeEnv: string; maxAgeDays?: number }) {
  const maxAge = (opts.maxAgeDays ?? 14) * 24 * 60 * 60;
  const code = () => process.env[opts.codeEnv]?.trim() ?? "";

  const sign = (payload: string) => {
    const secret = process.env.SW_COOKIE_SECRET?.trim() ?? "";
    if (secret.length < 32) throw new Error("SW_COOKIE_SECRET must be at least 32 characters");
    return createHmac("sha256", secret).update(`${opts.cookie}.${payload}`).digest("base64url");
  };
  const same = (a: string, b: string) =>
    timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

  return {
    isCode(input: string) {
      return Boolean(code()) && same(input.replace(/\s+/g, ""), code());
    },
    async start() {
      const expires = Date.now() + maxAge * 1000;
      (await cookies()).set(opts.cookie, `${expires}.${sign(`${expires}.${code()}`)}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge,
      });
    },
    async end() {
      (await cookies()).delete(opts.cookie);
    },
    async isValid() {
      const [expires, signature] = (await cookies()).get(opts.cookie)?.value.split(".") ?? [];
      if (!signature || !(Number(expires) > Date.now())) return false;
      try {
        return same(signature, sign(`${expires}.${code()}`));
      } catch {
        return false;
      }
    },
  };
}

/** Song of the Week admin (SONGS_ADMIN_CODE). */
export const songsAdmin = codeSession({ cookie: "songs_admin", codeEnv: "SONGS_ADMIN_CODE" });

export async function requireSongsAdmin() {
  if (!(await songsAdmin.isValid())) {
    throw new Error("Your admin session has ended. Please enter the songs admin code again.");
  }
}
