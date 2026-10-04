import type { Campaign } from "./db";

export type Leaderboard = {
  target: number;
  /** Top soul winners, most souls first (ties: whoever got there first). */
  members: { name: string; pfcc: string; souls: number }[];
  pfccs: { pfcc: string; souls: number; members: number }[];
  /** Everyone who has reached the target, in the order they reached it. */
  completed: { name: string; pfcc: string; souls: number; reached_at: string }[];
  computed_at: string;
};

const REFRESH_MS = 60_000;
const NOT_GIVEN = "Not given";

/** Works the leaderboards out from the entries table. Counted souls only. */
export async function computeLeaderboard(db: D1Database, campaign: Campaign & { target_per_member?: number }) {
  const target = campaign.target_per_member ?? 7;
  const [members, pfccs, completed] = await db.batch([
    db
      .prepare(
        `SELECT n.name, coalesce(nullif(trim(n.pfcc), ''), '${NOT_GIVEN}') AS pfcc, count(*) AS souls
         FROM entries e JOIN entrants n ON n.id = e.entrant_id
         WHERE e.campaign_id = ? AND e.counted
         GROUP BY e.entrant_id
         ORDER BY souls DESC, max(e.created_at) ASC
         LIMIT 10`,
      )
      .bind(campaign.id),
    db
      .prepare(
        `SELECT coalesce(nullif(trim(n.pfcc), ''), '${NOT_GIVEN}') AS pfcc, count(*) AS souls,
                count(DISTINCT e.entrant_id) AS members
         FROM entries e JOIN entrants n ON n.id = e.entrant_id
         WHERE e.campaign_id = ? AND e.counted
         GROUP BY 1
         ORDER BY souls DESC
         LIMIT 10`,
      )
      .bind(campaign.id),
    // The moment someone reached the target = when their target-th counted
    // soul was logged.
    db
      .prepare(
        `WITH ranked AS (
           SELECT entrant_id, created_at,
                  ROW_NUMBER() OVER (PARTITION BY entrant_id ORDER BY created_at, id) AS rn,
                  count(*) OVER (PARTITION BY entrant_id) AS souls
           FROM entries WHERE campaign_id = ?1 AND counted
         )
         SELECT n.name, coalesce(nullif(trim(n.pfcc), ''), '${NOT_GIVEN}') AS pfcc, r.souls, r.created_at AS reached_at
         FROM ranked r JOIN entrants n ON n.id = r.entrant_id
         WHERE r.rn = ?2
         ORDER BY r.created_at
         LIMIT 500`,
      )
      .bind(campaign.id, target),
  ]);

  return {
    target,
    members: (members.results ?? []) as Leaderboard["members"],
    pfccs: (pfccs.results ?? []) as Leaderboard["pfccs"],
    completed: (completed.results ?? []) as Leaderboard["completed"],
    computed_at: new Date().toISOString(),
  } satisfies Leaderboard;
}

/** The cached leaderboard, recomputed when it's more than a minute old. */
export async function cachedLeaderboard(
  db: D1Database,
  campaign: Campaign & { target_per_member?: number },
  stored: { leaderboard: string | null; leaderboard_at: string | null } | null,
) {
  if (stored?.leaderboard && stored.leaderboard_at && Date.now() - Date.parse(stored.leaderboard_at) < REFRESH_MS) {
    return JSON.parse(stored.leaderboard) as Leaderboard;
  }
  const fresh = await computeLeaderboard(db, campaign);
  await db
    .prepare("UPDATE counts SET leaderboard = ?, leaderboard_at = ? WHERE campaign_id = ?")
    .bind(JSON.stringify(fresh), fresh.computed_at, campaign.id)
    .run();
  return fresh;
}
