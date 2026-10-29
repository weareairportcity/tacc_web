import { cookies } from "next/headers";
import { normalizeCode } from "./codes";

/**
 * A friend's group link, remembered on this phone while the person registers
 * and pays, so their home can offer "Join Kofi's group?" once they're fully
 * paid. One per camp. Only the group code is kept: it's in the link anyway.
 */

const name = (slug: string) => `commune_join_${slug}`;
const MAX_AGE = 60 * 60 * 24 * 60;

/** Server actions and route handlers only: pages can't set cookies. */
export async function rememberJoin(slug: string, code: string) {
  const clean = normalizeCode(code);
  if (!clean) return;
  (await cookies()).set(name(slug), clean, {
    path: `/camps/${slug}`,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
  });
}

export async function readJoin(slug: string) {
  return (await cookies()).get(name(slug))?.value ?? null;
}

export async function forgetJoin(slug: string) {
  (await cookies()).delete({ name: name(slug), path: `/camps/${slug}` });
}
