import { sendDailySummaries } from "./camp-summary";
import { leaderCodeCheck, leaderCodeNew, leaderCodeOff } from "./camp-leaders";
import { bulkCheck, payCancel, bulkInit, payCheck, payInit, paystackTransactions, postReconcile, refund } from "./camp";
import { recount } from "./db";
import { deletePhotos, signPaths } from "./photos";
import { runSms, sendSms } from "./sms";
import { checkUsage } from "./usage";
import { HttpError, UUID, json, readJson, timingSafeEqual, type AppEnv } from "./util";

/**
 * Admin API. Only the Next.js server calls this, with ADMIN_SECRET as a bearer
 * token; admins themselves sign in on the website with the admin code. That
 * keeps the dashboard's queries in the Next.js code (as SQL) instead of
 * spreading one endpoint per chart across two codebases.
 */

type Statement = { sql: string; params?: unknown[] };

/** "campaign" (soul winning, the default) or "app" (church app data). */
const database = (env: AppEnv, which: unknown) => (which === "app" ? env.APP_DB : env.DB);

function requireAdmin(request: Request, env: AppEnv) {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!env.ADMIN_SECRET || !token || !timingSafeEqual(token, env.ADMIN_SECRET)) {
    throw new HttpError(401, "unauthorized");
  }
}

const bind = (db: D1Database, s: Statement) => {
  if (typeof s?.sql !== "string" || !s.sql.trim()) throw new HttpError(400, "sql required");
  const params = Array.isArray(s.params) ? s.params : [];
  return db.prepare(s.sql).bind(...params);
};

type Many = Statement & { db?: string; cache?: number };
type ManyResult = { results: unknown[]; meta: unknown } | { error: string };

// Shared answers for counts that may be a few seconds old (Today, the nav, check-in totals):
// first this isolate's memory, then Cloudflare's cache for the data centre. Never for writes.
const memo = new Map<string, { until: number; value: ManyResult }>();
const isRead = (sql: string) => /^\s*(select|with)\b/i.test(sql) && !/\b(insert|update|delete|replace)\b/i.test(sql);

async function keyOf(s: Many) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([s.db, s.sql, s.params ?? []])));
  return `https://commune-cache.internal/q/${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function runOne(env: AppEnv, s: Many): Promise<ManyResult> {
  const seconds = typeof s.cache === "number" && s.cache > 0 && isRead(s.sql) ? Math.min(300, Math.floor(s.cache)) : 0;
  const key = seconds ? await keyOf(s) : "";
  if (seconds) {
    const hit = memo.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    const cached = await caches.default.match(key).catch(() => undefined);
    if (cached) {
      const value = (await cached.json()) as ManyResult;
      memo.set(key, { until: Date.now() + seconds * 1000, value });
      return value;
    }
  }
  try {
    const result = await bind(database(env, s.db), s).all();
    const value = { results: result.results ?? [], meta: result.meta };
    if (seconds) {
      // A hit reads nothing, so it reports no rows read.
      const stored = { results: value.results, meta: { rows_read: 0, rows_written: 0, cached: true } };
      memo.set(key, { until: Date.now() + seconds * 1000, value: stored });
      if (memo.size > 500) memo.delete(memo.keys().next().value!);
      await caches.default
        .put(key, new Response(JSON.stringify(stored), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${seconds}` } }))
        .catch(() => undefined);
    }
    return value;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Many separate statements in one request (not a transaction: each succeeds or fails on its
 * own, as separate requests would). Reads next to each other run together; a write waits for
 * everything before it and holds back everything after, so order is kept.
 */
async function runMany(env: AppEnv, statements: Many[]) {
  const out: ManyResult[] = new Array(statements.length);
  let reads: Promise<void>[] = [];
  for (let i = 0; i < statements.length; i++) {
    const s = statements[i];
    if (isRead(s?.sql ?? "")) {
      reads.push(runOne(env, s).then((r) => void (out[i] = r)));
      continue;
    }
    await Promise.all(reads);
    reads = [];
    out[i] = await runOne(env, s);
  }
  await Promise.all(reads);
  return out;
}

export async function handleAdmin(request: Request, env: AppEnv, path: string) {
  requireAdmin(request, env);
  const origin = env.PUBLIC_ORIGIN;

  switch (path) {
    case "/v1/admin/query": {
      const body = await readJson<Statement & { db?: string }>(request, 1024 * 1024);
      const result = await bind(database(env, body.db), body).all();
      return json({ results: result.results ?? [], meta: result.meta });
    }
    case "/v1/admin/many": {
      const { statements } = await readJson<{ statements?: Many[] }>(request, 4 * 1024 * 1024);
      if (!Array.isArray(statements) || statements.length === 0 || statements.length > 200) {
        throw new HttpError(400, "statements required (at most 200)");
      }
      for (const st of statements) if (typeof st?.sql !== "string" || !st.sql.trim()) throw new HttpError(400, "sql required");
      return json({ results: await runMany(env, statements) });
    }
    case "/v1/admin/batch": {
      const { statements, db } = await readJson<{ statements?: Statement[]; db?: string }>(
        request,
        4 * 1024 * 1024,
      );
      if (!Array.isArray(statements) || statements.length === 0) {
        throw new HttpError(400, "statements required");
      }
      const target = database(env, db);
      const results = await target.batch(statements.map((s) => bind(target, s)));
      return json({ results: results.map((r) => ({ results: r.results ?? [], meta: r.meta })) });
    }
    case "/v1/admin/recount": {
      const { campaign_id } = await readJson<{ campaign_id?: string }>(request);
      if (!campaign_id || !UUID.test(campaign_id)) throw new HttpError(400, "campaign_id required");
      await recount(env.DB, campaign_id).run();
      return json({ ok: true });
    }
    case "/v1/admin/photo-urls": {
      const { paths, thumb } = await readJson<{ paths?: string[]; thumb?: boolean }>(request);
      if (!Array.isArray(paths)) throw new HttpError(400, "paths required");
      return json({ urls: await signPaths(env, origin, paths.slice(0, 5000), Boolean(thumb)) });
    }
    case "/v1/admin/photos/delete": {
      const { paths } = await readJson<{ paths?: string[] }>(request);
      if (!Array.isArray(paths)) throw new HttpError(400, "paths required");
      return json({ deleted: await deletePhotos(env, paths) });
    }
    case "/v1/admin/photos/purge-campaign": {
      // Clears every photo under a campaign, including ones whose entry never
      // synced. Used by "clear all entries" before the real day.
      const { campaign_id } = await readJson<{ campaign_id?: string }>(request);
      if (!campaign_id || !UUID.test(campaign_id)) throw new HttpError(400, "campaign_id required");
      let cursor: string | undefined;
      let removed = 0;
      do {
        const page = await env.PHOTOS.list({ prefix: `${campaign_id}/`, cursor, limit: 1000 });
        const keys = page.objects.map((o) => o.key);
        if (keys.length) await env.PHOTOS.delete(keys);
        removed += keys.length;
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return json({ removed });
    }
    case "/v1/admin/usage": {
      // Today's usage against the free limits. notify:false = just look.
      const { notify } = await readJson<{ notify?: boolean }>(request);
      return json(await checkUsage(env, { notify: Boolean(notify) }));
    }
    case "/v1/admin/usage/test-alert": {
      // Sends one test text to ALERT_PHONE through the same path real alerts use.
      const to = env.ALERT_PHONE;
      if (!to) throw new HttpError(400, "ALERT_PHONE not set");
      const sent = await sendSms(
        env,
        to,
        "TACC website alert (test): usage alerts are set up. You'll get a text like this if Cloudflare usage passes 60% of a free daily limit.",
      );
      return json({ sent });
    }
    case "/v1/admin/camp/pay-init":
      return payInit(request, env);
    case "/v1/admin/camp/check":
      return payCheck(request, env);
    case "/v1/admin/camp/reconcile":
      return postReconcile(request, env);
    case "/v1/admin/camp/paystack-transactions":
      return paystackTransactions(request, env);
    case "/v1/admin/camp/bulk-init":
      return bulkInit(request, env);
    case "/v1/admin/camp/bulk-check":
      return bulkCheck(request, env);
    case "/v1/admin/camp/pay-cancel":
      return payCancel(request, env);
    case "/v1/admin/camp/refund":
      return refund(request, env);
    case "/v1/admin/camp/leader-code/new":
      return leaderCodeNew(request, env);
    case "/v1/admin/camp/leader-code/check":
      return leaderCodeCheck(request, env);
    case "/v1/admin/camp/leader-code/off":
      return leaderCodeOff(request, env);
    case "/v1/admin/camp/summary": {
      // Tests and a manual "send it now": ignores the hour, still once a day.
      const { at } = await readJson<{ at?: string }>(request);
      return json(await sendDailySummaries(env, at ? new Date(at) : new Date(), true));
    }
    case "/v1/admin/sms/run": {
      const { force } = await readJson<{ force?: boolean }>(request);
      return json(await runSms(env, new Date(), Boolean(force)));
    }
    default:
      throw new HttpError(404, "not found");
  }
}
