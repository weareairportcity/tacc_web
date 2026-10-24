import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { formatGroupCode } from "@/lib/camp/codes";
import {
  acceptInvite,
  cancelInvite,
  createGroup,
  declineInvite,
  getGroupFor,
  invite,
  joinByCode,
  leaveGroup,
  listReceivedInvites,
  listSentInvites,
  removeMember,
  searchInvitees,
  setLocked,
} from "@/lib/camp/groups";
import { cancelRegistration, getRegistration, register } from "@/lib/camp/registrations";
import { createRoomType } from "@/lib/camp/rooms";
import type { Camp, Registration, RegistrationInput } from "@/lib/camp/types";
import { ACTOR, attendee, openCamp } from "./helpers";

// Roommate groups end to end: src/lib/camp/groups.ts → local Worker → D1,
// including the triggers that hold the rules when the code is bypassed.

/** Registers someone and marks them Fully Paid directly (payments are Phase 2's tests). */
async function paidUp(camp: Camp, roomTypeId: string, overrides: Partial<RegistrationInput> = {}): Promise<Registration> {
  const { id } = await register(camp, attendee(roomTypeId, overrides));
  await query("app", "UPDATE camp_registrations SET paid_pesewas = price_pesewas, status = 'fully_paid' WHERE id = ?", [id]);
  return (await getRegistration(id))!;
}

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

describe("locking", () => {
  it("freezes the group until the owner unlocks it", async () => {
    const { people: [owner, a, b] } = await campWith(3);
    await createGroup(owner);
    const code = await codeOf(owner);
    await joinByCode(a, code);

    await expect(setLocked(a, true)).rejects.toThrow("Only the group's owner");
    await setLocked(owner, true);
    expect((await getGroupFor(owner.id))!.state).toBe("locked");
    await expect(joinByCode(b, code)).rejects.toThrow("locked");
    await expect(leaveGroup(a)).rejects.toThrow("locked");
    await expect(removeMember(owner, a.id)).rejects.toThrow("locked");
    await expect(invite(owner, b.id)).rejects.toThrow("locked");
    await expect(query("app", "DELETE FROM camp_group_members WHERE registration_id = ?", [a.id])).rejects.toThrow();

    await setLocked(owner, false);
    await joinByCode(b, code);
    await leaveGroup(a);
    expect(await memberIds(owner)).toEqual([owner.id, b.id]);
  });

  it("happens to every group at the deadline, and the owner can't undo it", async () => {
    const { camp, people: [owner, a, b, c] } = await campWith(4);
    await createGroup(owner);
    const code = await codeOf(owner);
    await joinByCode(a, code);
    await pastDeadline(camp);

    expect((await getGroupFor(owner.id))!.state).toBe("final");
    await expect(joinByCode(b, code)).rejects.toThrow("deadline");
    await expect(leaveGroup(a)).rejects.toThrow("deadline");
    await expect(setLocked(owner, true)).rejects.toThrow("deadline");
    await expect(setLocked(owner, false)).rejects.toThrow("deadline");
    await expect(createGroup(c)).rejects.toThrow("deadline");
    // And straight at the database.
    await expect(query("app", "DELETE FROM camp_group_members WHERE registration_id = ?", [a.id])).rejects.toThrow();
    await expect(
      query("app", "UPDATE camp_groups SET locked_at = 'x' WHERE owner_registration_id = ?", [owner.id]),
    ).rejects.toThrow();
  });
});

describe("invites", () => {
  it("search shows only people who could join, without contact details", async () => {
    const { camp, roomTypeId, people: [owner, inGroup] } = await campWith(2);
    await createGroup(owner);
    await createGroup(inGroup);
    const match = await paidUp(camp, roomTypeId, { full_name: "Abena Owusu" });
    await paidUp(camp, roomTypeId, { full_name: "Abena Mensah", gender: "male" });
    await register(camp, attendee(roomTypeId, { full_name: "Abena Unpaid" }));

    const found = await searchInvitees(owner, "abena");
    expect(found).toEqual([{ id: match.id, full_name: "Abena Owusu", fellowship: "Qadash", invited: 0 }]);
    expect(await searchInvitees(owner, "Person 2")).toEqual([]); // already in a group
    expect(await searchInvitees(owner, "%")).toEqual([]); // wildcards are literal
    await expect(searchInvitees(inGroup, "x")).resolves.toEqual([]);
  });

  it("can be accepted, which joins the group and closes other invites", async () => {
    const { people: [owner, otherOwner, guest] } = await campWith(3);
    const groupId = await createGroup(owner);
    await createGroup(otherOwner);
    await invite(owner, guest.id);
    await invite(otherOwner, guest.id);
    await expect(invite(owner, guest.id)).rejects.toThrow("can't invite");

    const received = await listReceivedInvites(guest);
    expect(received).toHaveLength(2);
    const mine = received.find((i) => i.group_id === groupId)!;
    expect(mine).toMatchObject({ owner_name: "Person 1", member_count: 1, capacity: 4 });

    await acceptInvite(guest, mine.id);
    expect(await memberIds(owner)).toEqual([owner.id, guest.id]);
    expect(await listReceivedInvites(guest)).toEqual([]);
    expect(await listSentInvites(groupId)).toEqual([]);
  });

  it("can't be accepted into a full group, or once declined or withdrawn", async () => {
    const { people } = await campWith(7);
    const [owner, late, decliner, withdrawn] = people;
    await createGroup(owner);
    await invite(owner, late.id);
    await invite(owner, decliner.id);
    await invite(owner, withdrawn.id);
    const code = await codeOf(owner);
    for (const p of people.slice(4, 7)) await joinByCode(p, code);

    const inviteFor = async (r: Registration) => (await listReceivedInvites(r))[0].id;
    await expect(acceptInvite(late, await inviteFor(late))).rejects.toThrow("full");
    expect(await getGroupFor(late.id)).toBeNull();

    const declined = await inviteFor(decliner);
    await declineInvite(decliner, declined);
    await expect(acceptInvite(decliner, declined)).rejects.toThrow("no longer open");

    const sent = (await listSentInvites((await getGroupFor(owner.id))!.id)).find((i) => i.registration_id === withdrawn.id)!;
    await cancelInvite(owner, sent.id);
    await expect(acceptInvite(withdrawn, sent.id)).rejects.toThrow("no longer open");
  });

  it("can only be sent by the owner, to someone eligible", async () => {
    const { camp, roomTypeId, people: [owner, member, other] } = await campWith(3);
    await createGroup(owner);
    await joinByCode(member, await codeOf(owner));
    await expect(invite(member, other.id)).rejects.toThrow("Only the group's owner");
    const man = await paidUp(camp, roomTypeId, { gender: "male" });
    await expect(invite(owner, man.id)).rejects.toThrow("can't invite");
  });
});

describe("cancelling a registration", () => {
  it("removes the person from their group and closes their invites", async () => {
    const { people: [owner, a, b, c] } = await campWith(4);
    await createGroup(owner);
    await joinByCode(a, await codeOf(owner));
    const other = await createGroup(b);
    await invite(b, c.id);

    expect(await cancelRegistration(ACTOR, owner.id)).toEqual({ warning: null });
    const group = (await getGroupFor(a.id))!;
    expect(group.owner_registration_id).toBe(a.id);
    expect(group.members.map((m) => m.registration_id)).toEqual([a.id]);
    expect(await getGroupFor(owner.id)).toBeNull();

    await cancelRegistration(ACTOR, a.id);
    expect(await query("app", "SELECT id FROM camp_groups WHERE id = ?", [group.id])).toEqual([]);
    await cancelRegistration(ACTOR, c.id);
    expect(await listSentInvites(other)).toEqual([]);
  });

  it("works on a locked or final group and warns the coordinator", async () => {
    const { camp, people: [owner, a, b] } = await campWith(3);
    await createGroup(owner);
    const code = await codeOf(owner);
    await joinByCode(a, code);
    await joinByCode(b, code);
    await setLocked(owner, true);

    const { warning } = await cancelRegistration(ACTOR, a.id);
    expect(warning).toMatch(/locked roommate group.*2 of 4/);
    expect(await memberIds(owner)).toEqual([owner.id, b.id]);

    await pastDeadline(camp);
    expect((await cancelRegistration(ACTOR, b.id)).warning).toMatch(/final roommate group.*1 of 4/);
  });
});
