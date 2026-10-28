import { batch, query } from "@/lib/cf";
import { roomStatementsForRemoval } from "./assignments";
import { auditStatement } from "./audit";
import { checkId, getCamp } from "./camps";
import { getGroupFor, groupStatementsForRemoval } from "./groups";
import { getRegistration, isFull, todayInGhana } from "./registrations";
import { listRoomTypes, placesFor } from "./rooms";
import { CampError, GENDERS, type Gender, type Registration } from "./types";

/**
 * Changing someone's gender. Rooms and roommate groups are for men or for
 * women, so in the same step they leave a group and room of the old gender;
 * a coordinator can place them straight into a room of the new one. The
 * room type's places for the new gender are taken as for any move (0009).
 * Attendees can change their own until the roommate deadline.
 */

const people = (g: Gender) => (g === "male" ? "men" : "women");
const roomWord = (g: Gender) => (g === "male" ? "men's" : "women's");

export type GenderRoom = { id: string; label: string; free: number };

/** Rooms of their room type for a gender, with free beds, for placing someone as they change. */
export async function roomsFor(registration: Pick<Registration, "camp_id" | "room_type_id">, gender: Gender) {
  return query<GenderRoom>(
    "app",
    `SELECT x.id, x.label, x.capacity - (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id) AS free
     FROM camp_rooms x WHERE x.camp_id = ? AND x.room_type_id = ? AND x.gender = ?
     AND x.capacity > (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id)
     ORDER BY x.label`,
    [registration.camp_id, registration.room_type_id, gender],
  );
}

type Options = { roomId?: string | null; attendee?: boolean };

export async function changeGender(actor: string, registrationId: string, gender: Gender, { roomId = null, attendee = false }: Options = {}) {
  if (!GENDERS.includes(gender)) throw new CampError("Choose male or female.");
  const before = await getRegistration(checkId(registrationId, "registration"));
  if (!before) throw new CampError("Unknown registration.");
  if (before.status === "cancelled") throw new CampError("This registration is cancelled.");
  if (before.gender === gender) throw new CampError(attendee ? `You're already down as ${gender}.` : `${before.full_name} is already down as ${gender}.`);

  const camp = (await getCamp(before.camp_id))!;
  if (attendee && todayInGhana() > camp.roommate_deadline_on) {
    throw new CampError("Rooms are being finalised, so a coordinator needs to change this. Please ask one.");
  }
  const type = (await listRoomTypes(before.camp_id)).find((t) => t.id === before.room_type_id)!;
  if (placesFor(type, gender) === 0) {
    throw new CampError(
      attendee
        ? `${type.name} is full for ${people(gender)}. Please ask a coordinator.`
        : `${type.name} is full for ${people(gender)}. Raise its places left on Rooms first if the venue has more.`,
    );
  }

  let room: GenderRoom | null = null;
  if (roomId && !attendee) {
    room = (await roomsFor(before, gender)).find((r) => r.id === checkId(roomId, "room")) ?? null;
    if (!room) throw new CampError(`Pick a ${roomWord(gender)} ${type.name} room with a free bed.`);
    if (before.status !== "fully_paid") throw new CampError(`${before.full_name} isn't fully paid, so they can't have a room yet.`);
  }

  const reason = `gender changed to ${gender}`;
  const [group, oldRoom] = await Promise.all([getGroupFor(before.id), roomLabel(before.id)]);
  const groupRemoval = await groupStatementsForRemoval(actor, { ...before, gender } as Registration, reason);
  const statements = [
    {
      sql: "UPDATE camp_registrations SET gender = ? WHERE id = ? AND gender = ? AND status <> 'cancelled' RETURNING id",
      params: [gender, before.id, before.gender],
    },
    auditStatement({
      actor,
      campId: before.camp_id,
      action: "registration.gender_change",
      entity: "registration",
      entityId: before.id,
      before: { gender: before.gender },
      after: { gender },
      ifChanged: true,
    }),
    // After the update: the group trigger lets them go because their gender no longer matches (0016).
    ...groupRemoval.statements,
    ...roomStatementsForRemoval(actor, before, reason),
    // A plain insert, so 0007's trigger undoes the whole change if the room filled meanwhile.
    ...(room
      ? [
          { sql: "INSERT INTO camp_room_assignments (room_id, registration_id, assigned_by) VALUES (?, ?, ?)", params: [room.id, before.id, actor] },
          auditStatement({ actor, campId: before.camp_id, action: "room.assign", entity: "room", entityId: room.id, after: { registration_id: before.id } }),
        ]
      : []),
  ];

  let results;
  try {
    results = await batch("app", statements);
  } catch (err) {
    if (await isFull(type.id, gender)) throw new CampError(`${type.name} just filled up for ${people(gender)}.`);
    if (room) throw new CampError(`${room.label} just filled up. Pick another room.`);
    throw err;
  }
  if (!results[0].results.length) throw new CampError("This registration changed. Please refresh and try again.");

  const notes = [group && "left their roommate group", oldRoom && `left room ${oldRoom}`, room && `is now in ${room.label}`].filter(Boolean);
  return {
    group: !!group,
    oldRoom,
    room: room?.label ?? null,
    warning: notes.length ? `${before.full_name} ${notes.join(", ")}.${groupRemoval.warning ? ` ${groupRemoval.warning}` : ""}` : null,
  };
}

async function roomLabel(registrationId: string) {
  const [row] = await query<{ label: string }>(
    "app",
    "SELECT x.label FROM camp_room_assignments a JOIN camp_rooms x ON x.id = a.room_id WHERE a.registration_id = ?",
    [registrationId],
  );
  return row?.label ?? null;
}
