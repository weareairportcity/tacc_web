import { after } from "next/server";
import { headers } from "next/headers";
import { batch, query } from "@/lib/cf";
import { checkId } from "./camps";
import { describeDevice, parseUserAgent } from "./device";
import { leaderName } from "./leaders";

/**
 * The sign-in log, who's online, and who came on which day (migration 0020).
 * Everything here is written after the reply has gone back (`after`), so
 * logging never makes anyone wait, and a failed write never fails what they
 * were doing. The hourly cron deletes entries older than 90 days.
 */

export type AccessRole = "attendee" | "leader" | "coordinator" | "admin" | "visitor";
export type AccessEvent = "sign_in" | "sign_in_failed" | "sign_out" | "lost_code" | "pay_start" | "feedback";
type Where = { place: string; device: string };

/** "Accra, GH" and "Android 15 · Chrome", from what Vercel and the browser say about this request. */
export async function whereFrom(): Promise<Where> {
  try {
    const h = await headers();
    const city = decodeURIComponent(h.get("x-vercel-ip-city") ?? "");
    const country = h.get("x-vercel-ip-country") ?? "";
    return { place: [city, country].filter(Boolean).join(", ").slice(0, 80), device: describeDevice(parseUserAgent(h.get("user-agent") ?? "")).slice(0, 80) };
  } catch {
    return { place: "", device: "" };
  }
}

/** Runs `fn` once the reply is sent; straight away outside a request (tests, scripts). Never throws. */
function later(fn: () => Promise<unknown>) {
  const safe = () => fn().catch((e) => console.error("camp log failed", e));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

export type AccessEntry = { actor: string; role: AccessRole; event: AccessEvent; campId?: string | null; ok?: boolean };

export function accessStatements(e: AccessEntry, where: Where) {
  const statements = [
    {
      sql: "INSERT INTO camp_access_log (actor, role, event, camp_id, ok, place, device) VALUES (?, ?, ?, ?, ?, ?, ?)",
      params: [e.actor.slice(0, 200), e.role, e.event, e.campId ?? null, e.ok === false ? 0 : 1, where.place, where.device],
    },
  ];
  const staff = e.role === "leader" || e.role === "coordinator" || e.role === "admin";
  if (staff && e.ok !== false && (e.event === "sign_in" || e.event === "sign_out")) {
    statements.push({
      sql: `INSERT INTO camp_presence (actor, role, camp_id, last_seen, signed_in_at, place, device) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (actor) DO UPDATE SET role = excluded.role, last_seen = excluded.last_seen,
              signed_in_at = excluded.signed_in_at, place = excluded.place, device = excluded.device`,
      params: [e.actor, e.role, e.campId ?? null, now(), e.event === "sign_in" ? now() : null, where.place, where.device],
    });
  }
  return statements;
}

/** Logs a sign-in, sign-out or other access event for this request. */
export async function noteAccess(e: AccessEntry) {
  const where = await whereFrom();
  later(() => batch("app", accessStatements(e, where)));
}

/**
 * A coordinator's or leader's Commune tab is open: they're online, and they came today. The
 * page calls this every few minutes while it's showing (Seen.tsx).
 */
export function presenceStatements(actor: string, role: AccessRole, campId: string | null, where: Where) {
  return [
    {
      sql: `INSERT INTO camp_presence (actor, role, camp_id, last_seen, place, device) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (actor) DO UPDATE SET role = excluded.role, camp_id = coalesce(excluded.camp_id, camp_presence.camp_id),
              last_seen = excluded.last_seen, place = excluded.place, device = excluded.device,
              signed_in_at = coalesce(camp_presence.signed_in_at, excluded.last_seen)`,
      params: [actor, role, campId, now(), where.place, where.device],
    },
    activeStatement(actor, role, campId),
  ];
}

/** "Came today", once per person per day. An ignored insert writes nothing. */
export const activeStatement = (actor: string, role: AccessRole, campId: string | null) => ({
  sql: "INSERT OR IGNORE INTO camp_active_days (day, actor, role, camp_id) VALUES (?, ?, ?, ?)",
  params: [today(), actor, role, campId],
});

export async function notePresence(actor: string, role: AccessRole, campId: string | null) {
  const where = await whereFrom();
  later(() => batch("app", presenceStatements(actor, role, campId, where)));
}

export function noteActive(actor: string, role: AccessRole, campId: string | null) {
  later(() => batch("app", [activeStatement(actor, role, campId)]));
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export type Presence = {
  actor: string;
  name: string;
  role: AccessRole;
  camp_id: string | null;
  camp_name: string | null;
  last_seen: string;
  signed_in_at: string | null;
  place: string;
  device: string;
};

export const staffName = (actor: string) => leaderName(actor) ?? actor;

/** Coordinators and leaders seen in the last 30 days, most recent first. */
export async function listPresence(): Promise<Presence[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rows = await query<Omit<Presence, "name">>(
    "app",
    `SELECT p.actor, p.role, p.camp_id, c.name AS camp_name, p.last_seen, p.signed_in_at, p.place, p.device
     FROM camp_presence p LEFT JOIN camps c ON c.id = p.camp_id WHERE p.last_seen >= ? ORDER BY p.last_seen DESC LIMIT 300`,
    [since],
  );
  return rows.map((r) => ({ ...r, name: staffName(r.actor) }));
}

export type LogKind = "sign-ins" | "changes";
export type LogFilters = { kind?: LogKind; role?: AccessRole; who?: string; camp?: string; days?: number; before?: string };
export type LogEntry = {
  key: string;
  kind: "access" | "change";
  created_at: string;
  actor: string;
  role: string;
  event: string;
  camp_id: string | null;
  camp_name: string | null;
  ok: number;
  place: string;
  device: string;
  person: string | null;
};

const PAGE = 60;
const ROLE_ACTOR: Record<AccessRole, string> = {
  attendee: "actor LIKE 'attendee:%'",
  leader: "actor LIKE 'leader:%'",
  // Changes don't record roles: coordinators and admins are the ones with an email.
  coordinator: "actor LIKE '%@%'",
  admin: "actor LIKE '%@%'",
  visitor: "actor = 'visitor'",
};

/**
 * Sign-ins (and other access events) and changes (the audit log), newest first, one page of
 * each merged. Each side walks its created_at index, so a page reads about 2 × PAGE rows.
 */
export async function listLogs(f: LogFilters): Promise<{ entries: LogEntry[]; next: string | null }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.who) {
    where.push("(actor = ? OR actor LIKE ?)");
    params.push(f.who, `%${f.who.replace(/[%_]/g, "")}%`);
  }
  if (f.camp) {
    where.push("camp_id = ?");
    params.push(checkId(f.camp, "camp"));
  }
  if (f.days) {
    where.push("created_at >= ?");
    params.push(new Date(Date.now() - f.days * 86_400_000).toISOString());
  }
  if (f.before) {
    where.push("created_at < ?");
    params.push(f.before);
  }
  const clause = (extra: string[]) => {
    const all = [...where, ...extra];
    return all.length ? `WHERE ${all.join(" AND ")}` : "";
  };
  const accessRole = f.role ? ["role = ?"] : [];
  // Leaders' sign-ins are in both logs; the sign-in log's copy says where and on what.
  const changeRole = [...(f.role ? [ROLE_ACTOR[f.role]] : []), "action NOT IN ('leader.sign_in', 'leader.sign_out')"];
  const [access, changes] = await Promise.all([
    f.kind === "changes"
      ? []
      : query<LogEntry>(
          "app",
          `SELECT 'a' || l.id AS key, 'access' AS kind, l.created_at, l.actor, l.role, l.event, l.camp_id, c.name AS camp_name, l.ok,
             l.place, l.device, (SELECT full_name FROM camp_registrations WHERE id = substr(l.actor, 10) AND l.actor LIKE 'attendee:%') AS person
           FROM (SELECT * FROM camp_access_log ${clause(accessRole)} ORDER BY created_at DESC LIMIT ${PAGE}) l
           LEFT JOIN camps c ON c.id = l.camp_id`,
          [...params, ...(f.role ? [f.role] : [])],
        ),
    f.kind === "sign-ins"
      ? []
      : query<LogEntry>(
          "app",
          `SELECT 'c' || l.id AS key, 'change' AS kind, l.created_at, l.actor, '' AS role, l.action AS event, l.camp_id, c.name AS camp_name,
             1 AS ok, '' AS place, '' AS device,
             COALESCE(
               (SELECT full_name FROM camp_registrations WHERE id = l.entity_id),
               (SELECT full_name FROM camp_registrations WHERE id = substr(l.actor, 10) AND l.actor LIKE 'attendee:%')
             ) AS person
           FROM (SELECT * FROM camp_audit_log ${clause(changeRole)} ORDER BY created_at DESC LIMIT ${PAGE}) l
           LEFT JOIN camps c ON c.id = l.camp_id`,
          params,
        ),
  ]);
  // The audit log's older rows were written without the trailing Z.
  const at = (e: LogEntry) => (e.created_at.endsWith("Z") ? e.created_at : `${e.created_at}Z`);
  const merged = [...access, ...changes].sort((a, b) => at(b).localeCompare(at(a)));
  // Only as far as both sides have been read, so nothing is skipped on the next page.
  const full = [access, changes].filter((side) => side.length === PAGE);
  const cut = full.length ? full.map((side) => at(side.at(-1)!)).sort().at(-1)! : null;
  const entries = cut ? merged.filter((e) => at(e) >= cut) : merged;
  return { entries, next: cut ? entries.at(-1)!.created_at : null };
}

/** Words for the access events, next to History's words for changes. */
export const ACCESS_WORDS: Record<AccessEvent, string> = {
  sign_in: "signed in",
  sign_in_failed: "tried to sign in",
  sign_out: "signed out",
  lost_code: "asked for their code again",
  pay_start: "opened a payment",
  feedback: "sent feedback",
};
