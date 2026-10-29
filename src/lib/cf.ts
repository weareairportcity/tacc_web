/**
 * Server-only access to the church's Cloudflare data (the Worker in
 * workers/soulwinning): D1 queries and R2 media uploads. Never import from a
 * client component — SW_API_ADMIN_SECRET must stay on the server.
 */
import { SW_API_SERVER } from "./soulwinning/api";

export type Db = "campaign" | "app";

/** For public reads: cache the answer in Next's data cache, tagged for revalidation. */
export type CacheFor = { revalidate: number; tags: string[] };

async function call<T>(path: string, init: RequestInit, cacheFor?: CacheFor): Promise<T> {
  const response = await fetch(`${SW_API_SERVER}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${process.env.SW_API_ADMIN_SECRET ?? ""}` },
    ...(cacheFor ? { next: cacheFor } : { cache: "no-store" as const }),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `request failed (${response.status})`);
  return data;
}

/** A JSON POST to one of the Worker's /v1/admin endpoints. */
export const post = <T>(path: string, body: unknown, cacheFor?: CacheFor) =>
  call<T>(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    cacheFor,
  );

type Queued = { db: Db; sql: string; params: unknown[]; cache?: number; resolve: (rows: unknown[]) => void; reject: (err: Error) => void };
const queue: Queued[] = [];

// Queries started together (one page's Promise.all, or several requests at once) go to the
// Worker as one request instead of one each: the free plan counts Worker requests per day.
function flush() {
  const now = queue.splice(0, 200);
  if (queue.length) setTimeout(flush, 0);
  post<{ results: ({ results: unknown[] } | { error: string })[] }>("/v1/admin/many", {
    statements: now.map(({ db, sql, params, cache }) => ({ db, sql, params, cache })),
  }).then(
    ({ results }) =>
      now.forEach((q, i) => {
        const r = results[i];
        if (r && "results" in r) q.resolve(r.results);
        else q.reject(new Error(r?.error ?? "query failed"));
      }),
    (err: Error) => now.forEach((q) => q.reject(err)),
  );
}

function enqueue<T>(db: Db, sql: string, params: unknown[], cache?: number): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    queue.push({ db, sql, params, cache, resolve: resolve as (rows: unknown[]) => void, reject });
    if (queue.length === 1) setTimeout(flush, 0);
  });
}

export async function query<T>(db: Db, sql: string, params: unknown[] = [], cacheFor?: CacheFor): Promise<T[]> {
  if (cacheFor) return (await post<{ results: T[] }>("/v1/admin/query", { db, sql, params }, cacheFor)).results;
  return enqueue<T>(db, sql, params);
}

/**
 * A read whose answer may be up to `seconds` old, shared by everyone asking (Today's numbers,
 * the nav badges, check-in totals). The Worker answers repeats without touching the database.
 * COMMUNE_SHARED_CACHE=off turns it off (the tests, which check numbers straight after a change).
 */
export async function querySoon<T>(db: Db, sql: string, params: unknown[] = [], seconds = 30): Promise<T[]> {
  return enqueue<T>(db, sql, params, process.env.COMMUNE_SHARED_CACHE === "off" ? undefined : seconds);
}

export async function batch(db: Db, statements: { sql: string; params?: unknown[] }[]) {
  return (await post<{ results: { results: unknown[] }[] }>("/v1/admin/batch", { db, statements })).results;
}

/** Stores a public media file in R2; returns its media.theairportcitychurch.com URL. */
export async function putMedia(key: string, body: ArrayBuffer | Uint8Array, contentType: string) {
  return (
    await call<{ url: string }>(`/v1/admin/media/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: body as BodyInit,
    })
  ).url;
}

export async function deleteMedia(keys: string[]) {
  if (keys.length) await post("/v1/admin/media-delete", { keys });
}
