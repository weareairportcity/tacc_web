"use server";

/**
 * Admin data access (server actions). Every function checks the admin code
 * cookie, then runs SQL against the campaign database (Cloudflare D1) through
 * the Worker. Replaces the Supabase queries and Postgres functions 1909 used;
 * names and return shapes are unchanged so the dashboard screens didn't move.
 *
 * Timestamps are UTC, which is Accra time, so strftime('%H') is the local hour.
 */

import { requireAdmin } from "./admin-auth";
import { batch, deletePhotos, photoUrls, purgeCampaignPhotos, query, recount } from "./admin-db";
import { collapseMapPoints, toCsv } from "./admin-shared";
import type {
  Dimension,
  DuplicateRow,
  HourFilter,
  HourlyRow,
  LeaderboardRow,
  MapPoint,
  Overview,
} from "./admin-shared";
import type { SwCampaignSettings, SwSmsConfig } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = "CAST(strftime('%H', e.created_at) AS INTEGER)";

function checkId(id: string) {
  if (!UUID.test(id)) throw new Error("Invalid id");
  return id;
}

function hourParams(hours: HourFilter) {
  const clean = (h: number | null) => (h === null || !Number.isInteger(h) || h < 0 || h > 23 ? null : h);
  return [clean(hours.from), clean(hours.to)];
}

const HOUR_WHERE = `(?2 IS NULL OR ${HOUR} >= ?2) AND (?3 IS NULL OR ${HOUR} <= ?3)`;

const bool = (v: unknown) => v === 1 || v === true;

// ─── Campaigns ───────────────────────────────────────────────────────────────

export async function fetchCampaigns(): Promise<SwCampaignSettings[]> {
  await requireAdmin();
  return query<SwCampaignSettings>(
    `SELECT id, name, slug, event_date, opens_at, closes_at, goal_total,
            sms_template, sms_start_hour, sms_end_hour
     FROM campaigns ORDER BY event_date DESC`,
  );
}

export async function updateCampaignSettings(
  campaignId: string,
  patch: Partial<Pick<SwCampaignSettings, "sms_template" | "sms_start_hour" | "sms_end_hour" | "goal_total">>,
) {
  await requireAdmin();
  const allowed = ["sms_template", "sms_start_hour", "sms_end_hour", "goal_total"] as const;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (key in patch) {
      sets.push(`${key} = ?`);
      params.push(patch[key] ?? null);
    }
  }
  if (sets.length === 0) return;
  await query(`UPDATE campaigns SET ${sets.join(", ")} WHERE id = ?`, [...params, checkId(campaignId)]);
}

// ─── Dashboard aggregates ────────────────────────────────────────────────────

export async function fetchOverview(campaignId: string, hours: HourFilter): Promise<Overview | null> {
  await requireAdmin();
  const [row] = await query<Overview>(
    `SELECT
       coalesce(sum(e.counted), 0) AS total_souls,
       coalesce(sum(e.counted AND e.spoke_in_tongues), 0) AS tongues_count,
       coalesce(sum(e.counted AND e.coming_to_church), 0) AS church_count,
       coalesce(sum(e.duplicate_status = 'pending'), 0) AS pending_duplicates,
       count(DISTINCT CASE WHEN e.counted THEN e.entrant_id END) AS entrant_count,
       count(DISTINCT CASE WHEN e.counted THEN e.group_id END) AS group_count,
       coalesce(sum(e.counted AND e.latitude IS NOT NULL), 0) AS located_count
     FROM entries e
     WHERE e.campaign_id = ?1 AND ${HOUR_WHERE}`,
    [checkId(campaignId), ...hourParams(hours)],
  );
  return row ?? null;
}

export async function fetchLeaderboard(
  campaignId: string,
  dimension: Dimension,
  hours: HourFilter,
  limit = 25,
): Promise<LeaderboardRow[]> {
  await requireAdmin();
  const group = {
    fellowship: "coalesce(nullif(trim(n.fellowship), ''), 'Not given')",
    pfcc: "coalesce(nullif(trim(n.pfcc), ''), 'Not given')",
    entrant: "n.name",
  }[dimension];
  if (!group) throw new Error("Unknown dimension");

  const rows = await query<{
    label: string;
    fellowship: string | null;
    pfcc: string | null;
    souls: number;
    tongues: number;
    church: number;
  }>(
    `SELECT ${group} AS label,
            ${dimension === "entrant" ? "n.fellowship, n.pfcc" : "NULL AS fellowship, NULL AS pfcc"},
            count(*) AS souls,
            sum(e.spoke_in_tongues) AS tongues,
            sum(e.coming_to_church) AS church
     FROM entries e JOIN entrants n ON n.id = e.entrant_id
     WHERE e.campaign_id = ?1 AND e.counted AND ${HOUR_WHERE}
     GROUP BY ${dimension === "entrant" ? "n.name, n.fellowship, n.pfcc" : "1"}
     ORDER BY souls DESC, label
     LIMIT ?4`,
    [checkId(campaignId), ...hourParams(hours), Math.min(Math.max(1, limit), 500)],
  );

  return rows.map((r) => ({
    label: r.label,
    sublabel:
      dimension === "entrant"
        ? [r.fellowship?.trim(), r.pfcc?.trim()].filter(Boolean).join(" · ") || null
        : null,
    souls: r.souls,
    tongues: r.tongues ?? 0,
    church: r.church ?? 0,
  }));
}

export async function fetchHourly(campaignId: string): Promise<HourlyRow[]> {
  await requireAdmin();
  const rows = await query<{ hour: number; souls: number; tongues: number; church: number }>(
    `SELECT ${HOUR} AS hour, count(*) AS souls,
            sum(e.spoke_in_tongues) AS tongues, sum(e.coming_to_church) AS church
     FROM entries e WHERE e.campaign_id = ? AND e.counted
     GROUP BY 1`,
    [checkId(campaignId)],
  );
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  let cumulative = 0;
  return Array.from({ length: 24 }, (_, hour) => {
    const r = byHour.get(hour);
    cumulative += r?.souls ?? 0;
    return { hour, souls: r?.souls ?? 0, tongues: r?.tongues ?? 0, church: r?.church ?? 0, cumulative };
  });
}

export async function fetchDuplicates(campaignId: string): Promise<DuplicateRow[]> {
  await requireAdmin();
  return query<DuplicateRow>(
    `SELECT d.id, d.soul_name, d.phone, d.created_at, dn.name AS entrant_name,
            o.id AS original_id, o.created_at AS original_created_at, onn.name AS original_entrant_name
     FROM entries d
     JOIN entrants dn ON dn.id = d.entrant_id
     LEFT JOIN entries o ON o.id = (
       SELECT e.id FROM entries e
       WHERE e.campaign_id = d.campaign_id AND e.id <> d.id AND e.counted
         AND e.norm_name = d.norm_name AND e.norm_phone = d.norm_phone
       ORDER BY e.created_at LIMIT 1
     )
     LEFT JOIN entrants onn ON onn.id = o.entrant_id
     WHERE d.campaign_id = ? AND d.duplicate_status = 'pending'
     ORDER BY d.created_at`,
    [checkId(campaignId)],
  );
}

export async function resolveDuplicate(id: string, status: "unique" | "merged"): Promise<void> {
  await requireAdmin();
  if (status !== "unique" && status !== "merged") throw new Error("Invalid status");
  const [row] = await query<{ campaign_id: string }>(
    `UPDATE entries SET duplicate_status = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ? RETURNING campaign_id`,
    [status, checkId(id)],
  );
  if (row) await recount(row.campaign_id);
}

// ─── Map ─────────────────────────────────────────────────────────────────────

export async function fetchMapPoints(campaignId: string): Promise<{ points: MapPoint[]; totalSouls: number }> {
  await requireAdmin();
  checkId(campaignId);
  const [rows, [total]] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT e.id, e.soul_name, e.phone, e.photo_path, e.latitude, e.longitude,
              e.spoke_in_tongues, e.coming_to_church, e.created_at, e.group_id,
              n.name AS entrant_name, n.fellowship, n.pfcc
       FROM entries e JOIN entrants n ON n.id = e.entrant_id
       WHERE e.campaign_id = ? AND e.counted AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL
       LIMIT 5000`,
      [campaignId],
    ),
    query<{ n: number }>("SELECT count(*) AS n FROM entries WHERE campaign_id = ? AND counted", [campaignId]),
  ]);
  const urls = await photoUrls(rows.map((r) => r.photo_path as string));

  const mapped: MapPoint[] = rows.map((r) => ({
    id: r.id as string,
    latitude: r.latitude as number,
    longitude: r.longitude as number,
    soul_name: r.soul_name as string,
    phone: (r.phone as string) ?? null,
    photo_path: r.photo_path ? (urls[r.photo_path as string] ?? null) : null,
    fellowship: (r.fellowship as string)?.trim() || "Not given",
    pfcc: (r.pfcc as string)?.trim() || "Not given",
    entrant_name: (r.entrant_name as string) ?? "—",
    spoke_in_tongues: bool(r.spoke_in_tongues),
    coming_to_church: bool(r.coming_to_church),
    created_at: r.created_at as string,
    group_id: (r.group_id as string) ?? null,
    souls: 1,
    tongues: bool(r.spoke_in_tongues) ? 1 : 0,
    church: bool(r.coming_to_church) ? 1 : 0,
  }));

  const points = collapseMapPoints(mapped);
  return { points, totalSouls: total?.n ?? points.reduce((sum, p) => sum + (p.souls ?? 1), 0) };
}

export type MapSearchHit = { soul_name?: string; entrant_name: string; latitude?: number; longitude?: number };

/** Souls and members matching a search on the map. */
export async function searchMap(
  campaignId: string,
  term: string,
): Promise<{ souls: MapSearchHit[]; members: string[] }> {
  await requireAdmin();
  const like = `%${term.trim().replace(/[%_]/g, "")}%`;
  const [souls, members] = await Promise.all([
    query<MapSearchHit>(
      `SELECT e.soul_name, e.latitude, e.longitude, n.name AS entrant_name
       FROM entries e JOIN entrants n ON n.id = e.entrant_id
       WHERE e.campaign_id = ? AND e.latitude IS NOT NULL AND e.soul_name LIKE ?
       LIMIT 8`,
      [checkId(campaignId), like],
    ),
    query<{ name: string }>("SELECT DISTINCT name FROM entrants WHERE name LIKE ? LIMIT 5", [like]),
  ]);
  return { souls, members: members.map((m) => m.name) };
}

// ─── Entry lists (entries table, photo wall, exports) ───────────────────────

export type AdminEntry = {
  id: string;
  soul_name: string;
  phone: string | null;
  spoke_in_tongues: boolean;
  coming_to_church: boolean;
  duplicate_status: string;
  counted: boolean;
  /** A signed, expiring link to the photo, not a storage path. */
  photo_path: string | null;
  created_at: string;
  synced_at?: string;
  group_id: string | null;
  latitude: number | null;
  longitude: number | null;
  sw_entrants: { name: string; fellowship: string | null; pfcc: string | null; phone?: string | null } | null;
};

async function listEntries(campaignId: string, where: string, limit: number, signPhotos: boolean) {
  const rows = await query<Record<string, unknown>>(
    `SELECT e.id, e.soul_name, e.phone, e.spoke_in_tongues, e.coming_to_church, e.duplicate_status,
            e.counted, e.photo_path, e.created_at, e.synced_at, e.group_id, e.latitude, e.longitude,
            n.name AS n_name, n.fellowship AS n_fellowship, n.pfcc AS n_pfcc, n.phone AS n_phone
     FROM entries e LEFT JOIN entrants n ON n.id = e.entrant_id
     WHERE e.campaign_id = ? ${where}
     ORDER BY e.created_at DESC
     LIMIT ${limit}`,
    [checkId(campaignId)],
  );
  const urls = signPhotos ? await photoUrls(rows.map((r) => r.photo_path as string)) : {};
  return rows.map<AdminEntry>((r) => ({
    id: r.id as string,
    soul_name: r.soul_name as string,
    phone: (r.phone as string) ?? null,
    spoke_in_tongues: bool(r.spoke_in_tongues),
    coming_to_church: bool(r.coming_to_church),
    duplicate_status: r.duplicate_status as string,
    counted: bool(r.counted),
    photo_path: r.photo_path ? (urls[r.photo_path as string] ?? null) : null,
    created_at: r.created_at as string,
    synced_at: r.synced_at as string,
    group_id: (r.group_id as string) ?? null,
    latitude: (r.latitude as number) ?? null,
    longitude: (r.longitude as number) ?? null,
    sw_entrants: r.n_name
      ? {
          name: r.n_name as string,
          fellowship: (r.n_fellowship as string) ?? null,
          pfcc: (r.n_pfcc as string) ?? null,
          phone: (r.n_phone as string) ?? null,
        }
      : null,
  }));
}

export async function fetchEntries(campaignId: string) {
  await requireAdmin();
  return listEntries(campaignId, "", 2000, true);
}

export async function fetchPhotoEntries(campaignId: string) {
  await requireAdmin();
  return listEntries(campaignId, "AND e.photo_path IS NOT NULL", 2000, true);
}

/** Counted souls, oldest first, for the PDF/CSV exports. */
export async function fetchCountedEntries(campaignId: string) {
  await requireAdmin();
  return (await listEntries(campaignId, "AND e.counted", 5000, false)).reverse();
}

/** Raw entries, names and phone numbers included — admin only. */
export async function exportRawEntries(campaignId: string): Promise<string> {
  await requireAdmin();
  const rows = (await listEntries(campaignId, "", 20000, false)).reverse();
  return toCsv(
    [
      "entry_id",
      "soul_name",
      "soul_phone",
      "spoke_in_tongues",
      "coming_to_church",
      "latitude",
      "longitude",
      "duplicate_status",
      "counted",
      "logged_at",
      "synced_at",
      "group_id",
      "entrant_name",
      "entrant_fellowship",
      "entrant_pfcc",
      "entrant_phone",
    ],
    rows.map((row) => [
      row.id,
      row.soul_name,
      row.phone,
      row.spoke_in_tongues ? "yes" : "no",
      row.coming_to_church ? "yes" : "no",
      row.latitude ?? null,
      row.longitude ?? null,
      row.duplicate_status,
      row.counted ? "yes" : "no",
      row.created_at,
      row.synced_at ?? "",
      row.group_id ?? "",
      row.sw_entrants?.name ?? "",
      row.sw_entrants?.fellowship ?? "",
      row.sw_entrants?.pfcc ?? "",
      row.sw_entrants?.phone ?? "",
    ]),
  );
}

// ─── Deleting ────────────────────────────────────────────────────────────────

/** Remove specific souls, their photos, and fix the running totals. */
export async function deleteSoulEntries(ids: string[]): Promise<number> {
  await requireAdmin();
  const unique = [...new Set(ids.filter((id) => UUID.test(id)))];
  if (unique.length === 0) return 0;

  const found: { campaign_id: string; photo_path: string | null }[] = [];
  for (let i = 0; i < unique.length; i += 90) {
    const chunk = unique.slice(i, i + 90);
    found.push(
      ...(await query<{ campaign_id: string; photo_path: string | null }>(
        `DELETE FROM entries WHERE id IN (${chunk.map(() => "?").join(",")}) RETURNING campaign_id, photo_path`,
        chunk,
      )),
    );
  }
  for (const campaignId of new Set(found.map((r) => r.campaign_id))) await recount(campaignId);
  await deletePhotos(found.map((r) => r.photo_path).filter((p): p is string => Boolean(p)));
  return found.length;
}

/**
 * Wipe every soul for a campaign — rows, photos and the public counter.
 * Members are kept so phones don't have to sign up again.
 */
export async function clearCampaignEntries(campaignId: string): Promise<number> {
  await requireAdmin();
  checkId(campaignId);
  const [{ n }] = await query<{ n: number }>("SELECT count(*) AS n FROM entries WHERE campaign_id = ?", [
    campaignId,
  ]);
  await batch([
    { sql: "DELETE FROM entries WHERE campaign_id = ?", params: [campaignId] },
    {
      sql: `UPDATE counts SET total_souls = 0, tongues_count = 0, church_count = 0, pending_duplicates = 0,
              last_soul_name = NULL, last_entry_id = NULL, recent_names = '[]',
              last_photo_path = NULL, recent_photo_paths = '[]',
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE campaign_id = ?`,
      params: [campaignId],
    },
  ]);
  await purgeCampaignPhotos(campaignId);
  return n;
}

// ─── SMS ─────────────────────────────────────────────────────────────────────

export async function fetchSmsConfig(campaignId: string): Promise<SwSmsConfig[]> {
  await requireAdmin();
  const rows = await query<Omit<SwSmsConfig, "enabled"> & { enabled: number }>(
    "SELECT * FROM sms_config WHERE campaign_id = ? ORDER BY created_at",
    [checkId(campaignId)],
  );
  return rows.map((r) => ({ ...r, enabled: bool(r.enabled) }));
}

export async function addSmsRecipient(campaignId: string, phone: string, label: string) {
  await requireAdmin();
  if (!phone.trim()) throw new Error("Phone number required");
  await query(
    "INSERT INTO sms_config (id, campaign_id, phone_number, label) VALUES (?, ?, ?, ?)",
    [crypto.randomUUID(), checkId(campaignId), phone.trim(), label.trim() || null],
  );
}

export async function setSmsRecipientEnabled(id: string, enabled: boolean) {
  await requireAdmin();
  await query("UPDATE sms_config SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, checkId(id)]);
}

export async function removeSmsRecipient(id: string) {
  await requireAdmin();
  await query("DELETE FROM sms_config WHERE id = ?", [checkId(id)]);
}

export async function fetchSmsLog(campaignId: string) {
  await requireAdmin();
  return query<{ sent_at: string; status: string; message: string; recipients: string; error: string | null }>(
    "SELECT sent_at, status, message, recipients, error FROM sms_log WHERE campaign_id = ? ORDER BY sent_at DESC LIMIT 30",
    [checkId(campaignId)],
  );
}
