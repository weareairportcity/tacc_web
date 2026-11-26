import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { getMyRoom } from "@/lib/camp/assignments";
import { markScan } from "@/lib/camp/checkin";
import { createGroup, getGroupFor, joinByCode } from "@/lib/camp/groups";
import { listKeyBearers } from "@/lib/camp/key-bearers";
import { register } from "@/lib/camp/registrations";
import { ACTOR, attendee, openCamp, paidUp } from "./helpers";

// Checking in gives a bed; rooms opened at check-in fill up to the room type's beds, then another opens.

describe("checking in", () => {
  it("opens a room, fills it to the room type's beds, then opens the next, by gender", async () => {
    const { camp, roomTypeId } = await openCamp(); // Hostel: 4 beds a room
    const men = [];
    for (let i = 1; i <= 5; i++) men.push(await paidUp(camp, roomTypeId, { full_name: `Man Number${i} Test`, gender: "male" }));
    const woman = await paidUp(camp, roomTypeId, { full_name: "Woman Number Test", gender: "female" });

    const rooms: string[] = [];
    for (const m of men) {
      const r = await markScan(ACTOR, camp.id, m.id, "checkin");
      expect(r.already).toBe(false);
      expect(r.room?.placed).toBe(true);
      rooms.push(r.room!.label!);
      expect(r.person.room_label).toBe(r.room!.label);
    }
    expect(new Set(rooms.slice(0, 4)).size).toBe(1);
    expect(rooms[4]).not.toBe(rooms[0]);
    expect(rooms[0]).toMatch(/^M-/);
    const w = await markScan(ACTOR, camp.id, woman.id, "checkin");
    expect(w.room!.label).toMatch(/^W-/);
    // Never more beds than the room type allows.
    const counts = await query<{ n: number }>("app", "SELECT COUNT(*) AS n FROM camp_room_assignments a JOIN camp_rooms x ON x.id = a.room_id WHERE x.camp_id = ? GROUP BY x.id", [camp.id]);
    expect(Math.max(...counts.map((c) => c.n))).toBeLessThanOrEqual(4);
  });

  it("keeps the room someone already has (made, or joined by a friend's link) and doesn't tell them again", async () => {
    const { camp, roomTypeId } = await openCamp();
    const owner = await paidUp(camp, roomTypeId, { full_name: "Group Owner Test", gender: "male" });
    const friend = await paidUp(camp, roomTypeId, { full_name: "Group Friend Test", gender: "male" });
    await createGroup(owner);
    await joinByCode(friend, (await getGroupFor(owner.id))!.code);
    const room = (await getMyRoom(owner.id))!.label;
    for (const p of [owner, friend]) {
      const r = await markScan(ACTOR, camp.id, p.id, "checkin");
      expect(r.room).toMatchObject({ label: room, placed: false });
    }
  });

  it("refuses someone who hasn't paid in full", async () => {
    const { camp, roomTypeId } = await openCamp();
    const { id } = await register(camp, attendee(roomTypeId, { full_name: "Kojo Owing" }));
    await expect(markScan(ACTOR, camp.id, id, "checkin")).rejects.toThrow("is still outstanding");
    expect(await getMyRoom(id)).toBeNull();
  });
});

describe("key bearers", () => {
  it("are whoever made the room, or the first person put in it", async () => {
    const { camp, roomTypeId } = await openCamp();
    const owner = await paidUp(camp, roomTypeId, { full_name: "Group Owner Test", gender: "male" });
    const friend = await paidUp(camp, roomTypeId, { full_name: "Group Friend Test", gender: "male" });
    await createGroup(owner);
    await joinByCode(friend, (await getGroupFor(owner.id))!.code);
    const first = await paidUp(camp, roomTypeId, { full_name: "First Arrival Test", gender: "female" });
    const second = await paidUp(camp, roomTypeId, { full_name: "Second Arrival Test", gender: "female" });
    await markScan(ACTOR, camp.id, first.id, "checkin");
    await markScan(ACTOR, camp.id, second.id, "checkin");

    const { rows } = await listKeyBearers(camp.id);
    const byName = Object.fromEntries(rows.map((r) => [r.bearer.full_name, r.why]));
    expect(byName).toEqual({ "Group Owner Test": "made", "First Arrival Test": "first" });
    expect(rows).toHaveLength(2);
  });
});
