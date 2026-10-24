import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { changeRoomType } from "@/lib/camp/adjustments";
import { cancelRegistration, register } from "@/lib/camp/registrations";
import { createRoomType, getRoomType, setPlacesLeft } from "@/lib/camp/rooms";
import { ACTOR, attendee, openCamp } from "./helpers";

const left = async (id: string) => {
  const type = (await getRoomType(id))!;
  return { male: type.places_male, female: type.places_female };
};

describe("places left", () => {
  it("has no limit until a coordinator sets one", async () => {
    const { camp, roomTypeId } = await openCamp();
    expect(await left(roomTypeId)).toEqual({ male: null, female: null });
    for (let i = 0; i < 3; i++) await register(camp, attendee(roomTypeId));
    expect(await left(roomTypeId)).toEqual({ male: null, female: null });
  });

  it("counts down per gender and refuses registrations at 0", async () => {
    const { camp, roomTypeId } = await openCamp();
    await setPlacesLeft(ACTOR, roomTypeId, "female", 2);
    await register(camp, attendee(roomTypeId));
    await register(camp, attendee(roomTypeId, { gender: "male" }));
    expect(await left(roomTypeId)).toEqual({ male: null, female: 1 });
    await register(camp, attendee(roomTypeId));
    expect(await left(roomTypeId)).toEqual({ male: null, female: 0 });
    await expect(register(camp, attendee(roomTypeId))).rejects.toThrow("Hostel is full for women");
    // Men are unaffected.
    await register(camp, attendee(roomTypeId, { gender: "male" }));
  });

  it("never gives the last place to two people at once", async () => {
    const { camp, roomTypeId } = await openCamp();
    await setPlacesLeft(ACTOR, roomTypeId, "male", 1);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => register(camp, attendee(roomTypeId, { gender: "male" }))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await left(roomTypeId)).toEqual({ male: 0, female: null });
    const [{ n }] = await query<{ n: number }>(
      "app",
      "SELECT count(*) AS n FROM camp_registrations WHERE room_type_id = ? AND gender = 'male'",
      [roomTypeId],
    );
    expect(n).toBe(1);
  });

  it("holds at the database even if the friendly check is skipped", async () => {
    const { camp, roomTypeId } = await openCamp();
    await setPlacesLeft(ACTOR, roomTypeId, "female", 0);
    await expect(
      query(
        "app",
        `INSERT INTO camp_registrations (id, camp_id, room_type_id, full_name, phone, email, gender, fellowship, pfcc, church, price_pesewas, code_hash)
         VALUES (?, ?, ?, 'X', '233240000001', 'x@x.com', 'female', 'Qadash', 'PFCC 2', 'TACC', 60000, ?)`,
        [crypto.randomUUID(), camp.id, roomTypeId, crypto.randomUUID()],
      ),
    ).rejects.toThrow();
  });

  it("can be raised, set to full or cleared, and is audited", async () => {
    const { roomTypeId, camp } = await openCamp();
    await setPlacesLeft(ACTOR, roomTypeId, "female", 5);
    await setPlacesLeft(ACTOR, roomTypeId, "female", 0);
    await setPlacesLeft(ACTOR, roomTypeId, "female", null);
    expect(await left(roomTypeId)).toEqual({ male: null, female: null });
    const log = await query<{ before_json: string; after_json: string }>(
      "app",
      "SELECT before_json, after_json FROM camp_audit_log WHERE camp_id = ? AND action = 'room_type.places_left' ORDER BY id",
      [camp.id],
    );
    expect(log.map((e) => JSON.parse(e.after_json).places_left)).toEqual([5, 0, null]);
    await expect(setPlacesLeft(ACTOR, roomTypeId, "female", -1)).rejects.toThrow("whole number");
    await expect(setPlacesLeft(ACTOR, roomTypeId, "female", 2.5)).rejects.toThrow("whole number");
  });

  it("doesn't give a place back when someone cancels", async () => {
    const { camp, roomTypeId } = await openCamp();
    await setPlacesLeft(ACTOR, roomTypeId, "female", 1);
    const { id } = await register(camp, attendee(roomTypeId));
    await cancelRegistration(ACTOR, id);
    expect(await left(roomTypeId)).toEqual({ male: null, female: 0 });
  });

  it("takes a place when a coordinator moves someone in, and blocks it when full", async () => {
    const { camp, roomTypeId } = await openCamp();
    const hotel = await createRoomType(ACTOR, camp.id, { name: "Hotel", price_pesewas: 150000, capacity: 2 });
    await setPlacesLeft(ACTOR, hotel, "female", 1);
    const a = await register(camp, attendee(roomTypeId));
    const b = await register(camp, attendee(roomTypeId));
    await changeRoomType(ACTOR, a.id, hotel);
    expect(await left(hotel)).toEqual({ male: null, female: 0 });
    await expect(changeRoomType(ACTOR, b.id, hotel)).rejects.toThrow("Hotel is full for women");
  });

  it("goes when its room type is deleted", async () => {
    const { camp } = await openCamp();
    const villa = await createRoomType(ACTOR, camp.id, { name: "Villa", price_pesewas: 1000, capacity: 2 });
    await setPlacesLeft(ACTOR, villa, "male", 3);
    await query("app", "DELETE FROM camp_room_types WHERE id = ?", [villa]);
    const rows = await query("app", "SELECT * FROM camp_room_type_places WHERE room_type_id = ?", [villa]);
    expect(rows).toHaveLength(0);
  });
});
