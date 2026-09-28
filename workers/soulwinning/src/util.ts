export type AppEnv = Env & {
  ADMIN_SECRET: string;
  PHOTO_SIGNING_SECRET: string;
  MNOTIFY_API_KEY?: string;
  MNOTIFY_SENDER_ID?: string;
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readJson<T>(request: Request, maxBytes = 512 * 1024): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new HttpError(413, "request too large");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "request too large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

export const nowIso = () => new Date().toISOString();

// ─── Normalisation (same rules as the Postgres functions it replaces) ────────

/** "ama  MENSAH" and "Ama Mensah" are the same name. */
export const normalizeName = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/** 0551112222, +233551112222 and 233 55 111 2222 are the same number. */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0")) return `233${digits.slice(1)}`;
  return `233${digits}`;
}

/** First name only — all the public counter is ever told about a soul. */
export const firstName = (name: string) => name.replace(/\s+/g, " ").trim().split(" ")[0] ?? "";

// ─── Secrets and signatures ──────────────────────────────────────────────────

const encoder = new TextEncoder();

export async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function timingSafeEqual(a: string, b: string) {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

// ─── CORS for the public endpoints the phones and pages call directly ────────

export function corsHeaders(request: Request, env: AppEnv) {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}
