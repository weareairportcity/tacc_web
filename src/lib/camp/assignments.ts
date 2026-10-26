import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { groupState } from "./groups";
import {
  CampError,
  type Gender,
  type GroupMember,
  type MyRoom,
  type Occupant,
  type Pool,
  type Registration,
  type RoomWithOccupants,
  type WaitingGroup,
  type WaitingPerson,
} from "./types";

/**
 * Room assignment. As with groups, D1 has no row locks, so each placement is
 * one guarded INSERT … SELECT: the WHERE clause holds the rules (same camp,
 * gender and room type, Fully Paid, not placed, beds free) and the database
 * applies it atomically, so two coordinators can't overfill a room. Migration
 * 0007's triggers repeat the rules. Callers must have checked the camp role.
 */

type RoomRow = { id: string; camp_id: string; label: string; gender: Gender; room_type_id: string; capacity: number };

async function getRoomRow(roomId: string) {
  const [room] = await query<RoomRow & { occupied: number }>(
    "app",
    `SELECT x.id, x.camp_id, x.label, x.gender, x.room_type_id, x.capacity,
       (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id) AS occupied
     FROM camp_rooms x WHERE x.id = ?`,
    [checkId(roomId, "room")],
  );
  if (!room) throw new CampError("Unknown room.");
  return room;
}

const roomOf = async (registrationId: string) =>
  (
    await query<{ label: string; room_id: string }>(
      "app",
      `SELECT x.label, a.room_id FROM camp_room_assignments a JOIN camp_rooms x ON x.id = a.room_id
       WHERE a.registration_id = ?`,
      [registrationId],
    )
  )[0] ?? null;

const beds = (n: number) => `${n} free bed${n === 1 ? "" : "s"}`;

/** A partly filled room is fine, but worth pointing out. */
async function fillWarning(roomId: string) {
  const room = await getRoomRow(roomId);
  const free = room.capacity - room.occupied;
  return free > 0 ? `${room.label} has ${beds(free)}. Top it up from the unmatched list.` : null;
}

function mismatch(room: RoomRow, person: Pick<Registration, "camp_id" | "gender" | "room_type_id" | "room_type_name">) {
  if (person.camp_id !== room.camp_id) return "That person isn't registered for this camp.";
  if (person.gender !== room.gender) return `${room.label} is a ${room.gender === "male" ? "men's" : "women's"} room.`;
  if (person.room_type_id !== room.room_type_id) return `${room.label} isn't a ${person.room_type_name} room.`;
  return null;
}

// ─── Placing people ──────────────────────────────────────────────────────────

/** Places one person. Returns a warning if the room still has free beds. */
export async function assignPerson(actor: string, roomId: string, registrationId: string) {
  const room = await getRoomRow(roomId);
  const results = await batch("app", [
    {
      sql: `INSERT INTO camp_room_assignments (room_id, registration_id, assigned_by)
            SELECT x.id, r.id, ? FROM camp_rooms x JOIN camp_registrations r ON r.id = ?
            WHERE x.id = ?
              AND r.camp_id = x.camp_id AND r.gender = x.gender AND r.room_type_id = x.room_type_id
              AND r.status = 'fully_paid'
              AND NOT EXISTS (SELECT 1 FROM camp_room_assignments a WHERE a.registration_id = r.id)
              AND (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id) < x.capacity
            RETURNING registration_id`,
      params: [actor, checkId(registrationId, "registration"), room.id],
    },
    auditStatement({
      actor,
      campId: room.camp_id,
      action: "room.assign",
      entity: "room",
      entityId: room.id,
      after: { registration_id: registrationId },
      ifChanged: true,
    }),
  ]);
  if (!results[0].results.length) throw await explainPerson(room, registrationId);
  return { warning: await fillWarning(room.id), placed: [registrationId], room: room.label };
}

async function explainPerson(room: RoomRow, registrationId: string): Promise<CampError> {
  const [person] = await query<Registration>(
    "app",
    `SELECT r.id, r.camp_id, r.full_name, r.gender, r.room_type_id, t.name AS room_type_name, r.status
     FROM camp_registrations r JOIN camp_room_types t ON t.id = r.room_type_id WHERE r.id = ?`,
    [registrationId],
  );
  if (!person) return new CampError("Unknown registration.");
  const wrong = mismatch(room, person);
  if (wrong) return new CampError(wrong);
  if (person.status !== "fully_paid") return new CampError(`${person.full_name} isn't fully paid.`);
  const placed = await roomOf(person.id);
  if (placed) return new CampError(`${person.full_name} is already in ${placed.label}. Remove them first.`);
  const now = await getRoomRow(room.id);
  if (now.occupied >= now.capacity) return new CampError(`${room.label} is full.`);
  return new CampError("That didn't work. Please refresh and try again.");
}

/**
 * Places every unplaced member of a group in one statement, only if they all
 * fit, so a group is never split by accident. Members already in this room
 * are skipped; a member in another room blocks it.
 */
export async function assignGroup(actor: string, roomId: string, groupId: string) {
  const room = await getRoomRow(roomId);
  const members = await query<{ registration_id: string; full_name: string; room_id: string | null; room_label: string | null }>(
    "app",
    `SELECT m.registration_id, r.full_name, a.room_id, x.label AS room_label
     FROM camp_group_members m JOIN camp_registrations r ON r.id = m.registration_id
     LEFT JOIN camp_room_assignments a ON a.registration_id = m.registration_id
     LEFT JOIN camp_rooms x ON x.id = a.room_id
     WHERE m.group_id = ? ORDER BY m.joined_at`,
    [checkId(groupId, "group")],
  );
  if (!members.length) throw new CampError("That group no longer exists.");
  const elsewhere = members.find((m) => m.room_id && m.room_id !== room.id);
  if (elsewhere) throw new CampError(`${elsewhere.full_name} is already in ${elsewhere.room_label}. Move or remove them first.`);
  const toPlace = members.filter((m) => !m.room_id).length;
  if (!toPlace) throw new CampError(`Everyone in this group is already in ${room.label}.`);

  const results = await batch("app", [
    {
      sql: `INSERT INTO camp_room_assignments (room_id, registration_id, assigned_by)
            SELECT x.id, r.id, ? FROM camp_rooms x
            JOIN camp_group_members m ON m.group_id = ?
            JOIN camp_registrations r ON r.id = m.registration_id
            WHERE x.id = ?
              AND r.camp_id = x.camp_id AND r.gender = x.gender AND r.room_type_id = x.room_type_id
              AND r.status = 'fully_paid'
              AND NOT EXISTS (SELECT 1 FROM camp_room_assignments a WHERE a.registration_id = r.id)
              AND NOT EXISTS (
                SELECT 1 FROM camp_group_members m2 JOIN camp_room_assignments a ON a.registration_id = m2.registration_id
                WHERE m2.group_id = m.group_id AND a.room_id <> x.id)
              AND (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id)
                + (SELECT COUNT(*) FROM camp_group_members m3 WHERE m3.group_id = m.group_id
                     AND NOT EXISTS (SELECT 1 FROM camp_room_assignments a WHERE a.registration_id = m3.registration_id))
                <= x.capacity
            RETURNING registration_id`,
      params: [actor, groupId, room.id],
    },
    auditStatement({
      actor,
      campId: room.camp_id,
      action: "room.assign_group",
      entity: "room",
      entityId: room.id,
      after: { group_id: groupId },
      ifChanged: true,
    }),
  ]);
  if (!results[0].results.length) throw await explainGroup(room, groupId, toPlace);

  const warnings = [await fillWarning(room.id)];
  const [group] = await query<{ locked_at: string | null; roommate_deadline_on: string }>(
    "app",
    "SELECT g.locked_at, c.roommate_deadline_on FROM camp_groups g JOIN camps c ON c.id = g.camp_id WHERE g.id = ?",
    [groupId],
  );
  if (group && groupState(group) === "open") warnings.push("This group is still open, so its members may change.");
  const placed = (results[0].results as { registration_id: string }[]).map((r) => r.registration_id);
  return { warning: warnings.filter(Boolean).join(" ") || null, placed, room: room.label };
}

async function explainGroup(room: RoomRow, groupId: string, toPlace: number): Promise<CampError> {
  const [group] = await query<{ camp_id: string; gender: Gender; room_type_id: string; room_type_name: string }>(
    "app",
    `SELECT g.camp_id, g.gender, g.room_type_id, t.name AS room_type_name
     FROM camp_groups g JOIN camp_room_types t ON t.id = g.room_type_id WHERE g.id = ?`,
    [groupId],
  );
  if (!group) return new CampError("That group no longer exists.");
  const wrong = mismatch(room, group);
  if (wrong) return new CampError(wrong);
  const now = await getRoomRow(room.id);
  const free = now.capacity - now.occupied;
  if (free < toPlace) return new CampError(`${room.label} has ${beds(free)}; this group needs ${toPlace}.`);
  return new CampError("The group or room changed. Please refresh and try again.");
}

/** Undo for a placement: takes these people out of their rooms again. */
export async function unassignMany(actor: string, registrationIds: string[]) {
  for (const id of registrationIds.slice(0, 50)) await unassign(actor, id).catch(() => null);
}

/** Takes someone out of their room. Their roommate group is unchanged. */
export async function unassign(actor: string, registrationId: string) {
  const placed = await roomOf(checkId(registrationId, "registration"));
  if (!placed) throw new CampError("That person isn't in a room.");
  const room = await getRoomRow(placed.room_id);
  await batch("app", [
    { sql: "DELETE FROM camp_room_assignments WHERE registration_id = ?", params: [registrationId] },
    auditStatement({
      actor,
      campId: room.camp_id,
      action: "room.unassign",
      entity: "room",
      entityId: room.id,
      before: { registration_id: registrationId },
      ifChanged: true,
    }),
  ]);
}

/** For a cancellation or room-type change: frees the person's bed, in the same batch. */
export function roomStatementsForRemoval(actor: string, registration: Registration, reason: string) {
  return [
    {
      sql: "DELETE FROM camp_room_assignments WHERE registration_id = ? RETURNING room_id",
      params: [registration.id],
    },
    auditStatement({
      actor,
      campId: registration.camp_id,
      action: "room.unassign",
      entity: "registration",
      entityId: registration.id,
      before: { reason },
      ifChanged: true,
    }),
  ];
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** Every gender and room type that has Fully Paid people or rooms, with counts. */
export async function listPools(campId: string): Promise<Pool[]> {
  return query<Pool>(
    "app",
    `WITH combos AS (
       SELECT room_type_id, gender FROM camp_registrations WHERE camp_id = ?1 AND status = 'fully_paid'
       UNION SELECT room_type_id, gender FROM camp_rooms WHERE camp_id = ?1)
     SELECT k.room_type_id, t.name AS room_type_name, k.gender,
       (SELECT COUNT(*) FROM camp_registrations r WHERE r.camp_id = ?1 AND r.room_type_id = k.room_type_id
          AND r.gender = k.gender AND r.status = 'fully_paid') AS fully_paid,
       (SELECT COUNT(*) FROM camp_room_assignments a JOIN camp_rooms x ON x.id = a.room_id
          WHERE x.camp_id = ?1 AND x.room_type_id = k.room_type_id AND x.gender = k.gender) AS assigned,
       (SELECT COALESCE(SUM(capacity), 0) FROM camp_rooms x WHERE x.camp_id = ?1
          AND x.room_type_id = k.room_type_id AND x.gender = k.gender) AS beds
     FROM combos k JOIN camp_room_types t ON t.id = k.room_type_id
     ORDER BY t.price_pesewas, t.name, k.gender`,
    [checkId(campId, "camp")],
  );
}

/** Everything the assign page needs for one pool. */
export async function getPoolBoard(campId: string, roomTypeId: string, gender: Gender) {
  checkId(campId, "camp");
  checkId(roomTypeId, "room type");
  const args = [campId, roomTypeId, gender];
  const [rooms, occupants, groupRows, people] = await Promise.all([
    query<RoomWithOccupants>(
      "app",
      `SELECT x.id, x.camp_id, x.room_type_id, t.name AS room_type_name, x.label, x.gender, x.capacity,
         (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id) AS occupied
       FROM camp_rooms x JOIN camp_room_types t ON t.id = x.room_type_id
       WHERE x.camp_id = ? AND x.room_type_id = ? AND x.gender = ? ORDER BY x.label`,
      args,
    ),
    query<Occupant & { room_id: string }>(
      "app",
      `SELECT a.room_id, r.id AS registration_id, r.full_name, r.fellowship, g.code AS group_code,
         r.checked_in_at IS NOT NULL AS checked_in
       FROM camp_room_assignments a
       JOIN camp_rooms x ON x.id = a.room_id
       JOIN camp_registrations r ON r.id = a.registration_id
       LEFT JOIN camp_group_members m ON m.registration_id = r.id
       LEFT JOIN camp_groups g ON g.id = m.group_id
       WHERE x.camp_id = ? AND x.room_type_id = ? AND x.gender = ? ORDER BY a.assigned_at`,
      args,
    ),
    // Groups with at least one member still to place.
    query<GroupMember & { group_id: string; code: string; locked_at: string | null; capacity: number;
      roommate_deadline_on: string; room_label: string | null }>(
      "app",
      `SELECT g.id AS group_id, g.code, g.locked_at, t.capacity, c.roommate_deadline_on,
         m.registration_id, r.full_name, r.fellowship, m.joined_at, x.label AS room_label
       FROM camp_groups g
       JOIN camps c ON c.id = g.camp_id
       JOIN camp_room_types t ON t.id = g.room_type_id
       JOIN camp_group_members m ON m.group_id = g.id
       JOIN camp_registrations r ON r.id = m.registration_id
       LEFT JOIN camp_room_assignments a ON a.registration_id = m.registration_id
       LEFT JOIN camp_rooms x ON x.id = a.room_id
       WHERE g.camp_id = ? AND g.room_type_id = ? AND g.gender = ?
         AND EXISTS (SELECT 1 FROM camp_group_members m2 WHERE m2.group_id = g.id
                     AND NOT EXISTS (SELECT 1 FROM camp_room_assignments a2 WHERE a2.registration_id = m2.registration_id))
       ORDER BY g.created_at, m.joined_at`,
      args,
    ),
    // Fully Paid, in no group, in no room.
    query<WaitingPerson>(
      "app",
      `SELECT r.id, r.full_name, r.fellowship, r.any_room FROM camp_registrations r
       WHERE r.camp_id = ? AND r.room_type_id = ? AND r.gender = ? AND r.status = 'fully_paid'
         AND NOT EXISTS (SELECT 1 FROM camp_group_members m WHERE m.registration_id = r.id)
         AND NOT EXISTS (SELECT 1 FROM camp_room_assignments a WHERE a.registration_id = r.id)
       ORDER BY r.any_room DESC, r.full_name`,
      args,
    ),
  ]);

  for (const room of rooms) room.occupants = occupants.filter((o) => o.room_id === room.id);
  const groups = new Map<string, WaitingGroup>();
  for (const row of groupRows) {
    const group = groups.get(row.group_id) ?? {
      id: row.group_id,
      code: row.code,
      state: groupState(row),
      capacity: row.capacity,
      members: [],
    };
    group.members.push({
      registration_id: row.registration_id,
      full_name: row.full_name,
      fellowship: row.fellowship,
      joined_at: row.joined_at,
      room_label: row.room_label,
    });
    groups.set(row.group_id, group);
  }
  return { rooms, groups: [...groups.values()], people };
}

/** The attendee's own room and the first names of the people sharing it. */
export async function getMyRoom(registrationId: string): Promise<MyRoom | null> {
  const rows = await query<{ label: string; room_type_name: string; full_name: string | null }>(
    "app",
    `SELECT x.label, t.name AS room_type_name, other.full_name
     FROM camp_room_assignments a
     JOIN camp_rooms x ON x.id = a.room_id
     JOIN camp_room_types t ON t.id = x.room_type_id
     LEFT JOIN camp_room_assignments b ON b.room_id = a.room_id AND b.registration_id <> a.registration_id
     LEFT JOIN camp_registrations other ON other.id = b.registration_id
     WHERE a.registration_id = ? ORDER BY b.assigned_at`,
    [checkId(registrationId, "registration")],
  );
  if (!rows.length) return null;
  return {
    label: rows[0].label,
    room_type_name: rows[0].room_type_name,
    roommates: rows.filter((r) => r.full_name).map((r) => r.full_name!.split(" ")[0]),
  };
}

/** Every room in the camp with who's in it, for Rooms › All rooms. */
export async function listRoomsWithOccupants(campId: string): Promise<RoomWithOccupants[]> {
  checkId(campId, "camp");
  const [rooms, occupants] = await Promise.all([
    query<RoomWithOccupants>(
      "app",
      `SELECT x.id, x.camp_id, x.room_type_id, t.name AS room_type_name, x.label, x.gender, x.capacity,
         (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id) AS occupied
       FROM camp_rooms x JOIN camp_room_types t ON t.id = x.room_type_id
       WHERE x.camp_id = ? ORDER BY x.label COLLATE NOCASE`,
      [campId],
    ),
    query<Occupant & { room_id: string }>(
      "app",
      `SELECT a.room_id, r.id AS registration_id, r.full_name, r.fellowship, g.code AS group_code,
         r.checked_in_at IS NOT NULL AS checked_in
       FROM camp_room_assignments a
       JOIN camp_rooms x ON x.id = a.room_id
       JOIN camp_registrations r ON r.id = a.registration_id
       LEFT JOIN camp_group_members m ON m.registration_id = r.id
       LEFT JOIN camp_groups g ON g.id = m.group_id
       WHERE x.camp_id = ? ORDER BY a.assigned_at`,
      [campId],
    ),
  ]);
  for (const room of rooms) room.occupants = occupants.filter((o) => o.room_id === room.id);
  return rooms;
}
