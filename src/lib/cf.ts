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

const post = <T>(path: string, body: unknown, cacheFor?: CacheFor) =>
  call<T>(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    cacheFor,
  );

export async function query<T>(db: Db, sql: string, params: unknown[] = [], cacheFor?: CacheFor): Promise<T[]> {
  return (await post<{ results: T[] }>("/v1/admin/query", { db, sql, params }, cacheFor)).results;
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
