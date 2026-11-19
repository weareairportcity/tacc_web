import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { batch, post, query } from "@/lib/cf";
import { FELLOWSHIPS, GROUPS, PFCCS, isGroup } from "@/lib/fellowships";
import { MEDICAL_TEAM, cleanHolder, leaderActor, leaderName } from "./leader-name";
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
/** Other codes signed in on this phone ("Add another account"), each still signed, joined by "~". */
const OTHERS = "camp_leaders";
const MAX_OTHERS = 6;
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  // "/": sent on commune…/leaders, and on old coordinator links so the proxy can send a leader across.
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
const idOf = (value: string) => value.split(".")[0];

export { leaderActor, leaderName } from "./leader-name";

const sign = (payload: string) => createHmac("sha256", campSecret()).update(`leader-session.${payload}`).digest("base64url");
const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** The shared codes: one per fellowship and one per PFCC. (Group Leaders' codes are per person.) */
export function leaderScopes(): { kind: "fellowship" | "pfcc"; value: string }[] {
  return [...FELLOWSHIPS.map((f) => ({ kind: "fellowship" as const, value: f.name })), ...PFCCS.map((p) => ({ kind: "pfcc" as const, value: p }))];
}

export const leaderGroups = () => [...GROUPS];

const validScope = (kind: string, value: string) =>
  kind === "medical" ? value === MEDICAL_TEAM : kind === "group" ? isGroup(value) : leaderScopes().some((s) => s.kind === kind && s.value === value);

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
  const jar = await cookies();
  // Already signed in with another code: keep it on this phone, to switch back to.
  const before = jar.get(COOKIE)?.value;
  const others = readOthers(jar.get(OTHERS)?.value).filter((v) => idOf(v) !== row.id);
  if (before && idOf(before) !== row.id) others.unshift(before);
  writeOthers(jar, others);
  jar.set(COOKIE, `${row.id}.${expires}.${sign(`${row.id}.${expires}.${row.code_hash}`)}`, cookieOptions);
  const actor = leaderActor(row.scope_kind, row.scope_value, row.holder_name);
  await batch("app", [
    auditStatement({ actor, campId: null, action: "leader.sign_in", entity: "leader_code", entityId: row.id }),
    ...accessStatements({ actor, role: "leader", event: "sign_in" }, await whereFrom()),
  ]);
  return { kind: row.scope_kind, value: row.scope_value };
}

export async function signOutLeader() {
  const jar = await cookies();
  const leader = await checkSession(jar.get(COOKIE)?.value);
  if (leader) {
    await batch("app", [
      auditStatement({ actor: leader.email, campId: null, action: "leader.sign_out", entity: "leader_code", entityId: leader.codeId }),
      ...accessStatements({ actor: leader.email, role: "leader", event: "sign_out" }, await whereFrom()),
    ]);
  }
  // Another account on this phone takes over; otherwise signed out.
  const others = readOthers(jar.get(OTHERS)?.value);
  const [next, ...rest] = others;
  if (next) {
    jar.set(COOKIE, next, cookieOptions);
    writeOthers(jar, rest);
    return leader;
  }
  // One delete per name per response; an older copy kept at /admin/camp is cleared by the proxy.
  jar.delete({ name: COOKIE, path: "/" });
  return leader;
}

function readOthers(raw: string | undefined) {
  return (raw ?? "")
    .split("~")
    .filter((v) => /^[0-9a-f-]{36}\.\d+\.[A-Za-z0-9_-]+$/i.test(v))
    .slice(0, MAX_OTHERS);
}

function writeOthers(jar: Awaited<ReturnType<typeof cookies>>, list: string[]) {
  const seen = new Set<string>();
  const kept = list.filter((v) => !seen.has(idOf(v)) && seen.add(idOf(v))).slice(0, MAX_OTHERS);
  if (kept.length) jar.set(OTHERS, kept.join("~"), cookieOptions);
  else jar.delete({ name: OTHERS, path: "/" });
}

export type LeaderAccount = { id: string; name: string; active: boolean };

/** Every code signed in on this phone (the one in use first), checked against the database. */
export async function leaderAccounts(): Promise<LeaderAccount[]> {
  const jar = await cookies();
  const values = [jar.get(COOKIE)?.value, ...readOthers(jar.get(OTHERS)?.value)].filter((v): v is string => !!v);
  const checked = await Promise.all(values.map((v) => checkSession(v)));
  return checked.flatMap((l, i) => (l ? [{ id: l.codeId, name: leaderName(l.email) ?? l.scope_value ?? "Leader", active: i === 0 }] : []));
}

/** Switches to another code signed in on this phone. False if it isn't one, or has been turned off. */
export async function switchLeader(codeId: string) {
  const jar = await cookies();
  const others = readOthers(jar.get(OTHERS)?.value);
  const target = others.find((v) => idOf(v) === codeId);
  if (!target || !(await checkSession(target))) return false;
  const current = jar.get(COOKIE)?.value;
  writeOthers(jar, [...(current ? [current] : []), ...others.filter((v) => v !== target)]);
  jar.set(COOKIE, target, cookieOptions);
  return true;
}

/**
 * The signed-in leader as camp staff, or null. Checked against the database
 * on every request, so a code that's turned off or replaced signs them out.
 */
export async function currentLeader(): Promise<(Staff & { codeId: string }) | null> {
  return checkSession((await cookies()).get(COOKIE)?.value);
}

async function checkSession(value: string | undefined): Promise<(Staff & { codeId: string }) | null> {
  const [id, expires, signature] = value?.split(".") ?? [];
  if (!id || !signature || !/^[0-9a-f-]{36}$/i.test(id) || !(Number(expires) > Date.now())) return null;
  const [row] = await query<{ scope_kind: ScopeKind; scope_value: string; holder_name: string | null; code_hash: string }>(
    "app",
    "SELECT scope_kind, scope_value, holder_name, code_hash FROM camp_leader_codes WHERE id = ? AND revoked_at IS NULL",
    [id],
  ).catch(() => []);
  if (!row || !same(signature, sign(`${id}.${expires}.${row.code_hash}`))) return null;
  // The medical team's code is its own role: none of the leaders' pages or actions, only the medical search.
  const role = row.scope_kind === "medical" ? "medical" : "leader";
  return { email: leaderActor(row.scope_kind, row.scope_value, row.holder_name), role, scope_kind: row.scope_kind, scope_value: row.scope_value, codeId: id };
}
