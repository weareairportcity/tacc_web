/**
 * Server-only (never import from a client component). Access to the campaign database (Cloudflare D1) through the
 * soul winning Worker's admin API. SW_API_ADMIN_SECRET never leaves the server.
 */

import { SW_API_SERVER } from "./api";

const base = () => SW_API_SERVER;

async function call<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SW_API_ADMIN_SECRET ?? ""}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `database request failed (${response.status})`);
  return data;
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await call<{ results: T[] }>("/v1/admin/query", { sql, params })).results;
}

export async function batch(statements: { sql: string; params?: unknown[] }[]) {
  return (await call<{ results: { results: unknown[] }[] }>("/v1/admin/batch", { statements })).results;
}

export async function recount(campaignId: string) {
  await call("/v1/admin/recount", { campaign_id: campaignId });
}

/** Signed, expiring links for stored photo paths (full size unless thumb). */
export async function photoUrls(paths: string[], thumb = false): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  return (await call<{ urls: Record<string, string> }>("/v1/admin/photo-urls", { paths: unique, thumb })).urls;
}

export async function deletePhotos(paths: string[]) {
  if (paths.length) await call("/v1/admin/photos/delete", { paths });
}

export async function purgeCampaignPhotos(campaignId: string) {
  await call("/v1/admin/photos/purge-campaign", { campaign_id: campaignId });
}
