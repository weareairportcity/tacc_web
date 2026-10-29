import { createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { query } from "@/lib/cf";
import { campSecret } from "./codes";

/**
 * Fixed-window attempt counter in D1. One upsert per attempt, so parallel
 * guesses can't slip past the limit between a read and a write.
 * Returns false once `key` has had more than `limit` hits in the window.
 * An attempt refused while the window is still full changes nothing, so a
 * flood of refused guesses costs reads, never writes.
 */
export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs).toISOString();
  const [row] = await query<{ count: number }>(
    "app",
    `INSERT INTO camp_rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
     WHERE window_start <= ? OR count <= ?
     RETURNING count`,
    [key, now.toISOString(), cutoff, cutoff, cutoff, limit],
  );
  return (row?.count ?? Infinity) <= limit;
}

const sign = (text: string) => createHmac("sha256", campSecret()).update(`rate-limit:${text}`).digest("base64url").slice(0, 22);

/**
 * Attempts from one visitor: `perPhone` for this phone or browser (a signed counter in a
 * cookie, so no database write), and `perAddress` as a ceiling for everyone on one network
 * address. A whole church on one wifi shares an address, so that ceiling is set for a crowd.
 * Clearing cookies only gets someone as far as the address ceiling.
 */
export async function allowVisitor(name: string, perPhone: number, perAddress: number, windowMs: number): Promise<boolean> {
  const jar = await cookies();
  const cookie = `commune_rl_${name}`;
  const now = Date.now();
  const [count, start, sig] = (jar.get(cookie)?.value ?? "").split(".");
  const valid = sig !== undefined && sig === sign(`${name}.${count}.${start}`) && now - Number(start) < windowMs;
  const n = (valid ? Number(count) : 0) + 1;
  const since = valid ? Number(start) : now;
  jar.set(cookie, `${n}.${since}.${sign(`${name}.${n}.${since}`)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.ceil((since + windowMs - now) / 1000),
  });
  if (n > perPhone) return false;
  return allow(`${name}:${await clientIp()}`, perAddress, windowMs);
}

/** The caller's IP as Vercel reports it. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
