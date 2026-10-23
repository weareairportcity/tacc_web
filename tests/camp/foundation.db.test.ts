import { beforeEach, describe, expect, it } from "vitest";
import { batch, query } from "@/lib/cf";
import { createCamp, getCamp, updateCamp } from "@/lib/camp/camps";
import {
  createRoom,
  createRoomType,
  deleteRoom,
  deleteRoomType,
  importRooms,
  listRooms,
  updateRoom,
} from "@/lib/camp/rooms";
import { listStaff, removeStaff, saveStaff } from "@/lib/camp/staff";
import { CampError, type CampInput } from "@/lib/camp/types";

// Runs against the local Worker and D1 from tests/setup/worker.ts. Each test
// makes its own camp, so tests don't depend on one another.

const ACTOR = "coordinator@test.local";

const campInput = (overrides: Partial<CampInput> = {}): CampInput => ({
  name: "Test Camp",
  venue: "Somewhere",
  starts_on: "2027-06-10",
  ends_on: "2027-06-13",
  registration_opens_on: "2027-03-01",
  registration_closes_on: "2027-06-01",
  payment_due_on: "2027-06-01",
  roommate_deadline_on: "2027-06-03",
  min_first_payment_pct: 30,
  status: "draft",
  ...overrides,
});

const auditFor = (entityId: string) =>
  query<{ action: string; actor: string; before_json: string | null; after_json: string | null }>(
    "app",
    "SELECT action, actor, before_json, after_json FROM camp_audit_log WHERE entity_id = ? ORDER BY id",
    [entityId],
  );

let campId: string;
let hostelId: string;

beforeEach(async () => {
  campId = await createCamp(ACTOR, campInput());
  hostelId = await createRoomType(ACTOR, campId, { name: "Hostel", price_pesewas: 60000, capacity: 4 });
});

describe("camps", () => {
  it("creates a camp with a unique slug and an audit entry", async () => {
    const second = await createCamp(ACTOR, campInput());
    const [a, b] = await Promise.all([getCamp(campId), getCamp(second)]);
    expect(a?.slug).toMatch(/^test-camp(-\d+)?$/);
    expect(b?.slug).not.toBe(a?.slug);
    const audit = await auditFor(campId);
    expect(audit[0]).toMatchObject({ action: "camp.create", actor: ACTOR });
  });

  it("updates a camp and records before and after", async () => {
    await updateCamp(ACTOR, campId, campInput({ name: "Renamed", status: "open" }));
    const camp = await getCamp(campId);
    expect(camp).toMatchObject({ name: "Renamed", status: "open" });
    const update = (await auditFor(campId)).find((e) => e.action === "camp.update")!;
    expect(JSON.parse(update.before_json!).name).toBe("Test Camp");
    expect(JSON.parse(update.after_json!).name).toBe("Renamed");
  });

  it("rejects bad dates and percentages", async () => {
    await expect(createCamp(ACTOR, campInput({ ends_on: "2027-06-01" }))).rejects.toThrow("can't end before");
    await expect(createCamp(ACTOR, campInput({ min_first_payment_pct: 0 }))).rejects.toThrow(CampError);
    await expect(createCamp(ACTOR, campInput({ starts_on: "not a date" }))).rejects.toThrow("must be a date");
  });
});

describe("room types and rooms", () => {
  it("rejects a duplicate room type name in the same camp", async () => {
    await expect(
      createRoomType(ACTOR, campId, { name: "hostel", price_pesewas: 1, capacity: 2 }),
    ).rejects.toThrow("already a room type");
  });

  it("adds, edits and deletes a room, auditing each step", async () => {
    const roomId = await createRoom(ACTOR, campId, { label: "H-1", room_type_id: hostelId, gender: "female", capacity: 4 });
    await updateRoom(ACTOR, roomId, { label: "H-1A", room_type_id: hostelId, gender: "male", capacity: 3 });
    expect((await listRooms(campId))[0]).toMatchObject({ label: "H-1A", gender: "male", capacity: 3, room_type_name: "Hostel" });

    await deleteRoom(ACTOR, roomId);
    expect(await listRooms(campId)).toEqual([]);
    expect((await auditFor(roomId)).map((e) => e.action)).toEqual(["room.create", "room.update", "room.delete"]);
  });

  it("rejects a duplicate room label, ignoring case", async () => {
    await createRoom(ACTOR, campId, { label: "H-1", room_type_id: hostelId, gender: "female", capacity: 4 });
    await expect(
      createRoom(ACTOR, campId, { label: "h-1", room_type_id: hostelId, gender: "male", capacity: 4 }),
    ).rejects.toThrow("already exists");
  });

  it("rejects a room type from another camp", async () => {
    const otherCamp = await createCamp(ACTOR, campInput({ name: "Other" }));
    const otherType = await createRoomType(ACTOR, otherCamp, { name: "Villa", price_pesewas: 1, capacity: 2 });
    await expect(
      createRoom(ACTOR, campId, { label: "X", room_type_id: otherType, gender: "male", capacity: 2 }),
    ).rejects.toThrow("room type from this camp");
  });

  it("won't delete a room type that still has rooms", async () => {
    await createRoom(ACTOR, campId, { label: "H-1", room_type_id: hostelId, gender: "female", capacity: 4 });
    await expect(deleteRoomType(ACTOR, hostelId)).rejects.toThrow("still has 1 room");
  });

  it("enforces the room type restriction in the database too", async () => {
    await createRoom(ACTOR, campId, { label: "H-1", room_type_id: hostelId, gender: "female", capacity: 4 });
    await expect(query("app", "DELETE FROM camp_room_types WHERE id = ?", [hostelId])).rejects.toThrow();
  });
});

describe("CSV import", () => {
  it("imports a clean file in one go", async () => {
    const csv = ["label,room type,gender,capacity", ...Array.from({ length: 150 }, (_, i) => `H-${i + 1},Hostel,${i % 2 ? "male" : "female"},`)].join("\n");
    const result = await importRooms(ACTOR, campId, csv);
    expect(result).toEqual({ created: 150, errors: [] });
    const rooms = await listRooms(campId);
    expect(rooms).toHaveLength(150);
    expect(rooms.every((r) => r.capacity === 4)).toBe(true);
    const [entry] = await auditFor(campId).then((rows) => rows.filter((r) => r.action === "room.import"));
    expect(JSON.parse(entry.after_json!).count).toBe(150);
  });

  it("saves nothing when any row is invalid", async () => {
    const csv = "label,room type,gender\nH-1,Hostel,female\nH-2,Nope,female\nH-3,Hostel,male";
    const result = await importRooms(ACTOR, campId, csv);
    expect(result.created).toBe(0);
    expect(result.errors).toEqual([{ line: 3, message: expect.stringContaining('"Nope"') }]);
    expect(await listRooms(campId)).toEqual([]);
  });

  it("rejects labels that already exist in the camp", async () => {
    await createRoom(ACTOR, campId, { label: "H-1", room_type_id: hostelId, gender: "female", capacity: 4 });
    const result = await importRooms(ACTOR, campId, "label,room type,gender\nH-1,Hostel,female\nH-2,Hostel,female");
    expect(result.errors[0]).toMatchObject({ line: 2 });
    expect(await listRooms(campId)).toHaveLength(1);
  });
});

describe("staff", () => {
  it("saves, changes and removes staff with audit entries", async () => {
    const email = `leader-${crypto.randomUUID()}@test.local`;
    await saveStaff(ACTOR, { email: email.toUpperCase(), role: "leader", scope_kind: "fellowship", scope_value: "Qadash" });
    await saveStaff(ACTOR, { email, role: "coordinator", scope_kind: "pfcc", scope_value: "PFCC 1" });
    expect((await listStaff()).find((s) => s.email === email)).toEqual({
      email,
      role: "coordinator",
      scope_kind: null,
      scope_value: null,
    });
    await removeStaff(ACTOR, email);
    expect((await listStaff()).some((s) => s.email === email)).toBe(false);
    expect((await auditFor(email)).map((e) => e.action)).toEqual(["staff.create", "staff.update", "staff.remove"]);
  });

  it("requires leaders to have a real fellowship or PFCC", async () => {
    await expect(
      saveStaff(ACTOR, { email: "l@test.local", role: "leader", scope_kind: "fellowship", scope_value: "Made Up" }),
    ).rejects.toThrow("one fellowship or one PFCC");
  });
});

describe("audit log", () => {
  it("is append-only", async () => {
    await expect(query("app", "UPDATE camp_audit_log SET actor = 'x' WHERE camp_id = ?", [campId])).rejects.toThrow();
    await expect(query("app", "DELETE FROM camp_audit_log WHERE camp_id = ?", [campId])).rejects.toThrow();
    expect((await auditFor(campId))[0].actor).toBe(ACTOR);
  });

  it("is written in the same batch as the change", async () => {
    // A failing statement after the change rolls the change back too.
    const id = crypto.randomUUID();
    await expect(
      batch("app", [
        { sql: "INSERT INTO camp_rooms (id, camp_id, room_type_id, label, gender, capacity) VALUES (?, ?, ?, 'Z', 'male', 2)", params: [id, campId, hostelId] },
        { sql: "INSERT INTO camp_audit_log (camp_id) VALUES (?)", params: [campId] },
      ]),
    ).rejects.toThrow();
    expect(await listRooms(campId)).toEqual([]);
  });
});
