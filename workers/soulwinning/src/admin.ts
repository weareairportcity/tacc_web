import { recount } from "./db";
import { deletePhotos, signPaths } from "./photos";
import { runSms } from "./sms";
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

export async function handleAdmin(request: Request, env: AppEnv, path: string) {
  requireAdmin(request, env);
  const origin = env.PUBLIC_ORIGIN;

  switch (path) {
    case "/v1/admin/query": {
      const body = await readJson<Statement & { db?: string }>(request, 1024 * 1024);
      const result = await bind(database(env, body.db), body).all();
      return json({ results: result.results ?? [], meta: result.meta });
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
    case "/v1/admin/sms/run": {
      const { force } = await readJson<{ force?: boolean }>(request);
      return json(await runSms(env, new Date(), Boolean(force)));
    }
    default:
      throw new HttpError(404, "not found");
  }
}
