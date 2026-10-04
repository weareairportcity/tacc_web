import { handleAdmin } from "./admin";
import { deleteMedia, getMedia, postSongEvent, putMedia } from "./media";
import { getPhoto, putPhoto } from "./photos";
import {
  getCampaign,
  getLive,
  getRank,
  postDeleteMine,
  postEntrants,
  postEntries,
  postLoginCode,
  postMine,
} from "./public";
import { runSms } from "./sms";
import { HttpError, corsHeaders, json, timingSafeEqual, type AppEnv } from "./util";

function requireAdminToken(request: Request, env: AppEnv) {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!env.ADMIN_SECRET || !token || !timingSafeEqual(token, env.ADMIN_SECRET)) {
    throw new HttpError(401, "unauthorized");
  }
}

/**
 * Soul winning API on Cloudflare (D1 + R2), replacing Supabase for campaigns.
 *
 *   Phones (field app)   → /v1/entrants, /v1/entries, /v1/photos/…, /v1/login-code, /v1/entries/mine|delete
 *   Counter / big screen → /v1/live/:slug via a short-cached Vercel route
 *   Photo links          → /v1/photo/… (signed, expiring)
 *   Admin (Next server)  → /v1/admin/* with ADMIN_SECRET
 *   Hourly SMS           → cron trigger
 */

async function route(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // media.theairportcitychurch.com/<key>: public church media.
  if (url.hostname.startsWith("media.")) {
    if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "method not allowed");
    return getMedia(request, env, decodeURIComponent(path.slice(1)));
  }
  if (method === "POST" && path === "/v1/sotw/events") return postSongEvent(request, env);

  if (path.startsWith("/v1/admin/media/") && method === "PUT") {
    requireAdminToken(request, env);
    return putMedia(request, env, decodeURIComponent(path.slice("/v1/admin/media/".length)));
  }
  if (path === "/v1/admin/media-delete" && method === "POST") {
    requireAdminToken(request, env);
    return deleteMedia(request, env);
  }
  if (path.startsWith("/v1/admin/") && method === "POST") return handleAdmin(request, env, path);

  let m: RegExpMatchArray | null;
  if (method === "GET" && (m = path.match(/^\/v1\/campaign\/([a-z0-9-]{1,40})$/))) {
    return getCampaign(env, m[1]);
  }
  if (method === "GET" && (m = path.match(/^\/v1\/rank\/([a-z0-9-]{1,40})$/))) {
    return getRank(request, env, m[1]);
  }
  if (method === "GET" && (m = path.match(/^\/v1\/live\/([a-z0-9-]{1,40})$/))) {
    return getLive(request, env, m[1]);
  }
  if (method === "GET" && (m = path.match(/^\/v1\/photo\/(.+)$/))) return getPhoto(request, env, m[1]);
  if (method === "PUT" && (m = path.match(/^\/v1\/photos\/(.+)$/))) return putPhoto(request, env, m[1]);
  if (method === "POST" && path === "/v1/entrants") return postEntrants(request, env);
  if (method === "POST" && path === "/v1/entries") return postEntries(request, env);
  if (method === "POST" && path === "/v1/login-code") return postLoginCode(request, env);
  if (method === "POST" && path === "/v1/entries/mine") return postMine(request, env);
  if (method === "POST" && path === "/v1/entries/delete") return postDeleteMine(request, env);
  if (method === "GET" && path === "/") return json({ ok: true, service: "soulwinning-api" });

  throw new HttpError(404, "not found");
}

export default {
  async fetch(request, env): Promise<Response> {
    const appEnv = env as AppEnv;
    const cors = corsHeaders(request, appEnv);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    let response: Response;
    try {
      response = await route(request, appEnv);
    } catch (err) {
      if (err instanceof HttpError) {
        response = json({ error: err.message }, { status: err.status });
      } else {
        console.error(err);
        response = json({ error: "server error" }, { status: 500 });
      }
    }

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runSms(env as AppEnv, new Date(controller.scheduledTime)).then((r) => console.log("sms", r)));
  },
} satisfies ExportedHandler<Env>;
