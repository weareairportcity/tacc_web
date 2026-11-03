import { post, query, querySoon } from "@/lib/cf";

/**
 * The admin's Activity page: Commune's visit counts (the tacc_stats database, added up by
 * day in workers/soulwinning/src/stats.ts) and who came on which day (camp_active_days).
 * Totals only: nothing here names a person.
 */

export type StatsArea = "attendee" | "leader" | "coordinator";
export const STATS_AREAS: StatsArea[] = ["attendee", "leader", "coordinator"];
export type Row = { day: string; area: string; dim: string; key: string; n: number; ms: number };
export type Count = { key: string; n: number; ms: number };

const dayOffset = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// Today isn't added up until it's over; it's read from the visits, at most every 2 minutes per server.
let todayCache: { at: number; rows: Row[]; paused: boolean } | null = null;
async function today() {
  if (todayCache && Date.now() - todayCache.at < 120_000 && process.env.COMMUNE_SHARED_CACHE !== "off") return todayCache;
  const { rows, paused } = await post<{ rows: Row[]; paused: boolean }>("/v1/admin/stats/today", {});
  todayCache = { at: Date.now(), rows, paused };
  return todayCache;
}

export type Activity = {
  days: number;
  paused: boolean;
  /** dim → counts, biggest first. */
  dims: Record<string, Count[]>;
  /** Visits per day, oldest first, every day in the range. */
  visitsByDay: { day: string; n: number }[];
  active: { byDay: { day: string; n: number }[]; today: number; month: number; retention: Retention; churn: { before: number; gone: number } };
  recentErrors: { at: string; area: string; screen: string; message: string; stack: string; os: string; browser: string }[];
};
export type Retention = { people: [number, number, number]; back: [number, number, number] };

export async function getActivity(days: number, area: StatsArea | null): Promise<Activity> {
  const since = dayOffset(days - 1);
  const areaSql = area ? " AND area = ?" : "";
  const roleSql = area ? " AND role = ?" : "";
  const a = area ? [area] : [];
  const [past, now, byDay, actives, month, retention, churn, recentErrors] = await Promise.all([
    querySoon<Row>("stats", `SELECT day, area, dim, key, n, ms FROM daily WHERE day >= ?${areaSql} AND dim <> 'active'`, [since, ...a], 300),
    today(),
    querySoon<{ day: string; n: number }>("app", `SELECT day, count(*) AS n FROM camp_active_days WHERE day >= ?${roleSql} GROUP BY day`, [since, ...a], 300),
    querySoon<{ n: number }>("app", `SELECT count(*) AS n FROM camp_active_days WHERE day = ?${roleSql}`, [dayOffset(0), ...a], 60),
    querySoon<{ n: number }>("app", `SELECT count(DISTINCT actor) AS n FROM camp_active_days WHERE day >= ?${roleSql}`, [dayOffset(29), ...a], 300),
    // First day each person came in the range; did they come back within 1, 7 and 30 days?
    querySoon<{ c1: number; r1: number; c7: number; r7: number; c30: number; r30: number }>(
      "app",
      `WITH first AS (SELECT actor, min(day) AS d FROM camp_active_days WHERE 1 = 1${roleSql} GROUP BY actor HAVING min(day) >= ?),
            back AS (SELECT f.actor, f.d, (SELECT min(x.day) FROM camp_active_days x WHERE x.actor = f.actor AND x.day > f.d) AS again FROM first f)
       SELECT sum(d <= ?) AS c1, sum(d <= ? AND again <= date(d, '+1 day')) AS r1,
              sum(d <= ?) AS c7, sum(d <= ? AND again <= date(d, '+7 day')) AS r7,
              sum(d <= ?) AS c30, sum(d <= ? AND again <= date(d, '+30 day')) AS r30
       FROM back`,
      [...a, since, dayOffset(1), dayOffset(1), dayOffset(7), dayOffset(7), dayOffset(30), dayOffset(30)],
      300,
    ),
    // Came 31–60 days ago; how many haven't come in the last 30?
    querySoon<{ before: number; gone: number }>(
      "app",
      `SELECT count(*) AS before, coalesce(sum(NOT EXISTS (SELECT 1 FROM camp_active_days b WHERE b.actor = p.actor AND b.day >= ?)), 0) AS gone
       FROM (SELECT DISTINCT actor FROM camp_active_days WHERE day BETWEEN ? AND ?${roleSql}) p`,
      [dayOffset(29), dayOffset(59), dayOffset(30), ...a],
      300,
    ),
    query<Activity["recentErrors"][number]>(
      "stats",
      `SELECT at, area, screen, message, stack, os, browser FROM errors WHERE day >= ?${areaSql} ORDER BY id DESC LIMIT 20`,
      [since, ...a],
    ),
  ]);

  const rows = [...past, ...now.rows.filter((r) => !area || r.area === area)];
  const dims: Record<string, Map<string, Count>> = {};
  const perDay = new Map<string, number>();
  for (const r of rows) {
    const m = (dims[r.dim] ??= new Map());
    const c = m.get(r.key) ?? { key: r.key, n: 0, ms: 0 };
    c.n += Number(r.n) || 0;
    c.ms += Number(r.ms) || 0;
    m.set(r.key, c);
    if (r.dim === "visits") perDay.set(r.day, (perDay.get(r.day) ?? 0) + (Number(r.n) || 0));
  }
  const range = Array.from({ length: days }, (_, i) => dayOffset(days - 1 - i));
  const activeByDay = new Map(byDay.map((r) => [r.day, r.n]));
  const r = retention[0];
  return {
    days,
    paused: now.paused,
    dims: Object.fromEntries(Object.entries(dims).map(([dim, m]) => [dim, [...m.values()].sort((x, y) => y.n - x.n)])),
    visitsByDay: range.map((day) => ({ day, n: perDay.get(day) ?? 0 })),
    active: {
      byDay: range.map((day) => ({ day, n: activeByDay.get(day) ?? 0 })),
      today: actives[0]?.n ?? 0,
      month: month[0]?.n ?? 0,
      retention: { people: [r?.c1 ?? 0, r?.c7 ?? 0, r?.c30 ?? 0], back: [r?.r1 ?? 0, r?.r7 ?? 0, r?.r30 ?? 0] },
      churn: { before: churn[0]?.before ?? 0, gone: churn[0]?.gone ?? 0 },
    },
    recentErrors,
  };
}
