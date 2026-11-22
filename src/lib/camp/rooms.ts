import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { ID, checkId } from "./camps";
import { parseRoomCsv, type CsvError } from "./csv";
import { autoRoomNumber, formatAutoRoomLabel } from "./fill";
import { placesLeft } from "@/components/camp/places";
import { CampError, GENDERS, type Gender, type Room, type RoomInput, type RoomType } from "./types";

/**
 * Room types and rooms on D1. Unique names and labels are checked here for a
 * friendly message; the database's UNIQUE and RESTRICT constraints are the
 * real guard if two coordinators save at the same moment.
 */

// ─── Room types ──────────────────────────────────────────────────────────────

export type RoomTypeInput = Pick<RoomType, "name" | "price_pesewas" | "capacity"> & { subtext?: string };

const TYPE_SELECT = `SELECT t.id, t.camp_id, t.name, t.subtext, t.price_pesewas, t.capacity,
    (SELECT places_left FROM camp_room_type_places p WHERE p.room_type_id = t.id AND p.gender = 'male') AS places_male,
    (SELECT places_left FROM camp_room_type_places p WHERE p.room_type_id = t.id AND p.gender = 'female') AS places_female,
    (SELECT places_total FROM camp_room_type_places p WHERE p.room_type_id = t.id AND p.gender = 'male') AS total_male,
    (SELECT places_total FROM camp_room_type_places p WHERE p.room_type_id = t.id AND p.gender = 'female') AS total_female,
    (SELECT count(*) FROM camp_registrations r WHERE r.room_type_id = t.id AND r.gender = 'male' AND r.status <> 'cancelled' AND r.deleted_at IS NULL) AS taken_male,
    (SELECT count(*) FROM camp_registrations r WHERE r.room_type_id = t.id AND r.gender = 'female' AND r.status <> 'cancelled' AND r.deleted_at IS NULL) AS taken_female
  FROM camp_room_types t`;

/** Places left for one gender: null means no limit, 0 means full. */
export const placesFor = (type: RoomType, gender: Gender) =>
  placesLeft(gender === "male" ? type.places_male : type.places_female);

function validateRoomType(raw: RoomTypeInput): RoomTypeInput {
  const input = {
    name: String(raw.name ?? "").trim(),
    subtext: String(raw.subtext ?? "").trim(),
    price_pesewas: raw.price_pesewas,
    capacity: Number(raw.capacity),
  };
  const problems: string[] = [];
  if (!input.name) problems.push("Name is required.");
  if (input.name.length > 60) problems.push("Name is too long.");
  if (input.subtext.length > 160) problems.push("Subtext is too long.");
  if (!Number.isInteger(input.price_pesewas) || input.price_pesewas < 0) problems.push("Price must be zero or more.");
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 100) {
    problems.push("Beds per room must be a whole number from 1 to 100.");
  }
  if (problems.length) throw new CampError(problems.join(" "));
  return input;
}

export async function listRoomTypes(campId: string): Promise<RoomType[]> {
  return query<RoomType>(
    "app",
    `${TYPE_SELECT} WHERE t.camp_id = ? ORDER BY t.price_pesewas, t.name`,
    [checkId(campId, "camp")],
  );
}

export async function getRoomType(id: string): Promise<RoomType | null> {
  const [row] = await query<RoomType>(
    "app",
    `${TYPE_SELECT} WHERE t.id = ?`,
    [checkId(id, "room type")],
  );
  return row ?? null;
}

async function assertTypeNameFree(campId: string, name: string, exceptId?: string) {
  const [clash] = await query<{ id: string }>(
    "app",
    "SELECT id FROM camp_room_types WHERE camp_id = ? AND lower(name) = lower(?) AND id <> ?",
    [campId, name, exceptId ?? ""],
  );
  if (clash) throw new CampError(`There is already a room type called "${name}".`);
}

export async function createRoomType(actor: string, campId: string, raw: RoomTypeInput): Promise<string> {
  checkId(campId, "camp");
  const input = validateRoomType(raw);
  await assertTypeNameFree(campId, input.name);
  const id = crypto.randomUUID();
  await batch("app", [
    {
      sql: "INSERT INTO camp_room_types (id, camp_id, name, subtext, price_pesewas, capacity) VALUES (?, ?, ?, ?, ?, ?)",
      params: [id, campId, input.name, input.subtext, input.price_pesewas, input.capacity],
    },
    auditStatement({ actor, campId, action: "room_type.create", entity: "room_type", entityId: id, after: input }),
  ]);
  return id;
}

export async function updateRoomType(actor: string, id: string, raw: RoomTypeInput) {
  const before = await getRoomType(id);
  if (!before) throw new CampError("Unknown room type.");
  const input = validateRoomType(raw);
  await assertTypeNameFree(before.camp_id, input.name, id);
  await batch("app", [
    {
      sql: "UPDATE camp_room_types SET name = ?, subtext = ?, price_pesewas = ?, capacity = ? WHERE id = ?",
      params: [input.name, input.subtext, input.price_pesewas, input.capacity, id],
    },
    auditStatement({
      actor,
      campId: before.camp_id,
      action: "room_type.update",
      entity: "room_type",
      entityId: id,
      before,
      after: input,
    }),
  ]);
}

export async function deleteRoomType(actor: string, id: string) {
  const before = await getRoomType(id);
  if (!before) throw new CampError("Unknown room type.");
  const [{ n }] = await query<{ n: number }>("app", "SELECT count(*) AS n FROM camp_rooms WHERE room_type_id = ?", [id]);
  if (n > 0) throw new CampError(`"${before.name}" still has ${n} room(s). Delete or move them first.`);
  const [{ people }] = await query<{ people: number }>(
    "app",
    "SELECT count(*) AS people FROM camp_registrations WHERE room_type_id = ?",
    [id],
  );
  if (people > 0) throw new CampError(`${people} registration(s) chose "${before.name}", so it can't be deleted.`);
  await batch("app", [
    { sql: "DELETE FROM camp_room_types WHERE id = ?", params: [id] },
    auditStatement({ actor, campId: before.camp_id, action: "room_type.delete", entity: "room_type", entityId: id, before }),
  ]);
}

async function takenFor(roomTypeId: string, gender: Gender) {
  const [{ n }] = await query<{ n: number }>(
    "app",
    `SELECT count(*) AS n FROM camp_registrations
     WHERE room_type_id = ? AND gender = ? AND status <> 'cancelled' AND deleted_at IS NULL`,
    [roomTypeId, gender],
  );
  return Number(n) || 0;
}

const totalFor = (type: RoomType, gender: Gender) =>
  placesLeft(gender === "male" ? type.total_male : type.total_female);

/**
 * Records how many places the venue says are left for one gender of a room
 * type. null removes the limit; 0 marks it full. Pass `placesTotal` when the
 * number is a total, not remaining. `asRooms` means that number is rooms;
 * beds = rooms × the type's capacity. Remaining is total beds minus people
 * already registered. Registrations count remaining down (migration 0009).
 */
export async function setPlacesLeft(
  actor: string,
  roomTypeId: string,
  gender: Gender,
  placesLeft: number | null,
  placesTotal: number | null = null,
  asRooms = false,
) {
  const type = await getRoomType(roomTypeId);
  if (!type) throw new CampError("Unknown room type.");
  if (!GENDERS.includes(gender)) throw new CampError("Choose male or female.");

  let left = placesLeft;
  let total: number | null = null;
  if (placesTotal != null) {
    if (asRooms) {
      if (!Number.isInteger(placesTotal) || placesTotal < 1 || placesTotal > 10_000) {
        throw new CampError("Number of rooms must be a whole number from 1 to 10,000.");
      }
      const beds = placesTotal * type.capacity;
      if (beds > 10_000) throw new CampError("That's too many beds. Try fewer rooms.");
      left = Math.max(0, beds - (await takenFor(type.id, gender)));
      total = beds;
    } else {
      if (!Number.isInteger(placesTotal) || placesTotal < 1 || placesTotal > 10_000) {
        throw new CampError("Total places must be a whole number from 1 to 10,000.");
      }
      left = Math.max(0, placesTotal - (await takenFor(type.id, gender)));
      total = placesTotal;
    }
  } else if (left !== null && (!Number.isInteger(left) || left < 0 || left > 10_000)) {
    throw new CampError("Places left must be a whole number from 0 to 10,000.");
  }

  const before = placesFor(type, gender);
  const beforeTotal = totalFor(type, gender);
  if (before === left && beforeTotal === total) return;
  await batch("app", [
    left === null
      ? { sql: "DELETE FROM camp_room_type_places WHERE room_type_id = ? AND gender = ?", params: [type.id, gender] }
      : {
          sql: `INSERT INTO camp_room_type_places (room_type_id, gender, places_left, places_total, updated_by) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (room_type_id, gender) DO UPDATE SET places_left = excluded.places_left,
                  places_total = excluded.places_total,
                  updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
          params: [type.id, gender, left, total, actor],
        },
    auditStatement({
      actor,
      campId: type.camp_id,
      action: "room_type.places_left",
      entity: "room_type",
      entityId: type.id,
      before: { gender, places_left: before, places_total: beforeTotal },
      after: { gender, places_left: left, places_total: total },
    }),
  ]);
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

const ROOM_SELECT = `SELECT r.id, r.camp_id, r.room_type_id, t.name AS room_type_name, r.label, r.gender, r.capacity,
    (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = r.id) AS occupied
  FROM camp_rooms r JOIN camp_room_types t ON t.id = r.room_type_id`;

/** Turn leftover "Men · 6 in a room with AC 1" names into M-AC6-01. Venue numbers stay. */
export async function shortenAutoRoomLabels(campId: string) {
  const rooms = await query<{ id: string; label: string; gender: Gender; capacity: number; name: string }>(
    "app",
    `SELECT r.id, r.label, r.gender, r.capacity, t.name
     FROM camp_rooms r JOIN camp_room_types t ON t.id = r.room_type_id
     WHERE r.camp_id = ?`,
    [checkId(campId, "camp")],
  );
  const used = new Set(rooms.map((r) => r.label.toLowerCase()));
  const stmts: { sql: string; params: unknown[] }[] = [];
  for (const r of rooms) {
    const n = autoRoomNumber(r.label, r.gender, r.name, r.capacity);
    if (n == null) continue;
    const next = formatAutoRoomLabel(r.gender, r.name, r.capacity, n);
    if (next === r.label || used.has(next.toLowerCase())) continue;
    used.delete(r.label.toLowerCase());
    used.add(next.toLowerCase());
    stmts.push({ sql: "UPDATE camp_rooms SET label = ? WHERE id = ?", params: [next, r.id] });
  }
  if (stmts.length) await batch("app", stmts);
}

export async function listRooms(campId: string): Promise<Room[]> {
  await shortenAutoRoomLabels(campId);
  return query<Room>("app", `${ROOM_SELECT} WHERE r.camp_id = ? ORDER BY r.label`, [checkId(campId, "camp")]);
}

async function getRoom(id: string): Promise<Room | null> {
  const [row] = await query<Room>("app", `${ROOM_SELECT} WHERE r.id = ?`, [checkId(id, "room")]);
  return row ?? null;
}

async function validateRoom(campId: string, raw: RoomInput, exceptId?: string): Promise<RoomInput> {
  const input = {
    label: String(raw.label ?? "").trim(),
    room_type_id: String(raw.room_type_id ?? ""),
    gender: raw.gender,
    capacity: Number(raw.capacity),
  };
  const problems: string[] = [];
  if (!input.label) problems.push("Room label is required.");
  if (input.label.length > 60) problems.push("Room label is too long.");
  if (!GENDERS.includes(input.gender)) problems.push("Choose male or female.");
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 100) {
    problems.push("Beds must be a whole number from 1 to 100.");
  }
  const type = ID.test(input.room_type_id) ? await getRoomType(input.room_type_id) : null;
  if (!type || type.camp_id !== campId) problems.push("Choose a room type from this camp.");
  if (problems.length) throw new CampError(problems.join(" "));

  const [clash] = await query<{ id: string }>(
    "app",
    "SELECT id FROM camp_rooms WHERE camp_id = ? AND lower(label) = lower(?) AND id <> ?",
    [campId, input.label, exceptId ?? ""],
  );
  if (clash) throw new CampError(`Room "${input.label}" already exists in this camp.`);
  return input;
}

export async function createRoom(actor: string, campId: string, raw: RoomInput): Promise<string> {
  const [id] = await createRooms(actor, campId, [raw]);
  return id;
}

/** Several rooms in one write, for Place everyone creating what the pool still needs. */
export async function createRooms(actor: string, campId: string, raws: RoomInput[]): Promise<string[]> {
  checkId(campId, "camp");
  if (!raws.length) return [];
  const inputs: RoomInput[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const input = await validateRoom(campId, raw);
    const key = input.label.toLowerCase();
    if (seen.has(key)) throw new CampError(`Room "${input.label}" already exists in this camp.`);
    seen.add(key);
    inputs.push(input);
  }
  const ids = inputs.map(() => crypto.randomUUID());
  await batch("app", [
    ...inputs.map((input, i) => ({
      sql: "INSERT INTO camp_rooms (id, camp_id, room_type_id, label, gender, capacity) VALUES (?, ?, ?, ?, ?, ?)",
      params: [ids[i], campId, input.room_type_id, input.label, input.gender, input.capacity],
    })),
    ...inputs.map((input, i) => auditStatement({ actor, campId, action: "room.create", entity: "room", entityId: ids[i], after: input })),
  ]);
  return ids;
}

/**
 * An occupied room can't drop below the people in it, or change gender or
 * type (migration 0007's triggers hold both if two saves race).
 */
export async function updateRoom(actor: string, id: string, raw: RoomInput) {
  const before = await getRoom(id);
  if (!before) throw new CampError("Unknown room.");
  const input = await validateRoom(before.camp_id, raw, id);
  if (input.capacity < before.occupied) {
    throw new CampError(
      `${before.label} has ${before.occupied} people in it. Remove some before reducing it to ${input.capacity} beds.`,
    );
  }
  if (before.occupied > 0 && (input.gender !== before.gender || input.room_type_id !== before.room_type_id)) {
    throw new CampError(`${before.label} has people in it. Empty it before changing its gender or room type.`);
  }
  await batch("app", [
    {
      sql: "UPDATE camp_rooms SET room_type_id = ?, label = ?, gender = ?, capacity = ? WHERE id = ?",
      params: [input.room_type_id, input.label, input.gender, input.capacity, id],
    },
    auditStatement({ actor, campId: before.camp_id, action: "room.update", entity: "room", entityId: id, before, after: input }),
  ]);
}

/** Its occupants go back to Unassigned (the placements cascade); the audit entry names them. */
export async function deleteRoom(actor: string, id: string) {
  const before = await getRoom(id);
  if (!before) throw new CampError("Unknown room.");
  const occupants = await query<{ registration_id: string; full_name: string }>(
    "app",
    `SELECT a.registration_id, r.full_name FROM camp_room_assignments a
     JOIN camp_registrations r ON r.id = a.registration_id WHERE a.room_id = ?`,
    [id],
  );
  await batch("app", [
    { sql: "DELETE FROM camp_rooms WHERE id = ?", params: [id] },
    auditStatement({
      actor,
      campId: before.camp_id,
      action: "room.delete",
      entity: "room",
      entityId: id,
      before: { ...before, occupants },
    }),
  ]);
  return { unassigned: occupants.length };
}

/**
 * Venue room list from CSV. Checks every row first; saves nothing unless the
 * whole file is clean, then inserts it all in one statement (rows passed as
 * JSON, which also stays under D1's 100-parameter limit) with one audit entry.
 */
export async function importRooms(
  actor: string,
  campId: string,
  csvText: string,
): Promise<{ created: number; errors: CsvError[] }> {
  checkId(campId, "camp");
  const [types, existing] = await Promise.all([
    listRoomTypes(campId),
    query<{ label: string }>("app", "SELECT label FROM camp_rooms WHERE camp_id = ?", [campId]),
  ]);
  const { rooms, errors } = parseRoomCsv(csvText, types, existing.map((r) => r.label));
  if (errors.length) return { created: 0, errors };

  const rows = rooms.map((room) => ({ id: crypto.randomUUID(), ...room }));
  await batch("app", [
    {
      sql: `INSERT INTO camp_rooms (id, camp_id, room_type_id, label, gender, capacity)
            SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.room_type_id'),
                   json_extract(value, '$.label'), json_extract(value, '$.gender'), json_extract(value, '$.capacity')
            FROM json_each(?)`,
      params: [campId, JSON.stringify(rows)],
    },
    auditStatement({
      actor,
      campId,
      action: "room.import",
      entity: "camp",
      entityId: campId,
      after: { count: rows.length, labels: rows.map((r) => r.label) },
    }),
  ]);
  return { created: rows.length, errors: [] };
}
