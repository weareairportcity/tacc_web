import { describe, expect, it } from "vitest";
import { parseCsv, parseRoomCsv } from "@/lib/camp/csv";
import type { RoomType } from "@/lib/camp/types";

const TYPES: RoomType[] = [
  { id: "t-hostel", camp_id: "c", name: "Hostel", price_pesewas: 60000, capacity: 4, places_male: null, places_female: null },
  { id: "t-villa", camp_id: "c", name: "Villa", price_pesewas: 120000, capacity: 2, places_male: null, places_female: null },
];

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('a,"line1\nline2"\n')).toEqual([["a", "line1\nline2"]]);
  });
});

describe("parseRoomCsv", () => {
  it("reads a clean file, defaulting capacity to the room type's", () => {
    const csv = "Room Number,Room Type,Gender,Capacity\nH-1,Hostel,Female,\nV-1,villa,M,3\n";
    const { rooms, errors } = parseRoomCsv(csv, TYPES, []);
    expect(errors).toEqual([]);
    expect(rooms).toEqual([
      { label: "H-1", room_type_id: "t-hostel", gender: "female", capacity: 4 },
      { label: "V-1", room_type_id: "t-villa", gender: "male", capacity: 3 },
    ]);
  });

  it("reports every bad row and returns no rooms if any row is bad", () => {
    const csv = [
      "label,room type,gender,capacity",
      "H-1,Hostel,female,4",
      "H-2,Dorm,female,4",
      "H-3,Hostel,x,4",
      "h-1,Hostel,female,4",
      "H-4,Hostel,male,0",
      ",Hostel,male,2",
      "H-9,Hostel,male,2",
    ].join("\n");
    const { rooms, errors } = parseRoomCsv(csv, TYPES, ["H-9"]);
    expect(rooms).toEqual([]);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(errors[0].message).toContain('room type "Dorm"');
    expect(errors[2].message).toContain("also on line 2");
    expect(errors[5].message).toContain("already exists");
  });

  it("requires the label, room type and gender columns", () => {
    const { errors } = parseRoomCsv("label,capacity\nH-1,4", TYPES, []);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Missing column\(s\): room_type, gender/);
  });

  it("rejects an empty file", () => {
    expect(parseRoomCsv("\n\n", TYPES, []).errors[0].message).toBe("The file is empty.");
  });
});
