import { describe, expect, it } from "vitest";
import { planFill } from "@/lib/camp/fill";
import { formatCode, generateSignInCode, normalizeCode, SIGN_IN_DIGITS } from "@/lib/camp/codes";
import type { RoomWithOccupants, WaitingGroup, WaitingPerson } from "@/lib/camp/types";

const room = (id: string, capacity: number, occupied = 0) =>
  ({ id, camp_id: "c", room_type_id: "t", room_type_name: "Hostel", label: id, gender: "female", capacity, occupied, occupants: [] }) as unknown as RoomWithOccupants;
const group = (id: string, names: string[], placedIn: string | null = null): WaitingGroup => ({
  id,
  code: id,
  state: "final",
  capacity: 4,
  members: names.map((n, i) => ({ registration_id: `${id}-${i}`, full_name: n, fellowship: "Zion", joined_at: "", room_label: i === 0 ? placedIn : null })),
});
const person = (id: string, fellowship: string): WaitingPerson => ({ id, full_name: id, fellowship, any_room: 0 });

describe("Fill rooms for me", () => {
  it("keeps a group together in the room that fits it most tightly", () => {
    const plan = planFill({ rooms: [room("A", 6), room("B", 3)], groups: [group("g", ["Ama", "Esi", "Akua"])], people: [] });
    expect(plan.steps).toEqual([{ kind: "group", groupId: "g", roomId: "B", names: ["Ama", "Esi", "Akua"] }]);
  });

  it("never splits a group, and says why it couldn't place one", () => {
    const plan = planFill({ rooms: [room("A", 2), room("B", 2)], groups: [group("g", ["Ama", "Esi", "Akua"])], people: [] });
    expect(plan.steps).toEqual([]);
    expect(plan.left[0].reason).toMatch(/3 beds free together/);
  });

  it("puts the rest of a part-placed group with the ones already in a room", () => {
    const plan = planFill({ rooms: [room("A", 4, 1), room("B", 4)], groups: [group("g", ["Ama", "Esi"], "A")], people: [] });
    expect(plan.steps).toEqual([{ kind: "group", groupId: "g", roomId: "A", names: ["Esi"] }]);
  });

  it("seats people beside their fellowship and never over a room's beds", () => {
    const people = [person("z1", "Zion"), person("b1", "Bethel"), person("z2", "Zion"), person("b2", "Bethel"), person("x", "Qadash")];
    const plan = planFill({ rooms: [room("A", 2), room("B", 2)], groups: [], people });
    const where = Object.fromEntries(plan.steps.map((s) => [s.names[0], s.roomId]));
    expect(where.b1).toBe(where.b2);
    expect(plan.rooms.every((r) => r.names.length <= 2)).toBe(true);
    expect(plan.left).toEqual([{ names: ["z2"], reason: "No beds left in this room type." }]);
  });
});

describe("sign-in codes", () => {
  it("are 12 digits, read out in fours", () => {
    for (let i = 0; i < 200; i++) expect(generateSignInCode()).toMatch(/^\d{12}$/);
    expect(SIGN_IN_DIGITS).toBe(12);
    expect(formatCode("483122071693")).toBe("4831 2207 1693");
    expect(normalizeCode("4831 2207 1693")).toBe("483122071693");
    // Codes given out before keep their look.
    expect(formatCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });
});
