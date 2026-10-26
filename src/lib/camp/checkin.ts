import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { CampError, type RegistrationStatus } from "./types";

/**
 * Arriving at camp. A coordinator scans the QR on the attendee's pass (a
 * signed link, see tokens.ts) or finds them by name, and checks them in.
 * Checking in twice is harmless; Undo clears it.
 */

export type Arrival = {
  id: string;
  camp_id: string;
  full_name: string;
  fellowship: string;
  status: RegistrationStatus;
  price_pesewas: number;
  paid_pesewas: number;
  room_type_name: string;
  room_label: string | null;
  roommates: string | null;
  health_notes: string;
  checked_in_at: string | null;
};

const SELECT = `SELECT r.id, r.camp_id, r.full_name, r.fellowship, r.status, r.price_pesewas, r.paid_pesewas, t.name AS room_type_name,
    x.label AS room_label, r.health_notes, r.checked_in_at,
    (SELECT group_concat(o.full_name, ', ') FROM camp_room_assignments b JOIN camp_registrations o ON o.id = b.registration_id
       WHERE b.room_id = a.room_id AND b.registration_id <> r.id) AS roommates
  FROM camp_registrations r
  JOIN camp_room_types t ON t.id = r.room_type_id
  LEFT JOIN camp_room_assignments a ON a.registration_id = r.id
  LEFT JOIN camp_rooms x ON x.id = a.room_id`;

export async function getArrival(registrationId: string): Promise<Arrival | null> {
  const [row] = await query<Arrival>("app", `${SELECT} WHERE r.id = ?`, [checkId(registrationId, "registration")]);
  return row ?? null;
}

export async function checkIn(actor: string, campId: string, registrationId: string) {
  const person = await getArrival(registrationId);
  if (!person || person.camp_id !== campId) throw new CampError("That pass isn't for this camp.");
  if (person.status === "cancelled") throw new CampError(`${person.full_name}'s registration is cancelled.`);
  if (person.checked_in_at) return { person, already: true };
  await batch("app", [
    {
      sql: "UPDATE camp_registrations SET checked_in_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), checked_in_by = ? WHERE id = ? AND checked_in_at IS NULL",
      params: [actor, person.id],
    },
    auditStatement({ actor, campId, action: "registration.check_in", entity: "registration", entityId: person.id, ifChanged: true }),
  ]);
  return { person: (await getArrival(person.id))!, already: false };
}

export async function undoCheckIn(actor: string, campId: string, registrationId: string) {
  const person = await getArrival(registrationId);
  if (!person || person.camp_id !== campId) throw new CampError("Unknown person.");
  await batch("app", [
    { sql: "UPDATE camp_registrations SET checked_in_at = NULL, checked_in_by = NULL WHERE id = ?", params: [person.id] },
    auditStatement({ actor, campId, action: "registration.check_in_undo", entity: "registration", entityId: person.id, ifChanged: true }),
  ]);
}

export async function arrivalCounts(campId: string) {
  const [row] = await query<{ here: number; expected: number }>(
    "app",
    `SELECT COALESCE(SUM(checked_in_at IS NOT NULL), 0) AS here, COALESCE(SUM(status <> 'cancelled'), 0) AS expected
     FROM camp_registrations WHERE camp_id = ?`,
    [checkId(campId, "camp")],
  );
  return row ?? { here: 0, expected: 0 };
}

export function recentArrivals(campId: string, limit = 12) {
  return query<Arrival>("app", `${SELECT} WHERE r.camp_id = ? AND r.checked_in_at IS NOT NULL ORDER BY r.checked_in_at DESC LIMIT ?`, [
    checkId(campId, "camp"),
    limit,
  ]);
}

/** "Find them by name" when there's no QR. */
export function findArrivals(campId: string, term: string) {
  const q = String(term ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (q.length < 2) return Promise.resolve([] as Arrival[]);
  return query<Arrival>(
    "app",
    `${SELECT} WHERE r.camp_id = ? AND r.status <> 'cancelled' AND r.full_name LIKE ? ESCAPE '\\' ORDER BY r.full_name LIMIT 8`,
    [checkId(campId, "camp"), `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`],
  );
}
