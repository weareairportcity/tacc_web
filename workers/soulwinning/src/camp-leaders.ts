import { HttpError, json, nowIso, readJson, type AppEnv } from "./util";

/**
 * Sign-in codes for fellowship and PFCC leaders. The code is the only
 * credential, so it's long (10 characters from 32, about 10^15) and only an
 * HMAC keyed with LEADER_CODE_SECRET is stored: a copy of the database can't
 * be used to guess codes offline. The Next server rate-limits attempts.
 *
 *   /v1/admin/camp/leader-code/new    make a code for a fellowship or PFCC (turns off the old one)
 *   /v1/admin/camp/leader-code/check  which leader a typed code belongs to
 *   /v1/admin/camp/leader-code/off    turn a code off
 */

// No 0/O or 1/I, as for attendee codes. 32 symbols, so byte % 32 is unbiased.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LENGTH = 10;
const SCOPES = ["fellowship", "pfcc"] as const;

const normalize = (raw: unknown) =>
  String(raw ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");

async function hash(env: AppEnv, code: string) {
  const secret = env.LEADER_CODE_SECRET ?? "";
  if (secret.length < 32) throw new HttpError(503, "leader codes are not set up");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`leader-code.${code}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

const audit = (env: AppEnv, actor: string, action: string, entityId: string, after: unknown) =>
  env.APP_DB.prepare(
    `INSERT INTO camp_audit_log (camp_id, actor, action, entity, entity_id, after_json) VALUES (NULL, ?, ?, 'leader_code', ?, ?)`,
  ).bind(actor, action, entityId, JSON.stringify(after));

export async function leaderCodeNew(request: Request, env: AppEnv) {
  const { scope_kind, scope_value, actor } = await readJson<{ scope_kind?: unknown; scope_value?: unknown; actor?: unknown }>(request);
  if (!SCOPES.includes(scope_kind as (typeof SCOPES)[number])) throw new HttpError(400, "scope_kind must be fellowship or pfcc");
  const value = typeof scope_value === "string" ? scope_value.trim().slice(0, 80) : "";
  const by = typeof actor === "string" ? actor.slice(0, 254) : "";
  if (!value || !by) throw new HttpError(400, "scope_value and actor required");

  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  const id = crypto.randomUUID();
  await env.APP_DB.batch([
    env.APP_DB.prepare("UPDATE camp_leader_codes SET revoked_at = ? WHERE scope_kind = ? AND scope_value = ? AND revoked_at IS NULL").bind(
      nowIso(),
      scope_kind,
      value,
    ),
    env.APP_DB.prepare("INSERT INTO camp_leader_codes (id, scope_kind, scope_value, code_hash, created_by) VALUES (?, ?, ?, ?, ?)").bind(
      id,
      scope_kind,
      value,
      await hash(env, code),
      by,
    ),
    audit(env, by, "leader_code.create", id, { scope_kind, scope_value: value }),
  ]);
  return json({ id, code: `${code.slice(0, 5)}-${code.slice(5)}` });
}

export async function leaderCodeCheck(request: Request, env: AppEnv) {
  const { code } = await readJson<{ code?: unknown }>(request);
  const typed = normalize(code);
  if (typed.length !== LENGTH) throw new HttpError(404, "no such code");
  const row = await env.APP_DB.prepare(
    "SELECT id, scope_kind, scope_value, code_hash FROM camp_leader_codes WHERE code_hash = ? AND revoked_at IS NULL",
  )
    .bind(await hash(env, typed))
    .first<{ id: string; scope_kind: string; scope_value: string; code_hash: string }>();
  if (!row) throw new HttpError(404, "no such code");
  await env.APP_DB.prepare("UPDATE camp_leader_codes SET last_used_at = ? WHERE id = ?").bind(nowIso(), row.id).run();
  return json(row);
}

export async function leaderCodeOff(request: Request, env: AppEnv) {
  const { id, actor } = await readJson<{ id?: unknown; actor?: unknown }>(request);
  if (typeof id !== "string" || typeof actor !== "string") throw new HttpError(400, "id and actor required");
  const result = await env.APP_DB.batch([
    env.APP_DB.prepare("UPDATE camp_leader_codes SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(nowIso(), id),
    audit(env, actor.slice(0, 254), "leader_code.off", id, null),
  ]);
  return json({ off: result[0].meta.changes === 1 });
}
