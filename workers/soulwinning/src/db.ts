import { firstName } from "./util";

export type Campaign = {
  id: string;
  name: string;
  slug: string;
  event_date: string;
  opens_at: string;
  closes_at: string;
  goal_total: number | null;
  sms_template: string;
  sms_start_hour: number;
  sms_end_hour: number;
  target_per_member: number;
};

export type CountsRow = {
  leaderboard: string | null;
  leaderboard_at: string | null;
  campaign_id: string;
  total_souls: number;
  tongues_count: number;
  church_count: number;
  pending_duplicates: number;
  last_soul_name: string | null;
  last_entry_id: string | null;
  recent_names: string;
  last_photo_path: string | null;
  recent_photo_paths: string;
  updated_at: string;
};

export function campaignBySlug(db: D1Database, slug: string) {
  return db.prepare("SELECT * FROM campaigns WHERE slug = ?").bind(slug).first<Campaign>();
}

export function campaignById(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM campaigns WHERE id = ?").bind(id).first<Campaign>();
}

/**
 * Adds one newly counted soul to the running totals: +1 total, the tongues /
 * church flags, and the soul's first name (and photo) pushed onto the front of
 * the "recent" lists. One UPDATE, so concurrent saves can't lose each other's
 * increments. Replaces the Postgres sw_apply_count_delta trigger.
 */
export function countNewSoul(
  db: D1Database,
  row: {
    campaign_id: string;
    id: string;
    soul_name: string;
    spoke_in_tongues: number;
    coming_to_church: number;
    photo_path: string | null;
  },
) {
  const name = firstName(row.soul_name);
  return db
    .prepare(
      `UPDATE counts SET
         total_souls = total_souls + 1,
         tongues_count = tongues_count + ?1,
         church_count = church_count + ?2,
         last_soul_name = ?3,
         last_entry_id = ?4,
         recent_names = (
           SELECT json_group_array(v) FROM (
             SELECT v FROM (
               SELECT 0 AS k, ?3 AS v
               UNION ALL SELECT key + 1, value FROM json_each(counts.recent_names)
             ) ORDER BY k LIMIT 10
           )
         ),
         last_photo_path = coalesce(?5, last_photo_path),
         recent_photo_paths = CASE WHEN ?5 IS NULL THEN recent_photo_paths ELSE (
           SELECT json_group_array(v) FROM (
             SELECT v FROM (
               SELECT 0 AS k, ?5 AS v
               UNION ALL SELECT key + 1, value FROM json_each(counts.recent_photo_paths) WHERE value <> ?5
             ) ORDER BY k LIMIT 36
           )
         ) END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE campaign_id = ?6`,
    )
    .bind(
      row.spoke_in_tongues,
      row.coming_to_church,
      name,
      row.id,
      row.photo_path,
      row.campaign_id,
    );
}

export function countNewPending(db: D1Database, campaignId: string) {
  return db
    .prepare(
      `UPDATE counts SET pending_duplicates = pending_duplicates + 1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE campaign_id = ?`,
    )
    .bind(campaignId);
}

/**
 * Rebuilds a campaign's totals from the entries table. Used after admin edits
 * (duplicate review, deletes), which are rare enough that a full scan is fine.
 */
export function recount(db: D1Database, campaignId: string) {
  return db
    .prepare(
      `UPDATE counts SET
         total_souls = (SELECT count(*) FROM entries WHERE campaign_id = ?1 AND counted),
         tongues_count = (SELECT count(*) FROM entries WHERE campaign_id = ?1 AND counted AND spoke_in_tongues),
         church_count = (SELECT count(*) FROM entries WHERE campaign_id = ?1 AND counted AND coming_to_church),
         pending_duplicates = (SELECT count(*) FROM entries WHERE campaign_id = ?1 AND duplicate_status = 'pending'),
         recent_names = coalesce((
           SELECT json_group_array(n) FROM (
             SELECT substr(trim(soul_name), 1, instr(trim(soul_name) || ' ', ' ') - 1) AS n
             FROM entries WHERE campaign_id = ?1 AND counted
             ORDER BY created_at DESC LIMIT 10
           )
         ), '[]'),
         last_photo_path = (
           SELECT photo_path FROM entries
           WHERE campaign_id = ?1 AND counted AND photo_path IS NOT NULL
           ORDER BY created_at DESC LIMIT 1
         ),
         recent_photo_paths = coalesce((
           SELECT json_group_array(photo_path) FROM (
             SELECT photo_path FROM entries
             WHERE campaign_id = ?1 AND counted AND photo_path IS NOT NULL
             ORDER BY created_at DESC LIMIT 36
           )
         ), '[]'),
         leaderboard_at = NULL,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE campaign_id = ?1`,
    )
    .bind(campaignId);
}
