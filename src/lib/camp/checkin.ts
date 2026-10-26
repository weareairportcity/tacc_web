import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import type { Scope } from "./reports";
import { CampError, type RegistrationStatus } from "./types";

/**
 * Arriving at camp, and collecting the camp T-shirt. Someone scans the QR on
 * the attendee's pass (a signed link, see tokens.ts) or finds them by name.
 * Coordinators can do it for anyone; a fellowship or PFCC leader only for
 * their own people. Doing it twice is harmless; Undo clears it.
 */

export type ScanMode = "checkin" | "shirt";

export type Arrival = {
  id: string;
  camp_id: string;
  full_name: string;
  fellowship: string;
  pfcc: string;
  status: RegistrationStatus;
  price_pesewas: number;
  paid_pesewas: number;
  room_type_name: string;
  room_label: string | null;
  roommates: string | null;
  health_notes: string;
  checked_in_at: string | null;
  shirt_size: string;
  shirt_given_at: string | null;
};

const SELECT = `SELECT r.id, r.camp_id, r.full_name, r.fellowship, r.pfcc, r.status, r.price_pesewas, r.paid_pesewas, t.name AS room_type_name,
    x.label AS room_label, r.health_notes, r.checked_in_at, r.shirt_size, r.shirt_given_at,
    (SELECT group_concat(o.full_name, ', ') FROM camp_room_assignments b JOIN camp_registrations o ON o.id = b.registration_id
       WHERE b.room_id = a.room_id AND b.registration_id <> r.id) AS roommates
  FROM camp_registrations r
  JOIN camp_room_types t ON t.id = r.room_type_id
  LEFT JOIN camp_room_assignments a ON a.registration_id = r.id
  LEFT JOIN camp_rooms x ON x.id = a.room_id`;

const ALL: Scope = { kind: "all" };

function scopeSql(scope: Scope) {
  if (scope.kind === "all") return { sql: "", params: [] as unknown[] };
  return { sql: ` AND r.${scope.kind} = ?`, params: [scope.value] as unknown[] };
}

const inScope = (p: Arrival, scope: Scope) => scope.kind === "all" || (scope.kind === "fellowship" ? p.fellowship === scope.value : p.pfcc === scope.value);

/** Leaders see who someone is and what they owe, never health notes or who they share with. */
export function forViewer(p: Arrival, scope: Scope): Arrival {
  return scope.kind === "all" ? p : { ...p, health_notes: "", roommates: null };
}

export async function getArrival(registrationId: string): Promise<Arrival | null> {
  const [row] = await query<Arrival>("app", `${SELECT} WHERE r.id = ?`, [checkId(registrationId, "registration")]);
  return row ?? null;
}

async function personFor(campId: string, registrationId: string, scope: Scope) {
  const person = await getArrival(registrationId);
  if (!person || person.camp_id !== campId) throw new CampError("That pass isn't for this camp.");
  if (scope.kind !== "all" && !inScope(person, scope)) throw new CampError(`${person.full_name} isn't in ${scope.value}.`);
  return person;
}

const COLUMNS = { checkin: ["checked_in_at", "checked_in_by"], shirt: ["shirt_given_at", "shirt_given_by"] } as const;
const ACTIONS = { checkin: "registration.check_in", shirt: "registration.shirt_given" } as const;

/** Checks someone in, or marks their T-shirt given. `already` when it was done before. */
export async function markScan(actor: string, campId: string, registrationId: string, mode: ScanMode, scope: Scope = ALL) {
  const person = await personFor(campId, registrationId, scope);
  if (person.status === "cancelled") throw new CampError(`${person.full_name}'s registration is cancelled.`);
  const done = mode === "checkin" ? person.checked_in_at : person.shirt_given_at;
  if (done) return { person: forViewer(person, scope), already: true };
  const [at, by] = COLUMNS[mode];
  await batch("app", [
    {
      sql: `UPDATE camp_registrations SET ${at} = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ${by} = ? WHERE id = ? AND ${at} IS NULL`,
      params: [actor, person.id],
    },
    auditStatement({ actor, campId, action: ACTIONS[mode], entity: "registration", entityId: person.id, after: mode === "shirt" ? { size: person.shirt_size } : undefined, ifChanged: true }),
  ]);
  return { person: forViewer((await getArrival(person.id))!, scope), already: false };
}

export async function undoScan(actor: string, campId: string, registrationId: string, mode: ScanMode, scope: Scope = ALL) {
  const person = await personFor(campId, registrationId, scope);
  const [at, by] = COLUMNS[mode];
  await batch("app", [
    { sql: `UPDATE camp_registrations SET ${at} = NULL, ${by} = NULL WHERE id = ?`, params: [person.id] },
    auditStatement({ actor, campId, action: `${ACTIONS[mode]}_undo`, entity: "registration", entityId: person.id, ifChanged: true }),
  ]);
}

// The names the rest of the app already uses.
export const checkIn = (actor: string, campId: string, id: string, scope: Scope = ALL) => markScan(actor, campId, id, "checkin", scope);
export const undoCheckIn = (actor: string, campId: string, id: string, scope: Scope = ALL) => undoScan(actor, campId, id, "checkin", scope);

export type ScanCounts = {
  here: number;
  expected: number;
  shirts: number;
  /** Per T-shirt size: how many given, of how many asked for. "" is no size given. */
  sizes: { size: string; given: number; total: number }[];
};

export async function arrivalCounts(campId: string, scope: Scope = ALL): Promise<ScanCounts> {
  const s = scopeSql(scope);
  const [[row], sizes] = await Promise.all([
    query<{ here: number; expected: number; shirts: number }>(
      "app",
      `SELECT COALESCE(SUM(r.checked_in_at IS NOT NULL), 0) AS here, COALESCE(SUM(r.status <> 'cancelled'), 0) AS expected,
              COALESCE(SUM(r.shirt_given_at IS NOT NULL), 0) AS shirts
       FROM camp_registrations r WHERE r.camp_id = ?${s.sql}`,
      [checkId(campId, "camp"), ...s.params],
    ),
    query<{ size: string; given: number; total: number }>(
      "app",
      `SELECT r.shirt_size AS size, SUM(r.shirt_given_at IS NOT NULL) AS given, COUNT(*) AS total
       FROM camp_registrations r WHERE r.camp_id = ?${s.sql} AND r.status <> 'cancelled' GROUP BY r.shirt_size`,
      [campId, ...s.params],
    ),
  ]);
  const order = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", ""];
  return { ...(row ?? { here: 0, expected: 0, shirts: 0 }), sizes: sizes.sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size)) };
}

export async function recentArrivals(campId: string, mode: ScanMode = "checkin", scope: Scope = ALL, limit = 12) {
  const s = scopeSql(scope);
  const at = mode === "checkin" ? "r.checked_in_at" : "r.shirt_given_at";
  const rows = await query<Arrival>("app", `${SELECT} WHERE r.camp_id = ?${s.sql} AND ${at} IS NOT NULL ORDER BY ${at} DESC LIMIT ?`, [
    checkId(campId, "camp"),
    ...s.params,
    limit,
  ]);
  return rows.map((p) => forViewer(p, scope));
}

/** "Find them by name" when there's no QR. */
export async function findArrivals(campId: string, term: string, scope: Scope = ALL) {
  const q = String(term ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (q.length < 2) return [] as Arrival[];
  const s = scopeSql(scope);
  const rows = await query<Arrival>(
    "app",
    `${SELECT} WHERE r.camp_id = ?${s.sql} AND r.status <> 'cancelled' AND r.full_name LIKE ? ESCAPE '\\' ORDER BY r.full_name LIMIT 8`,
    [checkId(campId, "camp"), ...s.params, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`],
  );
  return rows.map((p) => forViewer(p, scope));
}
