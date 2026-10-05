import type { Campaign } from "./db";

export type Leaderboard = {
  target: number;
  /** Top soul winners, most souls first (ties: whoever got there first). */
  members: { name: string; pfcc: string; souls: number }[];
  pfccs: { pfcc: string; souls: number; members: number }[];
  fellowships: { fellowship: string; souls: number; members: number }[];
  /** Everyone who has reached the target, in the order they reached it. */
  completed: { name: string; pfcc: string; souls: number; reached_at: string }[];
  computed_at: string;
  /** Every member's total, for "your rank" on phones. Never sent to screens. */
  all?: { id: string; pfcc: string; souls: number }[];
};

const REFRESH_MS = 60_000;
const NOT_GIVEN = "Not given";

/** Works the leaderboards out from the entries table. Counted souls only. */
export async function computeLeaderboard(db: D1Database, campaign: Campaign & { target_per_member?: number }) {
  const target = campaign.target_per_member ?? 7;
  const [members, pfccs, completed, all, fellowships] = await db.batch([
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
    db
      .prepare(
        `SELECT e.entrant_id AS id, coalesce(nullif(trim(n.pfcc), ''), '${NOT_GIVEN}') AS pfcc, count(*) AS souls
         FROM entries e JOIN entrants n ON n.id = e.entrant_id
         WHERE e.campaign_id = ? AND e.counted
         GROUP BY e.entrant_id`,
      )
      .bind(campaign.id),
    db
      .prepare(
        `SELECT coalesce(nullif(trim(n.fellowship), ''), '${NOT_GIVEN}') AS fellowship, count(*) AS souls,
                count(DISTINCT e.entrant_id) AS members
         FROM entries e JOIN entrants n ON n.id = e.entrant_id
         WHERE e.campaign_id = ? AND e.counted
         GROUP BY 1
         ORDER BY souls DESC
         LIMIT 10`,
      )
      .bind(campaign.id),
  ]);

  return {
    target,
    members: (members.results ?? []) as Leaderboard["members"],
    pfccs: (pfccs.results ?? []) as Leaderboard["pfccs"],
    fellowships: (fellowships.results ?? []) as Leaderboard["fellowships"],
    completed: (completed.results ?? []) as Leaderboard["completed"],
    computed_at: new Date().toISOString(),
    all: (all.results ?? []) as NonNullable<Leaderboard["all"]>,
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

/** Strips the per-member list before a leaderboard goes to the public screens. */
export function publicLeaderboard(board: Leaderboard): Leaderboard {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { all, ...rest } = board;
  return rest;
}

/** A member's standing: overall, and within their PFCC (1 = top). */
export function rankFor(board: Leaderboard, entrantId: string) {
  const all = board.all ?? [];
  const me = all.find((m) => m.id === entrantId);
  if (!me) return { souls: 0, target: board.target, pfcc: null, pfcc_rank: null, pfcc_members: null, overall_rank: null, overall_members: all.length, computed_at: board.computed_at };
  const ahead = (list: typeof all) => list.filter((m) => m.souls > me.souls).length + 1;
  const samePfcc = all.filter((m) => m.pfcc === me.pfcc);
  return {
    souls: me.souls,
    target: board.target,
    pfcc: me.pfcc,
    pfcc_rank: ahead(samePfcc),
    pfcc_members: samePfcc.length,
    overall_rank: ahead(all),
    overall_members: all.length,
    computed_at: board.computed_at,
  };
}
