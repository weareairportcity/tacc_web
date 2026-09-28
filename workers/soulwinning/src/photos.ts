import { HttpError, UUID, hmac, timingSafeEqual, type AppEnv } from "./util";

/**
 * Soul photos in R2. Keys are `<campaign_id>/<entry_id>.jpg` (≈1024px, for the
 * celebration card and admin) and `<campaign_id>/<entry_id>-t.jpg` (small, for
 * the marquee). Nothing is public: every link is signed and expires.
 *
 * Expiry is rounded up to a 6-hour boundary, so every poll of the live feed
 * hands out the *same* URL for hours. The browser then keeps each photo in its
 * cache instead of downloading it again — 1909 re-signed every 45 seconds and
 * re-downloaded every photo on every screen each time.
 */

const WINDOW_MS = 6 * 60 * 60 * 1000;
const KEY = /^([0-9a-f-]{36})\/([0-9a-f-]{36})(-t)?\.jpg$/i;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export const thumbPathFor = (path: string) => path.replace(/\.jpg$/, "-t.jpg");

export async function photoUrl(env: AppEnv, origin: string, key: string) {
  const exp = Math.ceil((Date.now() + WINDOW_MS) / WINDOW_MS) * WINDOW_MS;
  const sig = await hmac(env.PHOTO_SIGNING_SECRET, `${key}:${exp}`);
  return `${origin}/v1/photo/${key}?exp=${exp}&sig=${sig}`;
}

function checkKey(key: string) {
  const m = key.match(KEY);
  if (!m || !UUID.test(m[1]) || !UUID.test(m[2])) throw new HttpError(404, "not found");
  return { campaignId: m[1].toLowerCase(), isThumb: Boolean(m[3]) };
}

/** A phone uploading a photo (full or thumbnail) before its entry syncs. */
export async function putPhoto(request: Request, env: AppEnv, key: string) {
  const { campaignId } = checkKey(key);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PHOTO_BYTES) throw new HttpError(413, "photo too large");

  const campaign = await env.DB.prepare("SELECT 1 FROM campaigns WHERE id = ?").bind(campaignId).first();
  if (!campaign) throw new HttpError(404, "unknown campaign");

  // Already there means an earlier attempt succeeded; photos never change.
  if (await env.PHOTOS.head(key)) return new Response(null, { status: 204 });

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new HttpError(413, "photo too large");
  }
  const head = new Uint8Array(bytes, 0, 3);
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    throw new HttpError(415, "photos must be JPEG");
  }

  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
  return new Response(null, { status: 201 });
}

/** Serves a photo to anyone holding a valid, unexpired signed link. */
export async function getPhoto(request: Request, env: AppEnv, key: string) {
  const { isThumb } = checkKey(key);
  const url = new URL(request.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!Number.isFinite(exp) || exp < Date.now()) throw new HttpError(403, "link expired");
  if (!timingSafeEqual(sig, await hmac(env.PHOTO_SIGNING_SECRET, `${key}:${exp}`))) {
    throw new HttpError(403, "bad signature");
  }

  // Serve from Cloudflare's edge cache when we can (custom domains only).
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  // A phone on an old build may not have sent a thumbnail; fall back to full.
  let object = await env.PHOTOS.get(key);
  if (!object && isThumb) object = await env.PHOTOS.get(key.replace(/-t\.jpg$/, ".jpg"));
  if (!object) throw new HttpError(404, "not found");

  const maxAge = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  const response = new Response(object.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": `public, max-age=${maxAge}, immutable`,
      ETag: object.httpEtag,
    },
  });
  await cache.put(request, response.clone());
  return response;
}

/** Signed links for admin screens (full size or thumbnails). */
export async function signPaths(env: AppEnv, origin: string, paths: string[], thumb: boolean) {
  const out: Record<string, string> = {};
  for (const path of paths) {
    if (!KEY.test(path)) continue;
    out[path] = await photoUrl(env, origin, thumb ? thumbPathFor(path) : path);
  }
  return out;
}

export async function deletePhotos(env: AppEnv, paths: string[]) {
  const keys = paths.filter((p) => KEY.test(p)).flatMap((p) => [p, thumbPathFor(p)]);
  for (let i = 0; i < keys.length; i += 1000) await env.PHOTOS.delete(keys.slice(i, i + 1000));
  return keys.length / 2;
}
