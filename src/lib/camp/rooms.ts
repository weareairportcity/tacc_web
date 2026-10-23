import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { ID, checkId } from "./camps";
import { parseRoomCsv, type CsvError } from "./csv";
import { CampError, GENDERS, type Room, type RoomInput, type RoomType } from "./types";

/**
 * Room types and rooms on D1. Unique names and labels are checked here for a
 * friendly message; the database's UNIQUE and RESTRICT constraints are the
 * real guard if two coordinators save at the same moment.
 */

// ─── Room types ──────────────────────────────────────────────────────────────

export type RoomTypeInput = Pick<RoomType, "name" | "price_pesewas" | "capacity">;

function validateRoomType(raw: RoomTypeInput): RoomTypeInput {
  const input = { name: String(raw.name ?? "").trim(), price_pesewas: raw.price_pesewas, capacity: Number(raw.capacity) };
  const problems: string[] = [];
  if (!input.name) problems.push("Name is required.");
  if (input.name.length > 60) problems.push("Name is too long.");
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
    "SELECT id, camp_id, name, price_pesewas, capacity FROM camp_room_types WHERE camp_id = ? ORDER BY price_pesewas, name",
    [checkId(campId, "camp")],
  );
}

async function getRoomType(id: string): Promise<RoomType | null> {
  const [row] = await query<RoomType>(
    "app",
    "SELECT id, camp_id, name, price_pesewas, capacity FROM camp_room_types WHERE id = ?",
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
      sql: "INSERT INTO camp_room_types (id, camp_id, name, price_pesewas, capacity) VALUES (?, ?, ?, ?, ?)",
      params: [id, campId, input.name, input.price_pesewas, input.capacity],
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
      sql: "UPDATE camp_room_types SET name = ?, price_pesewas = ?, capacity = ? WHERE id = ?",
      params: [input.name, input.price_pesewas, input.capacity, id],
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
  await batch("app", [
    { sql: "DELETE FROM camp_room_types WHERE id = ?", params: [id] },
    auditStatement({ actor, campId: before.camp_id, action: "room_type.delete", entity: "room_type", entityId: id, before }),
  ]);
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

const ROOM_SELECT = `SELECT r.id, r.camp_id, r.room_type_id, t.name AS room_type_name, r.label, r.gender, r.capacity
  FROM camp_rooms r JOIN camp_room_types t ON t.id = r.room_type_id`;

export async function listRooms(campId: string): Promise<Room[]> {
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
  checkId(campId, "camp");
  const input = await validateRoom(campId, raw);
  const id = crypto.randomUUID();
  await batch("app", [
    {
      sql: "INSERT INTO camp_rooms (id, camp_id, room_type_id, label, gender, capacity) VALUES (?, ?, ?, ?, ?, ?)",
      params: [id, campId, input.room_type_id, input.label, input.gender, input.capacity],
    },
    auditStatement({ actor, campId, action: "room.create", entity: "room", entityId: id, after: input }),
  ]);
  return id;
}

// Phase 4 adds the occupancy rules: capacity can't drop below the people
// assigned, and deleting a room returns its occupants to Unassigned.

export async function updateRoom(actor: string, id: string, raw: RoomInput) {
  const before = await getRoom(id);
  if (!before) throw new CampError("Unknown room.");
  const input = await validateRoom(before.camp_id, raw, id);
  await batch("app", [
    {
      sql: "UPDATE camp_rooms SET room_type_id = ?, label = ?, gender = ?, capacity = ? WHERE id = ?",
      params: [input.room_type_id, input.label, input.gender, input.capacity, id],
    },
    auditStatement({ actor, campId: before.camp_id, action: "room.update", entity: "room", entityId: id, before, after: input }),
  ]);
}

export async function deleteRoom(actor: string, id: string) {
  const before = await getRoom(id);
  if (!before) throw new CampError("Unknown room.");
  await batch("app", [
    { sql: "DELETE FROM camp_rooms WHERE id = ?", params: [id] },
    auditStatement({ actor, campId: before.camp_id, action: "room.delete", entity: "room", entityId: id, before }),
  ]);
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
