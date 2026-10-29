import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { formatGroupCode } from "@/lib/camp/codes";
import { createGroup, getGroupFor, joinByCode, leaveGroup, removeMember } from "@/lib/camp/groups";
import { cancelRegistration, getRegistration, register } from "@/lib/camp/registrations";
import { createRoomType } from "@/lib/camp/rooms";
import type { Camp, Registration } from "@/lib/camp/types";
import { ACTOR, attendee, openCamp, paidUp } from "./helpers";

// Roommate groups end to end: src/lib/camp/groups.ts → local Worker → D1,
// including the triggers that hold the rules when the code is bypassed.

/** A camp with a four-bed room type and `n` Fully Paid women for it. */
async function campWith(n: number) {
  const { camp, roomTypeId } = await openCamp();
  const people: Registration[] = [];
  for (let i = 0; i < n; i++) people.push(await paidUp(camp, roomTypeId, { full_name: `Person ${i + 1}` }));
  return { camp, roomTypeId, people };
}

const codeOf = async (me: Registration) => (await getGroupFor(me.id))!.code;
const memberIds = async (me: Registration) => (await getGroupFor(me.id))?.members.map((m) => m.registration_id) ?? [];
const pastDeadline = (camp: Camp) =>
  query("app", "UPDATE camps SET roommate_deadline_on = date('now', '-1 day') WHERE id = ?", [camp.id]);
const auditActions = async (groupId: string) =>
  (await query<{ action: string }>("app", "SELECT action FROM camp_audit_log WHERE entity_id = ? ORDER BY id", [groupId])).map(
    (r) => r.action,
  );

describe("creating a group", () => {
  it("makes the creator owner and only member, with a 6-character code", async () => {
    const { people: [ama] } = await campWith(1);
    const id = await createGroup(ama);
    const group = (await getGroupFor(ama.id))!;
    expect(group).toMatchObject({ id, owner_registration_id: ama.id, state: "open", capacity: 4, gender: "female" });
    expect(group.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(group.members.map((m) => m.registration_id)).toEqual([ama.id]);
    expect(await auditActions(id)).toEqual(["group.create"]);
    await expect(createGroup(ama)).rejects.toThrow("already in a group");
  });

  it("is only for Fully Paid attendees", async () => {
    const { camp, roomTypeId } = await openCamp();
    const { id } = await register(camp, attendee(roomTypeId));
    await expect(createGroup((await getRegistration(id))!)).rejects.toThrow("fully paid");
  });
});

describe("joining by code", () => {
  it("accepts the code in any case, with or without the dash", async () => {
    const { people: [owner, a, b] } = await campWith(3);
    await createGroup(owner);
    const code = await codeOf(owner);
    await joinByCode(a, formatGroupCode(code).toLowerCase());
    await joinByCode(b, ` ${code} `);
    expect(await memberIds(owner)).toEqual([owner.id, a.id, b.id]);
  });

  it("enforces gender, room type, camp, payment and one group each", async () => {
    const { camp, roomTypeId, people: [owner, other] } = await campWith(2);
    await createGroup(owner);
    const code = await codeOf(owner);

    const man = await paidUp(camp, roomTypeId, { gender: "male" });
    await expect(joinByCode(man, code)).rejects.toThrow("other gender");

    const suite = await createRoomType(ACTOR, camp.id, { name: "Suite", price_pesewas: 90000, capacity: 2 });
    const suiteGuest = await paidUp(camp, suite);
    await expect(joinByCode(suiteGuest, code)).rejects.toThrow("Hostel");

    const elsewhere = await campWith(1);
    await expect(joinByCode(elsewhere.people[0], code)).rejects.toThrow("doesn't match a group for this camp");

    const { id: unpaidId } = await register(camp, attendee(roomTypeId));
    await expect(joinByCode((await getRegistration(unpaidId))!, code)).rejects.toThrow("fully paid");

    await createGroup(other);
    await expect(joinByCode(other, code)).rejects.toThrow("already in a group");
    expect(await memberIds(owner)).toEqual([owner.id]);
  });

  it("refuses a full group", async () => {
    const { people } = await campWith(5);
    await createGroup(people[0]);
    const code = await codeOf(people[0]);
    for (const p of people.slice(1, 4)) await joinByCode(p, code);
    await expect(joinByCode(people[4], code)).rejects.toThrow("full");
  });

  it("lets only one of many take the last place at the same moment", async () => {
    const { people } = await campWith(13);
    const [owner, a, b, ...rest] = people;
    await createGroup(owner);
    const code = await codeOf(owner);
    await joinByCode(a, code);
    await joinByCode(b, code);

    const results = await Promise.allSettled(rest.map((p) => joinByCode(p, code)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await memberIds(owner)).toHaveLength(4);
    const [{ n }] = await query<{ n: number }>(
      "app",
      "SELECT COUNT(*) AS n FROM camp_group_members WHERE group_id = (SELECT group_id FROM camp_group_members WHERE registration_id = ?)",
      [owner.id],
    );
    expect(n).toBe(4);
  });

  it("fills an empty group exactly to capacity when everyone joins at once", async () => {
    const { people } = await campWith(11);
    await createGroup(people[0]);
    const code = await codeOf(people[0]);
    const results = await Promise.allSettled(people.slice(1).map((p) => joinByCode(p, code)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await memberIds(people[0])).toHaveLength(4);
  });

  it("is rate-limited, so codes can't be guessed", async () => {
    const { people: [me] } = await campWith(1);
    for (let i = 0; i < 10; i++) await expect(joinByCode(me, "ZZZZZZ")).rejects.toThrow("doesn't match");
    await expect(joinByCode(me, "ZZZZZZ")).rejects.toThrow("Too many attempts");
  });
});

describe("the database", () => {
  it("blocks joins that break the rules even when the code is bypassed", async () => {
    const { camp, roomTypeId, people } = await campWith(5);
    const groupId = await createGroup(people[0]);
    const add = (registrationId: string) =>
      query("app", "INSERT INTO camp_group_members (group_id, registration_id) VALUES (?, ?)", [groupId, registrationId]);

    const man = await paidUp(camp, roomTypeId, { gender: "male" });
    await expect(add(man.id)).rejects.toThrow();
    const { id: unpaid } = await register(camp, attendee(roomTypeId));
    await expect(add(unpaid)).rejects.toThrow();

    for (const p of people.slice(1, 4)) await add(p.id);
    await expect(add(people[4].id)).rejects.toThrow(); // full
    await expect(query("app", "UPDATE camp_groups SET gender = 'male' WHERE id = ?", [groupId])).rejects.toThrow();
  });

  it("allows one group per person", async () => {
    const { people: [a, b] } = await campWith(2);
    await createGroup(a);
    const other = await createGroup(b);
    await expect(
      query("app", "INSERT INTO camp_group_members (group_id, registration_id) VALUES (?, ?)", [other, a.id]),
    ).rejects.toThrow();
  });
});

describe("leaving and removing", () => {
  it("hands ownership to the longest-standing member, and deletes an empty group", async () => {
    const { people: [owner, first, second] } = await campWith(3);
    const groupId = await createGroup(owner);
    const code = await codeOf(owner);
    await joinByCode(first, code);
    await joinByCode(second, code);

    await leaveGroup(owner);
    expect((await getGroupFor(first.id))!.owner_registration_id).toBe(first.id);
    await leaveGroup(second);
    await leaveGroup(first);
    expect(await query("app", "SELECT id FROM camp_groups WHERE id = ?", [groupId])).toEqual([]);
    expect(await auditActions(groupId)).toEqual(["group.create", "group.join", "group.join", "group.leave", "group.leave", "group.leave"]);
  });

  it("lets only the owner remove members", async () => {
    const { people: [owner, a, b] } = await campWith(3);
    await createGroup(owner);
    const code = await codeOf(owner);
    await joinByCode(a, code);
    await joinByCode(b, code);
    await expect(removeMember(a, b.id)).rejects.toThrow("Only the group's owner");
    await removeMember(owner, b.id);
    expect(await memberIds(owner)).toEqual([owner.id, a.id]);
    expect(await getGroupFor(b.id)).toBeNull();
  });
});

describe("closing", () => {
  it("never happens by hand: no locking, and no invites by name", async () => {
    const { people: [owner, a, b] } = await campWith(3);
    const groupId = await createGroup(owner);
    const code = await codeOf(owner);
    await joinByCode(a, code);

    await expect(
      query("app", "UPDATE camp_groups SET locked_at = 'x' WHERE id = ?", [groupId]),
    ).rejects.toThrow();
    await expect(
      query("app", "INSERT INTO camp_group_invites (id, group_id, registration_id, invited_by) VALUES (?, ?, ?, ?)", [
        crypto.randomUUID(),
        groupId,
        b.id,
        owner.id,
      ]),
    ).rejects.toThrow();
    await joinByCode(b, code);
    await leaveGroup(a);
    expect(await memberIds(owner)).toEqual([owner.id, b.id]);
  });

  it("happens to every group at the deadline", async () => {
    const { camp, people: [owner, a, b, c] } = await campWith(4);
    await createGroup(owner);
    const code = await codeOf(owner);
    await joinByCode(a, code);
    await pastDeadline(camp);

    expect((await getGroupFor(owner.id))!.state).toBe("final");
    await expect(joinByCode(b, code)).rejects.toThrow("deadline");
    await expect(leaveGroup(a)).rejects.toThrow("deadline");
    await expect(removeMember(owner, a.id)).rejects.toThrow("deadline");
    await expect(createGroup(c)).rejects.toThrow("deadline");
    // And straight at the database.
    await expect(query("app", "DELETE FROM camp_group_members WHERE registration_id = ?", [a.id])).rejects.toThrow();
  });
});

describe("cancelling a registration", () => {
  it("removes the person from their group", async () => {
    const { people: [owner, a] } = await campWith(2);
    await createGroup(owner);
    await joinByCode(a, await codeOf(owner));

    expect(await cancelRegistration(ACTOR, owner.id)).toEqual({ warning: null });
    const group = (await getGroupFor(a.id))!;
    expect(group.owner_registration_id).toBe(a.id);
    expect(group.members.map((m) => m.registration_id)).toEqual([a.id]);
    expect(await getGroupFor(owner.id)).toBeNull();

    await cancelRegistration(ACTOR, a.id);
    expect(await query("app", "SELECT id FROM camp_groups WHERE id = ?", [group.id])).toEqual([]);
  });

  it("works on a group closed by the deadline and warns the coordinator", async () => {
    const { camp, people: [owner, a, b] } = await campWith(3);
    await createGroup(owner);
    const code = await codeOf(owner);
    await joinByCode(a, code);
    await joinByCode(b, code);

    expect((await cancelRegistration(ACTOR, a.id)).warning).toBeNull();
    expect(await memberIds(owner)).toEqual([owner.id, b.id]);

    await pastDeadline(camp);
    expect((await cancelRegistration(ACTOR, b.id)).warning).toMatch(/closed by the deadline.*1 of 4/);
  });
});
