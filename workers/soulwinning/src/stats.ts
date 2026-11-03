import type { Usage } from "./usage";
import { HttpError, json, readJson, type AppEnv } from "./util";

/**
 * Commune's usage counts: totals, not people. Each visit's page sends one
 * summary when the visit ends (POST /v1/c/v: the screens in order, taps,
 * timings, device), so a visit costs one request and one row however many
 * screens it had. Place and network come from Cloudflare, not the phone.
 *
 * The hourly cron adds each finished day up into `daily`, deletes visits and
 * logs older than 90 days, and pauses counting while today's free limits are
 * close, so counting can never stop the camp app itself working.
 */

const AREAS = new Set(["attendee", "leader", "coordinator"]);
export const KEEP_DAYS = 90;
/** Past this share of a free daily limit, visits are dropped until midnight UTC. */
const PAUSE_AT = 0.7;

const clip = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, max);
/** Runs of 3+ digits (a phone, a code, an amount) never reach the counts. */
const noNumbers = (s: string) => s.replace(/\d{3,}/g, "#");
const ms = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 120_000 ? n : null;
};
const SCREEN = /^\/[\w:.\-/]{0,100}$/;

type Visit = {
  area?: string;
  camp?: string;
  dur?: number;
  flow?: unknown[];
  taps?: Record<string, unknown>;
  errors?: { screen?: string; message?: string; stack?: string }[];
  perf?: Record<string, unknown>;
  dev?: Record<string, unknown>;
  src?: string;
};

// Per isolate, so a stuck or hostile page can't post visits in a loop.
const recent = new Map<string, { n: number; until: number }>();
function tooMany(ip: string, now = Date.now()) {
  const r = recent.get(ip);
  if (!r || r.until < now) {
    if (recent.size > 5000) recent.clear();
    recent.set(ip, { n: 1, until: now + 10 * 60_000 });
    return false;
  }
  return ++r.n > 60;
}

let paused: { day: string; checked: number } | null = null;
async function isPaused(env: AppEnv, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  if (!paused || now - paused.checked > 5 * 60_000) {
    const row = await env.STATS_DB.prepare("SELECT v FROM meta WHERE k = 'paused'").first<{ v: string }>();
    paused = { day: row?.v ?? "", checked: now };
  }
  return paused.day === today;
}

/** One visit's summary, from navigator.sendBeacon. Always answers 204: a page can't do anything with an error. */
export async function postVisit(request: Request, env: AppEnv) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  if (tooMany(ip) || (await isPaused(env))) return new Response(null, { status: 204 });
  const v = await readJson<Visit>(request, 16 * 1024);
  if (!AREAS.has(String(v.area))) throw new HttpError(400, "invalid visit");
  const flow = (Array.isArray(v.flow) ? v.flow : []).map((s) => clip(s, 100)).filter((s) => SCREEN.test(s)).slice(0, 40);
  const dur = Math.round(Number(v.dur));
  if (!flow.length || !Number.isFinite(dur) || dur < 0 || dur > 6 * 3600_000) throw new HttpError(400, "invalid visit");

  const taps: Record<string, number> = {};
  for (const [label, count] of Object.entries(v.taps && typeof v.taps === "object" ? v.taps : {}).slice(0, 40)) {
    const key = noNumbers(clip(label, 80));
    const n = Math.min(1000, Math.max(0, Math.round(Number(count)) || 0));
    if (key && n) taps[key] = (taps[key] ?? 0) + n;
  }
  const errors = (Array.isArray(v.errors) ? v.errors : []).slice(0, 5);
  const dev = v.dev && typeof v.dev === "object" ? v.dev : {};
  const perf = v.perf && typeof v.perf === "object" ? v.perf : {};
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const os = clip(dev.os, 20);
  const browser = clip(dev.browser, 20);
  const area = String(v.area);

  const statements = [
    env.STATS_DB.prepare(
      `INSERT INTO visits (area, camp, dur_ms, flow, taps, errors, country, city, network, conn, lang, device, os, os_version,
         browser, model, src, ttfb_ms, load_ms, lcp_ms, nav_ms, tap_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      area,
      clip(v.camp, 60).toLowerCase().replace(/[^a-z0-9-]/g, ""),
      dur,
      JSON.stringify(flow),
      JSON.stringify(taps),
      errors.length,
      clip(cf?.country, 2),
      clip(cf?.city, 60),
      clip(cf?.asOrganization, 60),
      clip(dev.conn, 10),
      clip(dev.lang, 12),
      clip(dev.device, 10),
      os,
      clip(dev.osVersion, 12),
      browser,
      clip(dev.model, 40),
      clip(v.src, 40).toLowerCase().replace(/[^a-z0-9_.-]/g, ""),
      ms(perf.ttfb),
      ms(perf.load),
      ms(perf.lcp),
      ms(perf.nav),
      ms(perf.tap),
    ),
    ...errors.map((e) =>
      env.STATS_DB.prepare("INSERT INTO errors (area, screen, message, stack, os, browser) VALUES (?, ?, ?, ?, ?, ?)").bind(
        area,
        SCREEN.test(clip(e?.screen, 100)) ? clip(e?.screen, 100) : "",
        noNumbers(clip(e?.message, 200)) || "Unknown error",
        clip(e?.stack, 1500),
        os,
        browser,
      ),
    ),
  ];
  await env.STATS_DB.batch(statements);
  return new Response(null, { status: 204 });
}

// ─── Adding up ───────────────────────────────────────────────────────────────

const LENGTH = `CASE WHEN dur_ms < 30000 THEN 'a · under 30 s' WHEN dur_ms < 120000 THEN 'b · 30 s – 2 min'
  WHEN dur_ms < 600000 THEN 'c · 2 – 10 min' ELSE 'd · over 10 min' END`;
const DEPTH = `CASE json_array_length(flow) WHEN 1 THEN 'a · 1 screen' WHEN 2 THEN 'b · 2 screens'
  WHEN 3 THEN 'c · 3 screens' WHEN 4 THEN 'c · 4 screens' ELSE 'd · 5 or more' END`;
const LAST = "(SELECT value FROM json_each(visits.flow) ORDER BY key DESC LIMIT 1)";

/** dim → [key, n, ms] over one day's visits. Also used for today's numbers before the day is added up. */
const VISIT_DIMS: Record<string, [string, string, string]> = {
  visits: ["''", "count(*)", "sum(dur_ms)"],
  country: ["country", "count(*)", "0"],
  city: ["city || ', ' || country", "count(*)", "0"],
  network: ["network", "count(*)", "0"],
  conn: ["conn", "count(*)", "0"],
  lang: ["lang", "count(*)", "0"],
  device: ["device", "count(*)", "0"],
  os: ["trim(os || ' ' || os_version)", "count(*)", "0"],
  browser: ["browser", "count(*)", "0"],
  model: ["model", "count(*)", "0"],
  src: ["src", "count(*)", "0"],
  camp: ["camp", "count(*)", "0"],
  hour: ["strftime('%H', at)", "count(*)", "0"],
  length: [LENGTH, "count(*)", "sum(dur_ms)"],
  depth: [DEPTH, "count(*)", "0"],
  entry: ["json_extract(flow, '$[0]')", "count(*)", "0"],
  exit: [LAST, "count(*)", "0"],
  errors: ["''", "sum(errors)", "0"],
};
const PERF = ["ttfb", "load", "lcp", "nav", "tap"] as const;

function dayStatements(db: D1Database, day: string, into: boolean) {
  const head = into ? "INSERT INTO daily (day, area, dim, key, n, ms) " : "";
  const out: D1PreparedStatement[] = [];
  // Named columns, so liveDay can read them back the same way whatever the expressions are.
  const add = (dim: string, key: string, n: string, total: string, rest: string) =>
    out.push(
      db.prepare(`${head}SELECT ?1 AS day, area, '${dim}' AS dim, coalesce(${key}, '') AS key, ${n} AS n, coalesce(${total}, 0) AS ms ${rest}`).bind(day),
    );
  for (const [dim, [key, n, total]] of Object.entries(VISIT_DIMS)) {
    add(dim, key, n, total, `FROM visits WHERE day = ?1 GROUP BY area, coalesce(${key}, '') HAVING ${n} > 0`);
  }
  for (const p of PERF) {
    add("perf", `'${p}'`, `count(${p}_ms)`, `sum(${p}_ms)`, `FROM visits WHERE day = ?1 AND ${p}_ms IS NOT NULL GROUP BY area`);
    const slow = p === "tap" || p === "nav" ? 2000 : 4000;
    add("slow", `'${p}'`, "count(*)", "0", `FROM visits WHERE day = ?1 AND ${p}_ms > ${slow} GROUP BY area`);
  }
  // Slowest first screens: how long the biggest thing took to show, per screen.
  add("lcp_screen", "json_extract(flow, '$[0]')", "count(*)", "sum(lcp_ms)", "FROM visits WHERE day = ?1 AND lcp_ms IS NOT NULL GROUP BY area, json_extract(flow, '$[0]')");
  add("screen", "s.value", "count(*)", "0", "FROM visits, json_each(visits.flow) s WHERE day = ?1 GROUP BY area, s.value");
  add(
    "flow",
    "a.value || ' → ' || b.value",
    "count(*)",
    "0",
    "FROM visits, json_each(visits.flow) a, json_each(visits.flow) b WHERE day = ?1 AND b.key = a.key + 1 AND a.value <> b.value GROUP BY area, a.value || ' → ' || b.value",
  );
  add("tap", "t.key", "sum(t.value)", "0", "FROM visits, json_each(visits.taps) t WHERE day = ?1 GROUP BY area, t.key");
  add("error", "message", "count(*)", "0", "FROM errors WHERE day = ?1 GROUP BY area, message");
  return out;
}

/** Today's (or any unfinished day's) numbers straight from the visits, in the same shape as `daily`. */
export async function liveDay(env: AppEnv, day: string) {
  const results = await env.STATS_DB.batch(dayStatements(env.STATS_DB, day, false));
  return results.flatMap((r) => r.results as { day: string; area: string; dim: string; key: string; n: number; ms: number }[]);
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Adds up finished days into `daily`, at most a few per run. Each day is replaced whole, so a rerun can't double it. */
export async function rollUp(env: AppEnv, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const done = await env.STATS_DB.prepare("SELECT v FROM meta WHERE k = 'rolled'").first<{ v: string }>();
  let day = done ? addDays(done.v, 1) : ((await env.STATS_DB.prepare("SELECT min(day) AS d FROM visits").first<{ d: string | null }>())?.d ?? today);
  const rolled: string[] = [];
  while (day < today && rolled.length < 3) {
    const active = await env.APP_DB.prepare("SELECT role, count(*) AS n FROM camp_active_days WHERE day = ? GROUP BY role").bind(day).all<{ role: string; n: number }>();
    await env.STATS_DB.batch([
      env.STATS_DB.prepare("DELETE FROM daily WHERE day = ?").bind(day),
      ...dayStatements(env.STATS_DB, day, true),
      ...active.results.map((r) =>
        env.STATS_DB.prepare("INSERT INTO daily (day, area, dim, key, n, ms) VALUES (?, ?, 'active', '', ?, 0)").bind(day, r.role, r.n),
      ),
      env.STATS_DB.prepare("INSERT INTO meta (k, v) VALUES ('rolled', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(day),
    ]);
    rolled.push(day);
    day = addDays(day, 1);
  }
  return rolled;
}

/**
 * Deletes what's older than KEEP_DAYS: visits, errors, the sign-in log and active days. A
 * deleted row counts as a written one, so at most `cap` of each per run.
 */
export async function prune(env: AppEnv, now = new Date(), cap = 1000) {
  const cutoff = addDays(now.toISOString().slice(0, 10), -KEEP_DAYS);
  const run = (db: D1Database, sql: string) => db.prepare(sql).bind(cutoff, cap).run().then((r) => r.meta.changes ?? 0);
  return {
    visits: await run(env.STATS_DB, "DELETE FROM visits WHERE id IN (SELECT id FROM visits WHERE day < ? LIMIT ?)"),
    errors: await run(env.STATS_DB, "DELETE FROM errors WHERE id IN (SELECT id FROM errors WHERE day < ? LIMIT ?)"),
    access: await run(env.APP_DB, "DELETE FROM camp_access_log WHERE id IN (SELECT id FROM camp_access_log WHERE created_at < ? LIMIT ?)"),
    active: await run(env.APP_DB, "DELETE FROM camp_active_days WHERE (day, actor) IN (SELECT day, actor FROM camp_active_days WHERE day < ? LIMIT ?)"),
    presence: await run(env.APP_DB, "DELETE FROM camp_presence WHERE actor IN (SELECT actor FROM camp_presence WHERE last_seen < ? LIMIT ?)"),
  };
}

/** The hourly job. `usage` is today's usage from the watchdog, when it could be read. */
export async function statsHourly(env: AppEnv, usage: Usage | null, now = new Date()) {
  const busy =
    !!usage && (usage.d1_rows_written >= 100_000 * PAUSE_AT || usage.worker_requests >= 100_000 * PAUSE_AT || usage.d1_rows_read >= 5_000_000 * PAUSE_AT);
  if (busy) {
    await env.STATS_DB.prepare("INSERT INTO meta (k, v) VALUES ('paused', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v")
      .bind(usage.day)
      .run();
    paused = { day: usage.day, checked: Date.now() };
    // Adding up and deleting cost writes too: they wait for a quieter hour.
    return { paused: usage.day };
  }
  return { rolled: await rollUp(env, now), pruned: await prune(env, now) };
}

/** POST /v1/admin/stats/today: today's numbers before they're added up (admin only). */
export async function statsToday(env: AppEnv) {
  const day = new Date().toISOString().slice(0, 10);
  const paused = await env.STATS_DB.prepare("SELECT v FROM meta WHERE k = 'paused'").first<{ v: string }>();
  return json({ rows: await liveDay(env, day), paused: paused?.v === day });
}
