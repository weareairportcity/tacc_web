import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { batch, post, query } from "@/lib/cf";
import { FELLOWSHIPS, GROUPS, PFCCS, isGroup } from "@/lib/fellowships";
import { cleanHolder, leaderActor } from "./leader-name";
import { auditStatement } from "./audit";
import { accessStatements, whereFrom } from "./logs";
import { campSecret } from "./codes";
import { CampError, type ScopeKind, type Staff } from "./types";

/**
 * Fellowship and PFCC leaders sign in with a code instead of an email and
 * password. The Worker makes and checks codes (workers/soulwinning/src/
 * camp-leaders.ts); here are the signed-in session, the leader's identity as
 * camp staff (role leader, scoped), and the admin's list of codes.
 *
 * A leader's actor in the audit log: see leader-name.ts. Group Leaders each
 * have their own code (holder_name); fellowship and PFCC codes are shared.
 */

export type LeaderCode = {
  id: string;
  created_at: string;
  scope_kind: ScopeKind;
  scope_value: string;
  /** A Group Leader's name; null for shared fellowship and PFCC codes. */
  holder_name: string | null;
  last_used_at: string | null;
};

const COOKIE = "camp_leader";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export { leaderActor, leaderName } from "./leader-name";

const sign = (payload: string) => createHmac("sha256", campSecret()).update(`leader-session.${payload}`).digest("base64url");
const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** The shared codes: one per fellowship and one per PFCC. (Group Leaders' codes are per person.) */
export function leaderScopes(): { kind: "fellowship" | "pfcc"; value: string }[] {
  return [...FELLOWSHIPS.map((f) => ({ kind: "fellowship" as const, value: f.name })), ...PFCCS.map((p) => ({ kind: "pfcc" as const, value: p }))];
}

export const leaderGroups = () => [...GROUPS];

const validScope = (kind: string, value: string) => (kind === "group" ? isGroup(value) : leaderScopes().some((s) => s.kind === kind && s.value === value));

/** Active codes (not the codes themselves: only their hashes are kept). */
export function listLeaderCodes(): Promise<LeaderCode[]> {
  return query<LeaderCode>(
    "app",
    "SELECT id, created_at, scope_kind, scope_value, holder_name, last_used_at FROM camp_leader_codes WHERE revoked_at IS NULL ORDER BY scope_kind, scope_value, holder_name COLLATE NOCASE",
  );
}

/** A new code for a fellowship, PFCC or Group Leader (by name), shown once. That code's old one stops working. */
export async function newLeaderCode(actor: string, kind: ScopeKind, value: string, holder?: string) {
  if (!validScope(kind, value)) throw new CampError("Choose a fellowship, PFCC or group from the list.");
  const name = kind === "group" ? cleanHolder(String(holder ?? "")) : "";
  if (kind === "group" && name.length < 2) throw new CampError("Enter the Group Leader's name.");
  return post<{ id: string; code: string }>("/v1/admin/camp/leader-code/new", { scope_kind: kind, scope_value: value, ...(name ? { holder_name: name } : {}), actor });
}

export async function turnOffLeaderCode(actor: string, id: string) {
  await post("/v1/admin/camp/leader-code/off", { id: String(id), actor });
}

/** Signs a leader in with their code. Null if the code doesn't match an active one. */
export async function signInLeader(code: string) {
  let row: { id: string; scope_kind: ScopeKind; scope_value: string; holder_name: string | null; code_hash: string };
  try {
    row = await post("/v1/admin/camp/leader-code/check", { code: String(code ?? "") });
  } catch {
    return null;
  }
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  (await cookies()).set(COOKIE, `${row.id}.${expires}.${sign(`${row.id}.${expires}.${row.code_hash}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // "/": sent on commune…/leaders, and on old coordinator links so the proxy can send a leader across.
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  const actor = leaderActor(row.scope_kind, row.scope_value, row.holder_name);
  await batch("app", [
    auditStatement({ actor, campId: null, action: "leader.sign_in", entity: "leader_code", entityId: row.id }),
    ...accessStatements({ actor, role: "leader", event: "sign_in" }, await whereFrom()),
  ]);
  return { kind: row.scope_kind, value: row.scope_value };
}

export async function signOutLeader() {
  const jar = await cookies();
  const leader = await currentLeader();
  if (leader) {
    await batch("app", [
      auditStatement({ actor: leader.email, campId: null, action: "leader.sign_out", entity: "leader_code", entityId: leader.codeId }),
      ...accessStatements({ actor: leader.email, role: "leader", event: "sign_out" }, await whereFrom()),
    ]);
  }
  // One delete per name per response; an older copy kept at /admin/camp is cleared by the proxy.
  jar.delete({ name: COOKIE, path: "/" });
}

/**
 * The signed-in leader as camp staff, or null. Checked against the database
 * on every request, so a code that's turned off or replaced signs them out.
 */
export async function currentLeader(): Promise<(Staff & { codeId: string }) | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  const [id, expires, signature] = value?.split(".") ?? [];
  if (!id || !signature || !/^[0-9a-f-]{36}$/i.test(id) || !(Number(expires) > Date.now())) return null;
  const [row] = await query<{ scope_kind: ScopeKind; scope_value: string; holder_name: string | null; code_hash: string }>(
    "app",
    "SELECT scope_kind, scope_value, holder_name, code_hash FROM camp_leader_codes WHERE id = ? AND revoked_at IS NULL",
    [id],
  ).catch(() => []);
  if (!row || !same(signature, sign(`${id}.${expires}.${row.code_hash}`))) return null;
  return { email: leaderActor(row.scope_kind, row.scope_value, row.holder_name), role: "leader", scope_kind: row.scope_kind, scope_value: row.scope_value, codeId: id };
}
