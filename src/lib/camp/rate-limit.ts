import { headers } from "next/headers";
import { query } from "@/lib/cf";

/**
 * Fixed-window attempt counter in D1. One upsert per attempt, so parallel
 * guesses can't slip past the limit between a read and a write.
 * Returns false once `key` has had more than `limit` hits in the window.
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
     RETURNING count`,
    [key, now.toISOString(), cutoff, cutoff],
  );
  return (row?.count ?? Infinity) <= limit;
}

/** The caller's IP as Vercel reports it. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
