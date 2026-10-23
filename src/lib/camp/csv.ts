import { GENDERS, type Gender, type RoomInput, type RoomType } from "./types";

/** RFC 4180-style CSV: quoted fields, "" escapes, CRLF or LF, optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export type CsvError = { line: number; message: string };

const HEADERS: Record<string, keyof RoomInput | "room_type"> = {
  label: "label",
  room: "label",
  "room name": "label",
  "room number": "label",
  room_type: "room_type",
  "room type": "room_type",
  type: "room_type",
  gender: "gender",
  capacity: "capacity",
  beds: "capacity",
};

const GENDER_ALIASES: Record<string, Gender> = { male: "male", m: "male", female: "female", f: "female" };

export const MAX_IMPORT_ROWS = 2000;

/**
 * Checks a venue room list before anything is saved. Columns: label, room
 * type, gender, capacity (optional: defaults to the room type's). Returns
 * either every row ready to insert, or every problem found, by line.
 */
export function parseRoomCsv(
  text: string,
  roomTypes: RoomType[],
  existingLabels: string[],
): { rooms: RoomInput[]; errors: CsvError[] } {
  const rows = parseCsv(text).filter((r) => r.some((cell) => cell.trim()));
  if (rows.length === 0) return { rooms: [], errors: [{ line: 1, message: "The file is empty." }] };

  const header = rows[0].map((h) => HEADERS[h.trim().toLowerCase()]);
  const col = (name: string) => header.indexOf(name as keyof RoomInput);
  const missing = ["label", "room_type", "gender"].filter((name) => col(name) === -1);
  if (missing.length) {
    return {
      rooms: [],
      errors: [{ line: 1, message: `Missing column(s): ${missing.join(", ")}. Expected label, room type, gender, capacity.` }],
    };
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    return { rooms: [], errors: [{ line: 1, message: `At most ${MAX_IMPORT_ROWS} rooms per file.` }] };
  }

  const typesByName = new Map(roomTypes.map((t) => [t.name.trim().toLowerCase(), t]));
  const taken = new Set(existingLabels.map((l) => l.trim().toLowerCase()));
  const seen = new Map<string, number>();
  const rooms: RoomInput[] = [];
  const errors: CsvError[] = [];

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const cell = (name: string) => (col(name) === -1 ? "" : (cells[col(name)] ?? "").trim());
    const problems: string[] = [];

    const label = cell("label");
    const key = label.toLowerCase();
    if (!label) problems.push("label is empty");
    else if (label.length > 60) problems.push("label is longer than 60 characters");
    else if (taken.has(key)) problems.push(`room "${label}" already exists in this camp`);
    else if (seen.has(key)) problems.push(`room "${label}" is also on line ${seen.get(key)}`);
    if (label) seen.set(key, seen.get(key) ?? line);

    const type = typesByName.get(cell("room_type").toLowerCase());
    if (!type) problems.push(`room type "${cell("room_type")}" doesn't exist in this camp`);

    const gender = GENDER_ALIASES[cell("gender").toLowerCase()];
    if (!gender) problems.push(`gender must be ${GENDERS.join(" or ")}`);

    const rawCapacity = cell("capacity");
    const capacity = rawCapacity ? Number(rawCapacity) : type?.capacity;
    if (rawCapacity && !(Number.isInteger(capacity) && capacity! >= 1 && capacity! <= 100)) {
      problems.push("capacity must be a whole number from 1 to 100");
    }

    if (problems.length) errors.push({ line, message: problems.join("; ") });
    else rooms.push({ label, room_type_id: type!.id, gender, capacity: capacity! });
  });

  return errors.length ? { rooms: [], errors } : { rooms, errors };
}
