import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { assignPerson, getMyRoom } from "@/lib/camp/assignments";
import { changeGender, roomsFor } from "@/lib/camp/gender";
import { createGroup, getGroupFor, joinByCode, setLocked } from "@/lib/camp/groups";
import { getRegistration, register } from "@/lib/camp/registrations";
import { createRoom, listRoomTypes, setPlacesLeft } from "@/lib/camp/rooms";
import { listHistory } from "@/lib/camp/reports";
import type { Gender, Registration } from "@/lib/camp/types";
import { ACTOR, attendee, openCamp, paidUp } from "./helpers";

// Changing someone's gender keeps their room and group the same gender as them.

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** A camp with a men's and a women's Hostel room, and two men in a group in the men's room. */
async function setup(rooms: { label: string; gender: Gender; capacity?: number }[] = [{ label: "B1", gender: "male" }, { label: "A1", gender: "female" }]) {
  const { camp, roomTypeId } = await openCamp();
  const ids: Record<string, string> = {};
  for (const r of rooms) ids[r.label] = await createRoom(ACTOR, camp.id, { label: r.label, room_type_id: roomTypeId, gender: r.gender, capacity: r.capacity ?? 4 });
  const esi = await paidUp(camp, roomTypeId, { full_name: "Esi Anyen", gender: "male" });
  const kofi = await paidUp(camp, roomTypeId, { full_name: "Kofi Boateng", gender: "male" });
  await createGroup(esi);
  await joinByCode(kofi, (await getGroupFor(esi.id))!.code);
  await assignPerson(ACTOR, ids.B1, esi.id);
  return { camp, roomTypeId, rooms: ids, esi, kofi };
}

describe("a coordinator changing someone's gender", () => {
  it("takes them out of their group and room, and can place them in a room of the new gender", async () => {
    const { camp, rooms, esi, kofi } = await setup();
    expect((await roomsFor(esi, "female")).map((r) => [r.label, r.free])).toEqual([["A1", 4]]);

    const r = await changeGender(ACTOR, esi.id, "female", { roomId: rooms.A1 });
    expect(r.warning).toBe("Esi Anyen left their roommate group, left room B1, is now in A1.");
    expect((await getRegistration(esi.id))!.gender).toBe("female");
    expect((await getMyRoom(esi.id))!.label).toBe("A1");
    expect(await getGroupFor(esi.id)).toBeNull();
    // The group carries on with Kofi, who now owns it.
    const group = (await getGroupFor(kofi.id))!;
    expect(group.members.map((m) => m.full_name)).toEqual(["Kofi Boateng"]);
    const actions = (await listHistory(camp.id, {})).filter((e) => e.entity_id === esi.id || e.entity_id === rooms.A1).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["registration.gender_change", "room.unassign", "room.assign"]));
  });

  it("without a room, leaves them unplaced", async () => {
    const { esi } = await setup();
    expect((await changeGender(ACTOR, esi.id, "female")).warning).toBe("Esi Anyen left their roommate group, left room B1.");
    expect(await getMyRoom(esi.id)).toBeNull();
  });

  it("never into a room of the old gender, a full room, or a room before they've paid", async () => {
    const { camp, roomTypeId, rooms, esi } = await setup([
      { label: "B1", gender: "male" },
      { label: "A1", gender: "female", capacity: 1 },
    ]);
    await expect(changeGender(ACTOR, esi.id, "female", { roomId: rooms.B1 })).rejects.toThrow("Pick a women's Hostel room with a free bed.");
    const ama = await paidUp(camp, roomTypeId, { full_name: "Ama Mensah" });
    await assignPerson(ACTOR, rooms.A1, ama.id);
    await expect(changeGender(ACTOR, esi.id, "female", { roomId: rooms.A1 })).rejects.toThrow("free bed");
    // Nothing changed.
    expect((await getRegistration(esi.id))!.gender).toBe("male");
    expect((await getMyRoom(esi.id))!.label).toBe("B1");

    const { id } = await register(camp, attendee(roomTypeId, { full_name: "Yaw Owing", gender: "male" }));
    await query("app", "UPDATE camp_rooms SET capacity = 4 WHERE id = ?", [rooms.A1]);
    await expect(changeGender(ACTOR, id, "female", { roomId: rooms.A1 })).rejects.toThrow("isn't fully paid");
  });

  it("takes a place for the new gender, and refuses when there are none", async () => {
    const { camp, roomTypeId, esi, kofi } = await setup();
    await setPlacesLeft(ACTOR, roomTypeId, "female", 1);
    await changeGender(ACTOR, esi.id, "female");
    const type = (await listRoomTypes(camp.id)).find((t) => t.id === roomTypeId)!;
    expect(type.places_female).toBe(0);
    await expect(changeGender(ACTOR, kofi.id, "female")).rejects.toThrow("Hostel is full for women.");
    await expect(changeGender(ACTOR, esi.id, "female")).rejects.toThrow("already down as female");
  });

  it("works even when their group is locked after the deadline", async () => {
    const { camp, esi, kofi } = await setup();
    await setLocked(esi, true);
    await query("app", "UPDATE camps SET roommate_deadline_on = ? WHERE id = ?", [day(-1), camp.id]);
    await changeGender(ACTOR, kofi.id, "female");
    expect(await getGroupFor(kofi.id)).toBeNull();
    expect((await getGroupFor(esi.id))!.members.length).toBe(1);
  });
});

describe("an attendee changing their own gender", () => {
  it("can until the roommate deadline, and leaves their group and room", async () => {
    const { camp, esi } = await setup();
    const r = await changeGender(`attendee:${esi.id}`, esi.id, "female", { attendee: true });
    expect(r).toMatchObject({ group: true, oldRoom: "B1", room: null });
    expect(await getMyRoom(esi.id)).toBeNull();

    await query("app", "UPDATE camps SET roommate_deadline_on = ? WHERE id = ?", [day(-1), camp.id]);
    const me = (await getRegistration(esi.id)) as Registration;
    await expect(changeGender(`attendee:${me.id}`, me.id, "male", { attendee: true })).rejects.toThrow("ask one");
  });
});
