import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { assignGroup, assignPerson, getMyRoom, getPoolBoard, listPools, unassign } from "@/lib/camp/assignments";
import { createGroup, getGroupFor, joinByCode, setLocked } from "@/lib/camp/groups";
import { cancelRegistration, getRegistration, register } from "@/lib/camp/registrations";
import { createRoom, createRoomType, deleteRoom, listRooms, updateRoom } from "@/lib/camp/rooms";
import type { Gender, Registration } from "@/lib/camp/types";
import { ACTOR, attendee, openCamp, paidUp } from "./helpers";

// Room assignment end to end: src/lib/camp/assignments.ts → local Worker →
// D1, including migration 0007's triggers when the code is bypassed.

/** A camp with women's four-bed Hostel rooms and `n` Fully Paid women for them. */
async function setup(n: number, rooms: { label: string; capacity?: number; gender?: Gender }[] = [{ label: "A1" }]) {
  const { camp, roomTypeId } = await openCamp();
  const roomIds: string[] = [];
  for (const r of rooms) {
    roomIds.push(
      await createRoom(ACTOR, camp.id, {
        label: r.label,
        room_type_id: roomTypeId,
        gender: r.gender ?? "female",
        capacity: r.capacity ?? 4,
      }),
    );
  }
  const people: Registration[] = [];
  for (let i = 0; i < n; i++) people.push(await paidUp(camp, roomTypeId, { full_name: `Person${i + 1} Surname` }));
  return { camp, roomTypeId, roomIds, people };
}

const occupants = async (roomId: string) =>
  (await query<{ registration_id: string }>("app", "SELECT registration_id FROM camp_room_assignments WHERE room_id = ?", [roomId])).map(
    (r) => r.registration_id,
  );

async function groupOf(owner: Registration, members: Registration[]) {
  const id = await createGroup(owner);
  const code = (await getGroupFor(owner.id))!.code;
  for (const m of members) await joinByCode(m, code);
  return id;
}

describe("placing one person", () => {
  it("fills a bed, warns about the free ones, and is audited", async () => {
    const { roomIds: [room], people: [a, b, c, d] } = await setup(4);
    expect(await assignPerson(ACTOR, room, a.id)).toMatchObject({ warning: "A1 has 3 free beds. Top it up from the unmatched list." });
    await assignPerson(ACTOR, room, b.id);
    await assignPerson(ACTOR, room, c.id);
    expect(await assignPerson(ACTOR, room, d.id)).toMatchObject({ warning: null });
    expect(await occupants(room)).toHaveLength(4);
    const entries = await query<{ actor: string; after_json: string }>(
      "app",
      "SELECT actor, after_json FROM camp_audit_log WHERE entity_id = ? AND action = 'room.assign' ORDER BY id",
      [room],
    );
    expect(entries.map((e) => [e.actor, JSON.parse(e.after_json).registration_id])).toEqual(
      [a, b, c, d].map((p) => [ACTOR, p.id]),
    );
  });

  it("checks gender, room type, camp, payment, existing placement and free beds", async () => {
    const { camp, roomTypeId, roomIds: [room, mens], people } = await setup(5, [
      { label: "A1" },
      { label: "M1", gender: "male" },
    ]);
    await expect(assignPerson(ACTOR, mens, people[0].id)).rejects.toThrow("M1 is a men's room");

    const suite = await createRoomType(ACTOR, camp.id, { name: "Suite", price_pesewas: 90000, capacity: 2 });
    const suiteGuest = await paidUp(camp, suite);
    await expect(assignPerson(ACTOR, room, suiteGuest.id)).rejects.toThrow("isn't a Suite room");

    const elsewhere = await setup(1);
    await expect(assignPerson(ACTOR, room, elsewhere.people[0].id)).rejects.toThrow("isn't registered for this camp");

    const { id: unpaid } = await register(camp, attendee(roomTypeId, { full_name: "Not Paid" }));
    await expect(assignPerson(ACTOR, room, unpaid)).rejects.toThrow("Not Paid isn't fully paid");

    await assignPerson(ACTOR, room, people[0].id);
    await expect(assignPerson(ACTOR, room, people[0].id)).rejects.toThrow("already in A1");

    for (const p of people.slice(1, 4)) await assignPerson(ACTOR, room, p.id);
    await expect(assignPerson(ACTOR, room, people[4].id)).rejects.toThrow("A1 is full");
  });

  it("never overfills a room when coordinators assign at the same moment", async () => {
    const { roomIds: [room], people } = await setup(10);
    const results = await Promise.allSettled(people.map((p) => assignPerson(ACTOR, room, p.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect(await occupants(room)).toHaveLength(4);
  });

  it("puts a person in only one room when two coordinators pick different rooms at once", async () => {
    const { roomIds, people: [a] } = await setup(1, [{ label: "A1" }, { label: "A2" }, { label: "A3" }]);
    const results = await Promise.allSettled(roomIds.map((room) => assignPerson(ACTOR, room, a.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ n }] = await query<{ n: number }>("app", "SELECT COUNT(*) AS n FROM camp_room_assignments WHERE registration_id = ?", [a.id]);
    expect(n).toBe(1);
  });
});

describe("placing a group", () => {
  it("places every member at once and warns while the group is open", async () => {
    const { roomIds: [room], people: [owner, a, b] } = await setup(3);
    const group = await groupOf(owner, [a, b]);
    const { warning } = await assignGroup(ACTOR, room, group);
    expect(warning).toBe("A1 has 1 free bed. Top it up from the unmatched list. This group is still open, so its members may change.");
    expect((await occupants(room)).sort()).toEqual([owner.id, a.id, b.id].sort());
  });

  it("only goes in whole: a group bigger than the free beds is refused", async () => {
    const { roomIds: [room], people: [owner, a, b, solo, solo2] } = await setup(5);
    const group = await groupOf(owner, [a, b]);
    await assignPerson(ACTOR, room, solo.id);
    await assignPerson(ACTOR, room, solo2.id);
    await expect(assignGroup(ACTOR, room, group)).rejects.toThrow("A1 has 2 free beds; this group needs 3");
    expect(await occupants(room)).toHaveLength(2);
  });

  it("skips members already in the room, and won't split a group across rooms", async () => {
    const { roomIds: [a1, a2], people: [owner, a, b] } = await setup(3, [{ label: "A1" }, { label: "A2" }]);
    const group = await groupOf(owner, [a, b]);
    await setLocked(owner, true);
    await assignPerson(ACTOR, a1, a.id);
    expect(await assignGroup(ACTOR, a1, group)).toMatchObject({ warning: "A1 has 1 free bed. Top it up from the unmatched list." });
    expect(await occupants(a1)).toHaveLength(3);

    await unassign(ACTOR, b.id);
    await expect(assignGroup(ACTOR, a2, group)).rejects.toThrow("already in A1");
  });

  it("lets only one of two groups into a room when both are sent at once", async () => {
    const { roomIds: [room], people } = await setup(6);
    const first = await groupOf(people[0], people.slice(1, 3));
    const second = await groupOf(people[3], people.slice(4, 6));
    const results = await Promise.allSettled([assignGroup(ACTOR, room, first), assignGroup(ACTOR, room, second)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await occupants(room)).toHaveLength(3);
  });
});

describe("the database", () => {
  it("blocks placements that break the rules even when the code is bypassed", async () => {
    const { camp, roomTypeId, roomIds: [room], people } = await setup(5);
    const place = (registrationId: string) =>
      query("app", "INSERT INTO camp_room_assignments (room_id, registration_id, assigned_by) VALUES (?, ?, 'raw')", [
        room,
        registrationId,
      ]);
    const man = await paidUp(camp, roomTypeId, { gender: "male" });
    await expect(place(man.id)).rejects.toThrow();
    const { id: unpaid } = await register(camp, attendee(roomTypeId));
    await expect(place(unpaid)).rejects.toThrow();
    for (const p of people.slice(0, 4)) await place(p.id);
    await expect(place(people[4].id)).rejects.toThrow(); // full
    await expect(query("app", "UPDATE camp_room_assignments SET room_id = room_id WHERE room_id = ?", [room])).rejects.toThrow();
  });
});

describe("editing and deleting rooms", () => {
  it("won't shrink a room below the people in it", async () => {
    const { roomTypeId, roomIds: [room], people } = await setup(3);
    for (const p of people) await assignPerson(ACTOR, room, p.id);
    const edit = (capacity: number, gender: Gender = "female") =>
      updateRoom(ACTOR, room, { label: "A1", room_type_id: roomTypeId, gender, capacity });
    await expect(edit(2)).rejects.toThrow("has 3 people in it");
    await expect(query("app", "UPDATE camp_rooms SET capacity = 2 WHERE id = ?", [room])).rejects.toThrow();
    await edit(3);
    expect((await listRooms((await getRegistration(people[0].id))!.camp_id))[0]).toMatchObject({ capacity: 3, occupied: 3 });
  });

  it("won't change an occupied room's gender or type, but will once it's empty", async () => {
    const { camp, roomTypeId, roomIds: [room], people: [a] } = await setup(1);
    await assignPerson(ACTOR, room, a.id);
    await expect(updateRoom(ACTOR, room, { label: "A1", room_type_id: roomTypeId, gender: "male", capacity: 4 })).rejects.toThrow(
      "Empty it",
    );
    const suite = await createRoomType(ACTOR, camp.id, { name: "Suite", price_pesewas: 1, capacity: 2 });
    await expect(query("app", "UPDATE camp_rooms SET room_type_id = ? WHERE id = ?", [suite, room])).rejects.toThrow();

    await unassign(ACTOR, a.id);
    await updateRoom(ACTOR, room, { label: "A1", room_type_id: roomTypeId, gender: "male", capacity: 4 });
  });

  it("returns a deleted room's occupants to Unassigned and names them in the audit log", async () => {
    const { roomIds: [room], people: [a, b] } = await setup(2);
    await assignPerson(ACTOR, room, a.id);
    await assignPerson(ACTOR, room, b.id);
    expect(await deleteRoom(ACTOR, room)).toEqual({ unassigned: 2 });
    expect(await getMyRoom(a.id)).toBeNull();
    const [entry] = await query<{ before_json: string }>(
      "app",
      "SELECT before_json FROM camp_audit_log WHERE entity_id = ? AND action = 'room.delete'",
      [room],
    );
    expect(JSON.parse(entry.before_json).occupants.map((o: { full_name: string }) => o.full_name).sort()).toEqual([
      "Person1 Surname",
      "Person2 Surname",
    ]);
  });
});

describe("removing people", () => {
  it("frees the bed and leaves the roommate group alone", async () => {
    const { roomIds: [room], people: [owner, a] } = await setup(2);
    const group = await groupOf(owner, [a]);
    await assignGroup(ACTOR, room, group);
    await unassign(ACTOR, a.id);
    expect(await occupants(room)).toEqual([owner.id]);
    expect((await getGroupFor(a.id))!.id).toBe(group);
    await expect(unassign(ACTOR, a.id)).rejects.toThrow("isn't in a room");
  });

  it("happens when a registration is cancelled", async () => {
    const { roomIds: [room], people: [a, b] } = await setup(2);
    await assignPerson(ACTOR, room, a.id);
    await assignPerson(ACTOR, room, b.id);
    await cancelRegistration(ACTOR, a.id);
    expect(await occupants(room)).toEqual([b.id]);
  });
});

describe("what people see", () => {
  it("shows an attendee their room and roommates' first names", async () => {
    const { roomIds: [room], people: [a, b, c] } = await setup(3);
    expect(await getMyRoom(a.id)).toBeNull();
    for (const p of [a, b, c]) await assignPerson(ACTOR, room, p.id);
    expect(await getMyRoom(a.id)).toEqual({ label: "A1", room_type_name: "Hostel", roommates: ["Person2", "Person3"] });
  });

  it("gives the coordinator pools, waiting groups and unmatched people", async () => {
    const { camp, roomTypeId, roomIds: [room], people } = await setup(6, [{ label: "A1" }, { label: "A2" }]);
    const [owner, member, placed, ...unmatched] = people;
    const group = await groupOf(owner, [member]);
    await assignPerson(ACTOR, room, placed.id);
    await paidUp(camp, roomTypeId, { gender: "male" });

    expect(await listPools(camp.id)).toEqual([
      { room_type_id: roomTypeId, room_type_name: "Hostel", gender: "female", fully_paid: 6, assigned: 1, beds: 8 },
      { room_type_id: roomTypeId, room_type_name: "Hostel", gender: "male", fully_paid: 1, assigned: 0, beds: 0 },
    ]);
    const board = await getPoolBoard(camp.id, roomTypeId, "female");
    expect(board.groups.map((g) => [g.id, g.members.length, g.state])).toEqual([[group, 2, "open"]]);
    expect(board.people.map((p) => p.id).sort()).toEqual(unmatched.map((p) => p.id).sort());
    expect(board.rooms.map((r) => [r.label, r.occupied, r.occupants.map((o) => o.registration_id)])).toEqual([
      ["A1", 1, [placed.id]],
      ["A2", 0, []],
    ]);
  });
});
