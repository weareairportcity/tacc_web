import { query } from "@/lib/cf";
import { listRoomsWithOccupants } from "./assignments";
import { checkId } from "./camps";

/**
 * Each room's key bearer: the person who made the room (when they're in it),
 * otherwise the first person put in it. Rooms opened at check-in have no
 * maker, so their first person holds the key. Worked out from the rooms and
 * the log of who made them; nothing extra is stored.
 */

export type Person = { registration_id: string; full_name: string; fellowship: string; phone: string; checked_in: boolean };

export type KeyBearer = {
  room_id: string;
  label: string;
  room_type_name: string;
  gender: "male" | "female";
  capacity: number;
  occupied: number;
  bearer: Person;
  /** Everyone in the room, in the order they were put in it. */
  occupants: Person[];
  /** "made" the room, or was "first" in it. */
  why: "made" | "first";
};

export async function listKeyBearers(campId: string): Promise<{ rows: KeyBearer[]; empty: number }> {
  checkId(campId, "camp");
  const [rooms, makers, phones] = await Promise.all([
    listRoomsWithOccupants(campId),
    query<{ entity_id: string; actor: string }>("app", "SELECT entity_id, actor FROM camp_audit_log WHERE camp_id = ? AND action = 'room.create'", [campId]),
    query<{ id: string; phone: string }>(
      "app",
      "SELECT r.id, r.phone FROM camp_registrations r WHERE r.camp_id = ? AND r.id IN (SELECT registration_id FROM camp_room_assignments)",
      [campId],
    ),
  ]);
  const maker = new Map(makers.map((m) => [m.entity_id, m.actor.startsWith("attendee:") ? m.actor.slice("attendee:".length) : null]));
  const phone = new Map(phones.map((p) => [p.id, p.phone]));
  const rows: KeyBearer[] = [];
  let empty = 0;
  for (const room of rooms) {
    if (!room.occupants.length) {
      empty++;
      continue;
    }
    // Occupants come in the order they were put in the room.
    const made = room.occupants.find((o) => o.registration_id === maker.get(room.id));
    const who = made ?? room.occupants[0];
    const person = (o: (typeof room.occupants)[number]): Person => ({ registration_id: o.registration_id, full_name: o.full_name, fellowship: o.fellowship, phone: phone.get(o.registration_id) ?? "", checked_in: Boolean(o.checked_in) });
    rows.push({
      room_id: room.id,
      label: room.label,
      room_type_name: room.room_type_name,
      gender: room.gender,
      capacity: room.capacity,
      occupied: room.occupied,
      bearer: person(who),
      occupants: room.occupants.map(person),
      why: made ? "made" : "first",
    });
  }
  return { rows, empty };
}
