import {
  campaignById,
  campaignBySlug,
  countNewPending,
  countNewSoul,
  recount,
  type Campaign,
  type CountsRow,
} from "./db";
import { photoUrl, thumbPathFor } from "./photos";
import {
  HttpError,
  UUID,
  json,
  normalizeName,
  normalizePhone,
  readJson,
  type AppEnv,
} from "./util";

const LOGIN_CODE = /^[A-Z0-9]{4}$/;
const MAX_ROWS = 50;
// A phone that was offline all day may sync long after closing; its souls
// still count if they were logged before the campaign closed.
const LATE_LOG_GRACE_MS = 15 * 60 * 1000;
const EARLY_LOG_GRACE_MS = 60 * 60 * 1000;

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null;
const optStr = (v: unknown, max: number) =>
  v === null || v === undefined || v === "" ? null : str(v, max);
const isoDate = (v: unknown) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
const coord = (v: unknown, limit: number) =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit ? v : null;

// ─── Campaign ────────────────────────────────────────────────────────────────

export function publicCampaign(c: Campaign) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    event_date: c.event_date,
    opens_at: c.opens_at,
    closes_at: c.closes_at,
    goal_total: c.goal_total,
  };
}

export async function getCampaign(env: AppEnv, slug: string) {
  const campaign = await campaignBySlug(env.DB, slug);
  if (!campaign) throw new HttpError(404, "campaign not found");
  return json({ campaign: publicCampaign(campaign) });
}

// ─── Entrants ────────────────────────────────────────────────────────────────

export async function postEntrants(request: Request, env: AppEnv) {
  const { rows } = await readJson<{ rows?: unknown[] }>(request);
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) {
    throw new HttpError(400, "rows required");
  }

  const statements = rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" && UUID.test(r.id) ? r.id : null;
    const deviceId = typeof r.device_id === "string" && UUID.test(r.device_id) ? r.device_id : null;
    const name = str(r.name, 80);
    const createdAt = isoDate(r.created_at);
    const code = typeof r.login_code === "string" ? r.login_code.toUpperCase() : null;
    if (!id || !deviceId || !name || !createdAt) throw new HttpError(400, "invalid entrant");
    return env.DB.prepare(
      `INSERT OR IGNORE INTO entrants (id, device_id, name, fellowship, phone, pfcc, login_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      deviceId,
      name,
      optStr(r.fellowship, 80),
      optStr(r.phone, 30),
      optStr(r.pfcc, 80),
      code && LOGIN_CODE.test(code) ? code : null,
      createdAt,
    );
  });

  await env.DB.batch(statements);
  return json({ ok: true });
}

// ─── Entries ─────────────────────────────────────────────────────────────────

type EntryRow = {
  id: string;
  campaign_id: string;
  entrant_id: string;
  group_id: string;
  soul_name: string;
  phone: string | null;
  norm_name: string;
  norm_phone: string | null;
  latitude: number | null;
  longitude: number | null;
  spoke_in_tongues: number;
  coming_to_church: number;
  photo_path: string | null;
  created_at: string;
};

function parseEntry(raw: unknown): EntryRow {
  const r = raw as Record<string, unknown>;
  const ids = ["id", "campaign_id", "entrant_id", "group_id"].map((k) =>
    typeof r[k] === "string" && UUID.test(r[k] as string) ? (r[k] as string).toLowerCase() : null,
  );
  const soulName = str(r.soul_name, 120);
  const createdAt = isoDate(r.created_at);
  if (ids.some((v) => !v) || !soulName || !createdAt) throw new HttpError(400, "invalid entry");
  const [id, campaignId, entrantId, groupId] = ids as string[];

  const phone = optStr(r.phone, 30);
  const lat = coord(r.latitude, 90);
  const lng = coord(r.longitude, 180);
  // Only the one path the phone is supposed to use for this entry.
  const photoPath = r.photo_path === `${campaignId}/${id}.jpg` ? (r.photo_path as string) : null;

  return {
    id,
    campaign_id: campaignId,
    entrant_id: entrantId,
    group_id: groupId,
    soul_name: soulName,
    phone,
    norm_name: normalizeName(soulName),
    norm_phone: normalizePhone(phone),
    latitude: lat !== null && lng !== null ? lat : null,
    longitude: lat !== null && lng !== null ? lng : null,
    spoke_in_tongues: r.spoke_in_tongues === true ? 1 : 0,
    coming_to_church: r.coming_to_church === true ? 1 : 0,
    photo_path: photoPath,
    created_at: createdAt,
  };
}

/**
 * Saves a batch of souls from a phone's offline queue. Idempotent by id: a
 * retried sync is a no-op. Replaces the Postgres duplicate-flag and count
 * triggers — each new row is checked for a same-day name+phone match, then
 * inserted and added to the running totals in one transaction.
 */
export async function postEntries(request: Request, env: AppEnv) {
  const { rows: raw } = await readJson<{ rows?: unknown[] }>(request);
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ROWS) {
    throw new HttpError(400, "rows required");
  }
  const rows = raw.map(parseEntry);

  const campaigns = new Map<string, Campaign>();
  for (const id of new Set(rows.map((r) => r.campaign_id))) {
    const c = await campaignById(env.DB, id);
    if (!c) throw new HttpError(400, "unknown campaign");
    campaigns.set(id, c);
  }

  // Entrants go up before entries; if one hasn't landed yet, the phone retries.
  const entrantIds = [...new Set(rows.map((r) => r.entrant_id))];
  const known = await env.DB.prepare(
    `SELECT id FROM entrants WHERE id IN (${entrantIds.map(() => "?").join(",")})`,
  )
    .bind(...entrantIds)
    .all<{ id: string }>();
  if ((known.results?.length ?? 0) < entrantIds.length) {
    throw new HttpError(409, "entrant not synced yet");
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM entries WHERE id IN (${rows.map(() => "?").join(",")})`,
  )
    .bind(...rows.map((r) => r.id))
    .all<{ id: string }>();
  const seen = new Set((existing.results ?? []).map((r) => r.id));

  const statements: D1PreparedStatement[] = [];
  const batchKeys = new Set<string>();
  let accepted = 0;
  let outsideWindow = 0;

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);

    const campaign = campaigns.get(row.campaign_id)!;
    const at = Date.parse(row.created_at);
    if (
      at < Date.parse(campaign.opens_at) - EARLY_LOG_GRACE_MS ||
      at > Date.parse(campaign.closes_at) + LATE_LOG_GRACE_MS
    ) {
      outsideWindow += 1;
      continue;
    }

    // Same name + same phone on the same (Accra = UTC) day is held for review.
    let status: "none" | "pending" = "none";
    if (row.norm_phone) {
      const key = `${row.campaign_id}|${row.norm_name}|${row.norm_phone}|${row.created_at.slice(0, 10)}`;
      const match = batchKeys.has(key)
        ? true
        : await env.DB.prepare(
            `SELECT 1 FROM entries
             WHERE campaign_id = ? AND norm_name = ? AND norm_phone = ? AND substr(created_at, 1, 10) = ?
             LIMIT 1`,
          )
            .bind(row.campaign_id, row.norm_name, row.norm_phone, row.created_at.slice(0, 10))
            .first();
      if (match) status = "pending";
      batchKeys.add(key);
    }

    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO entries
           (id, campaign_id, entrant_id, group_id, soul_name, phone, norm_name, norm_phone,
            latitude, longitude, spoke_in_tongues, coming_to_church, photo_path, duplicate_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        row.id,
        row.campaign_id,
        row.entrant_id,
        row.group_id,
        row.soul_name,
        row.phone,
        row.norm_name,
        row.norm_phone,
        row.latitude,
        row.longitude,
        row.spoke_in_tongues,
        row.coming_to_church,
        row.photo_path,
        status,
        row.created_at,
      ),
      status === "pending" ? countNewPending(env.DB, row.campaign_id) : countNewSoul(env.DB, row),
    );
    accepted += 1;
  }

  if (statements.length) await env.DB.batch(statements);
  return json({ ok: true, accepted, outside_window: outsideWindow });
}

// ─── Member sign-in with a login code, "my souls", and deleting my own ───────

export async function postLoginCode(request: Request, env: AppEnv) {
  const { code } = await readJson<{ code?: unknown }>(request);
  const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!LOGIN_CODE.test(normalized)) throw new HttpError(400, "code required");
  const row = await env.DB.prepare(
    `SELECT id, name, fellowship, phone, pfcc, login_code, created_at
     FROM entrants WHERE login_code = ? ORDER BY created_at LIMIT 1`,
  )
    .bind(normalized)
    .first();
  if (!row) throw new HttpError(404, "not found");
  return json(row);
}

export async function postMine(request: Request, env: AppEnv) {
  const { code, campaign_id } = await readJson<{ code?: unknown; campaign_id?: unknown }>(request);
  const normalized = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!LOGIN_CODE.test(normalized) || typeof campaign_id !== "string" || !UUID.test(campaign_id)) {
    throw new HttpError(400, "code required");
  }
  const entrant = await env.DB.prepare(
    "SELECT id FROM entrants WHERE login_code = ? ORDER BY created_at LIMIT 1",
  )
    .bind(normalized)
    .first<{ id: string }>();
  if (!entrant) return json({ entries: [] });

  const { results } = await env.DB.prepare(
    `SELECT id, campaign_id, entrant_id, group_id, soul_name, phone, latitude, longitude,
            spoke_in_tongues, coming_to_church, created_at, photo_path
     FROM entries WHERE campaign_id = ? AND entrant_id = ?
     ORDER BY created_at DESC LIMIT 2000`,
  )
    .bind(campaign_id, entrant.id)
    .all<Record<string, unknown>>();

  return json({
    entries: (results ?? []).map((r) => ({
      ...r,
      spoke_in_tongues: r.spoke_in_tongues === 1,
      coming_to_church: r.coming_to_church === 1,
    })),
  });
}

/**
 * Device-scoped delete: members aren't signed in, so the proof is that the
 * entries belong to an entrant registered from this same device.
 */
export async function postDeleteMine(request: Request, env: AppEnv) {
  const { ids: rawIds, device_id } = await readJson<{ ids?: unknown; device_id?: unknown }>(request);
  const deviceId = typeof device_id === "string" && UUID.test(device_id) ? device_id : null;
  const ids = Array.isArray(rawIds)
    ? [...new Set(rawIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))]
    : [];
  if (!deviceId || ids.length === 0 || ids.length > 500) throw new HttpError(400, "ids required");

  const found: { id: string; campaign_id: string; photo_path: string | null; device_id: string }[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const batch = ids.slice(i, i + 90);
    const { results } = await env.DB.prepare(
      `SELECT e.id, e.campaign_id, e.photo_path, n.device_id
       FROM entries e JOIN entrants n ON n.id = e.entrant_id
       WHERE e.id IN (${batch.map(() => "?").join(",")})`,
    )
      .bind(...batch)
      .all<(typeof found)[number]>();
    found.push(...(results ?? []));
  }
  if (found.length === 0) return json({ deleted: 0 });
  if (found.some((row) => row.device_id !== deviceId)) throw new HttpError(403, "forbidden");

  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < found.length; i += 90) {
    const batch = found.slice(i, i + 90).map((r) => r.id);
    statements.push(
      env.DB.prepare(`DELETE FROM entries WHERE id IN (${batch.map(() => "?").join(",")})`).bind(
        ...batch,
      ),
    );
  }
  for (const campaignId of new Set(found.map((r) => r.campaign_id))) {
    statements.push(recount(env.DB, campaignId));
  }
  await env.DB.batch(statements);

  const paths = found.flatMap((r) => (r.photo_path ? [r.photo_path, thumbPathFor(r.photo_path)] : []));
  for (let i = 0; i < paths.length; i += 1000) await env.PHOTOS.delete(paths.slice(i, i + 1000));

  return json({ deleted: found.length });
}

// ─── The live counter feed ───────────────────────────────────────────────────

/**
 * Everything the counter and big screen show, in one response. The Vercel
 * route in front of this caches it for a few seconds, so however many screens
 * are open, this runs a handful of times a minute and reads one counts row.
 */
export async function getLive(request: Request, env: AppEnv, slug: string) {
  const campaign = await campaignBySlug(env.DB, slug);
  if (!campaign) throw new HttpError(404, "campaign not found");
  const counts = await env.DB.prepare("SELECT * FROM counts WHERE campaign_id = ?")
    .bind(campaign.id)
    .first<CountsRow>();

  const origin = env.PUBLIC_ORIGIN;
  const photoPaths: string[] = counts ? JSON.parse(counts.recent_photo_paths) : [];
  const photos = await Promise.all(
    photoPaths.map((path) => photoUrl(env, origin, thumbPathFor(path))),
  );

  return json(
    {
      campaign: publicCampaign(campaign),
      counts: counts && {
        total_souls: counts.total_souls,
        tongues_count: counts.tongues_count,
        church_count: counts.church_count,
        last_soul_name: counts.last_soul_name,
        last_entry_id: counts.last_entry_id,
        recent_names: JSON.parse(counts.recent_names) as string[],
        recent_photos: photos,
        last_photo: counts.last_photo_path
          ? await photoUrl(env, origin, counts.last_photo_path)
          : null,
        updated_at: counts.updated_at,
      },
      server_time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "public, max-age=5" } },
  );
}
