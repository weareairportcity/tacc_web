import { HttpError, json, readJson, type AppEnv } from "./util";

/**
 * Public church media (Song of the Week audio and covers) from the tacc-media
 * R2 bucket, at media.theairportcitychurch.com/<key>. Downloads from R2 are
 * free, which is the point: Supabase charged egress for every play.
 *
 * Audio needs byte ranges so the player can seek; full responses are kept in
 * Cloudflare's edge cache. Keys never change (uploads get a fresh name), so
 * everything is cacheable for a year.
 */

const KEY = /^[a-z0-9][a-z0-9._-]{0,150}$/;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function contentTypeFor(key: string) {
  return TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

function parseRange(header: string | null): R2Range | undefined {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return undefined;
  if (!m[1]) return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  return m[2] ? { offset, length: Number(m[2]) - offset + 1 } : { offset };
}

export async function getMedia(request: Request, env: AppEnv, key: string) {
  if (!KEY.test(key)) throw new HttpError(404, "not found");
  const range = parseRange(request.headers.get("Range"));
  const cache = caches.default;

  if (!range) {
    const cached = await cache.match(request);
    if (cached) return cached;
  }

  const object = await env.MEDIA.get(key, range ? { range } : undefined);
  if (!object) throw new HttpError(404, "not found");

  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType ?? contentTypeFor(key),
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    ETag: object.httpEtag,
    "Access-Control-Allow-Origin": "*",
  });

  if (range && "body" in object) {
    const r = object.range as { offset?: number; length?: number } | undefined;
    const start = r?.offset ?? 0;
    const length = r?.length ?? object.size - start;
    headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(object.size));
  const response = new Response((object as R2ObjectBody).body, { headers });
  if (request.method === "GET") await cache.put(request, response.clone());
  return response;
}

/** Admin upload, called from the Next.js server. */
export async function putMedia(request: Request, env: AppEnv, key: string) {
  if (!KEY.test(key)) throw new HttpError(400, "bad key");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_MEDIA_BYTES) throw new HttpError(413, "file too large");
  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_MEDIA_BYTES) throw new HttpError(413, "file too large");
  await env.MEDIA.put(key, body, {
    httpMetadata: { contentType: request.headers.get("Content-Type") || contentTypeFor(key) },
  });
  return json({ key, url: `${env.MEDIA_ORIGIN}/${key}` });
}

export async function deleteMedia(request: Request, env: AppEnv) {
  const { keys } = await readJson<{ keys?: string[] }>(request);
  const valid = (keys ?? []).filter((k) => KEY.test(k));
  if (valid.length) await env.MEDIA.delete(valid);
  return json({ deleted: valid.length });
}

// ─── Song of the Week analytics, posted straight from the browser ───────────

const VISITOR = /^[A-Za-z0-9_-]{4,64}$/;
const SONG = /^[0-9a-f-]{36}$/i;

export async function postSongEvent(request: Request, env: AppEnv) {
  const { song_id, event_type, visitor_id } = await readJson<Record<string, unknown>>(request, 2048);
  if (
    typeof song_id !== "string" ||
    !SONG.test(song_id) ||
    (event_type !== "view" && event_type !== "play" && event_type !== "repeat") ||
    typeof visitor_id !== "string" ||
    !VISITOR.test(visitor_id)
  ) {
    throw new HttpError(400, "invalid event");
  }
  // Only for real songs, so junk ids can't fill the table.
  await env.APP_DB.prepare(
    `INSERT INTO sotw_events (song_id, event_type, visitor_id)
     SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM sotw_songs WHERE id = ?1)`,
  )
    .bind(song_id.toLowerCase(), event_type, visitor_id)
    .run();
  return json({ ok: true });
}
