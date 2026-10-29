import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { GROUP_CODE_LENGTH, generateGroupCode, normalizeCode } from "./codes";
import { allow } from "./rate-limit";
import { todayInGhana } from "./registrations";
import { CampError, type Group, type GroupMember, type GroupState, type Registration } from "./types";

/**
 * Roommate groups. The one way in is the group's link (its code); there are
 * no invites by name and no locking: a group stays open until it's full or
 * the roommate deadline passes.
 *
 * D1 has no row locks, so every change is one guarded statement: the WHERE
 * clause holds the rule (open, room left, eligible) and the database applies
 * it atomically, which is what stops two people taking the last place. When a guard matches nothing, `explain` reads the state to
 * say why. Migration 0006's triggers repeat the rules as a backstop.
 *
 * Callers pass the signed-in attendee's own registration; nothing here trusts
 * an id from the browser to say who is acting.
 */

const actorOf = (me: Registration) => `attendee:${me.id}`;
const MINUTE = 60 * 1000;

// SQL for "this group can still change", with g = camp_groups and c = camps.
const OPEN = "date('now') <= c.roommate_deadline_on";
const PASSED = "The roommate deadline has passed, so groups can't change.";

export function groupState(g: { roommate_deadline_on: string }, today = todayInGhana()): GroupState {
  return today > g.roommate_deadline_on ? "final" : "open";
}

type GroupRow = Omit<Group, "state" | "members">;

const GROUP_SELECT = `SELECT g.id, g.camp_id, g.room_type_id, t.name AS room_type_name, g.gender, g.code,
    g.owner_registration_id, t.capacity, c.roommate_deadline_on
  FROM camp_groups g JOIN camp_room_types t ON t.id = g.room_type_id JOIN camps c ON c.id = g.camp_id`;

async function loadGroup(where: string, params: unknown[]): Promise<Group | null> {
  const [row] = await query<GroupRow>("app", `${GROUP_SELECT} WHERE ${where}`, params);
  if (!row) return null;
  const members = await query<GroupMember>(
    "app",
    `SELECT m.registration_id, r.full_name, r.fellowship, m.joined_at
     FROM camp_group_members m JOIN camp_registrations r ON r.id = m.registration_id
     WHERE m.group_id = ? ORDER BY m.joined_at, m.rowid`,
    [row.id],
  );
  return { ...row, state: groupState(row), members };
}

/** The group this registration is in, or null. */
export function getGroupFor(registrationId: string) {
  return loadGroup("g.id = (SELECT group_id FROM camp_group_members WHERE registration_id = ?)", [
    checkId(registrationId, "registration"),
  ]);
}

function requireFullyPaid(me: Registration) {
  if (me.status !== "fully_paid") throw new CampError("Roommate groups open once you're fully paid.");
}

function requireOpen(group: Group) {
  if (group.state === "final") throw new CampError(PASSED);
}

async function requireOwnGroup(me: Registration) {
  const group = await getGroupFor(me.id);
  if (!group) throw new CampError("You're not in a group.");
  return group;
}

async function requireOwner(me: Registration) {
  const group = await requireOwnGroup(me);
  if (group.owner_registration_id !== me.id) throw new CampError("Only the group's owner can do that.");
  return group;
}

async function deadlinePassed(campId: string) {
  const [camp] = await query<{ roommate_deadline_on: string }>("app", "SELECT roommate_deadline_on FROM camps WHERE id = ?", [
    campId,
  ]);
  return !camp || todayInGhana() > camp.roommate_deadline_on;
}

// ─── Creating and joining ────────────────────────────────────────────────────

/** Starts a group with `me` as its owner and only member. Returns the group id. */
export async function createGroup(me: Registration): Promise<string> {
  requireFullyPaid(me);
  if (await getGroupFor(me.id)) throw new CampError("You're already in a group. Leave it first.");
  if (await deadlinePassed(me.camp_id)) throw new CampError("The roommate deadline has passed.");

  const id = crypto.randomUUID();
  const code = generateGroupCode();
  const results = await batch("app", [
    {
      sql: `INSERT INTO camp_groups (id, camp_id, room_type_id, gender, code, owner_registration_id)
            SELECT ?, r.camp_id, r.room_type_id, r.gender, ?, r.id
            FROM camp_registrations r JOIN camps c ON c.id = r.camp_id
            WHERE r.id = ? AND r.status = 'fully_paid' AND date('now') <= c.roommate_deadline_on
              AND NOT EXISTS (SELECT 1 FROM camp_group_members m WHERE m.registration_id = r.id)
            RETURNING id`,
      params: [id, code, me.id],
    },
    auditStatement({
      actor: actorOf(me),
      campId: me.camp_id,
      action: "group.create",
      entity: "group",
      entityId: id,
      after: { code, room_type_id: me.room_type_id, gender: me.gender },
      ifChanged: true,
    }),
    {
      sql: "INSERT INTO camp_group_members (group_id, registration_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM camp_groups WHERE id = ?)",
      params: [id, me.id, id],
    },
  ]);
  if (!results[0].results.length) throw new CampError("You're already in a group. Leave it first.");
  return id;
}

/** One guarded insert: open, room left, same camp, room type and gender, Fully Paid, in no other group. */
function joinStatement(groupId: string, registrationId: string) {
  return {
    sql: `INSERT INTO camp_group_members (group_id, registration_id)
          SELECT g.id, r.id FROM camp_groups g
          JOIN camps c ON c.id = g.camp_id
          JOIN camp_room_types t ON t.id = g.room_type_id
          JOIN camp_registrations r ON r.id = ?
          WHERE g.id = ? AND ${OPEN}
            AND r.camp_id = g.camp_id AND r.room_type_id = g.room_type_id AND r.gender = g.gender
            AND r.status = 'fully_paid'
            AND (SELECT COUNT(*) FROM camp_group_members m WHERE m.group_id = g.id) < t.capacity
            AND NOT EXISTS (SELECT 1 FROM camp_group_members m WHERE m.registration_id = r.id)
          RETURNING group_id`,
    params: [registrationId, groupId],
  };
}

/** Why `me` couldn't join `groupId`, as a message for them. */
async function explainJoin(me: Registration, groupId: string): Promise<CampError> {
  const group = await loadGroup("g.id = ?", [groupId]);
  if (!group || group.camp_id !== me.camp_id) return new CampError("That code doesn't match a group for this camp.");
  if (me.status !== "fully_paid") return new CampError("Roommate groups open once you're fully paid.");
  if (group.members.some((m) => m.registration_id === me.id)) return new CampError("You're already in this group.");
  if (await getGroupFor(me.id)) return new CampError("You're already in a group. Leave it first.");
  if (group.gender !== me.gender) return new CampError("That group is for the other gender: rooms are single-gender.");
  if (group.room_type_id !== me.room_type_id) {
    return new CampError(`That group is for ${group.room_type_name}. You booked ${me.room_type_name}.`);
  }
  if (group.state === "final") return new CampError(PASSED);
  if (group.members.length >= group.capacity) return new CampError("That group is full.");
  return new CampError("You couldn't join that group. Please try again.");
}

async function join(me: Registration, groupId: string) {
  const results = await batch("app", [
    joinStatement(groupId, me.id),
    auditStatement({
      actor: actorOf(me),
      campId: me.camp_id,
      action: "group.join",
      entity: "group",
      entityId: groupId,
      after: { registration_id: me.id },
      ifChanged: true,
    }),
  ]);
  if (!results[0].results.length) throw await explainJoin(me, groupId);
}

/** Joins the group with this code. Rate-limited per attendee so codes can't be guessed. */
export async function joinByCode(me: Registration, rawCode: string): Promise<string> {
  requireFullyPaid(me);
  if (!(await allow(`group-join:${me.id}`, 10, 15 * MINUTE))) {
    throw new CampError("Too many attempts. Please wait a few minutes and try again.");
  }
  const code = normalizeCode(rawCode);
  const [group] =
    code.length === GROUP_CODE_LENGTH
      ? await query<{ id: string }>("app", "SELECT id FROM camp_groups WHERE code = ? AND camp_id = ?", [code, me.camp_id])
      : [];
  if (!group) throw new CampError("That code doesn't match a group for this camp.");
  await join(me, group.id);
  return group.id;
}

/** A group by the code in a join link, for "Join Abena's room?". Null if there's none in this camp. */
export async function getGroupByCode(campId: string, rawCode: string) {
  const code = normalizeCode(rawCode);
  if (code.length !== GROUP_CODE_LENGTH) return null;
  return loadGroup("g.code = ? AND g.camp_id = ?", [code, checkId(campId, "camp")]);
}

// ─── Leaving and removing ──────────────────────────────────────────────────

/**
 * Statements that run after a member has gone: ownership passes to the
 * longest-standing member, and an empty group is deleted.
 */
function afterLeaving(groupId: string, leaverId: string) {
  return [
    {
      sql: `UPDATE camp_groups SET owner_registration_id = (
              SELECT registration_id FROM camp_group_members WHERE group_id = ? ORDER BY joined_at, rowid LIMIT 1)
            WHERE id = ? AND owner_registration_id = ?
              AND NOT EXISTS (SELECT 1 FROM camp_group_members WHERE group_id = ? AND registration_id = ?)
              AND EXISTS (SELECT 1 FROM camp_group_members WHERE group_id = ?)`,
      params: [groupId, groupId, leaverId, groupId, leaverId, groupId],
    },
    {
      sql: "DELETE FROM camp_groups WHERE id = ? AND NOT EXISTS (SELECT 1 FROM camp_group_members WHERE group_id = ?)",
      params: [groupId, groupId],
    },
  ];
}

export async function leaveGroup(me: Registration) {
  const group = await requireOwnGroup(me);
  requireOpen(group);
  const results = await batch("app", [
    {
      sql: `DELETE FROM camp_group_members WHERE registration_id = ? AND group_id IN (
              SELECT g.id FROM camp_groups g JOIN camps c ON c.id = g.camp_id WHERE g.id = ? AND ${OPEN})
            RETURNING group_id`,
      params: [me.id, group.id],
    },
    auditStatement({
      actor: actorOf(me),
      campId: me.camp_id,
      action: "group.leave",
      entity: "group",
      entityId: group.id,
      before: { registration_id: me.id },
      ifChanged: true,
    }),
    ...afterLeaving(group.id, me.id),
  ]);
  if (!results[0].results.length) throw new CampError(PASSED);
}

/** The owner removes another member. */
export async function removeMember(me: Registration, memberId: string) {
  const group = await requireOwner(me);
  if (memberId === me.id) throw new CampError("To leave your own group, use Leave group.");
  if (!group.members.some((m) => m.registration_id === memberId)) throw new CampError("That person isn't in your group.");
  requireOpen(group);
  const results = await batch("app", [
    {
      sql: `DELETE FROM camp_group_members WHERE registration_id = ? AND group_id IN (
              SELECT g.id FROM camp_groups g JOIN camps c ON c.id = g.camp_id
              WHERE g.id = ? AND g.owner_registration_id = ? AND ${OPEN})
            RETURNING group_id`,
      params: [memberId, group.id, me.id],
    },
    auditStatement({
      actor: actorOf(me),
      campId: me.camp_id,
      action: "group.remove",
      entity: "group",
      entityId: group.id,
      before: { registration_id: memberId },
      ifChanged: true,
    }),
  ]);
  if (!results[0].results.length) throw new CampError(PASSED);
}

// ─── Cancellation ────────────────────────────────────────────────────────────

/**
 * For a coordinator's cancellation or room-type change: takes the person out
 * of their group (even after the deadline; the trigger allows it once the
 * registration is cancelled or no longer matches the group's room type or
 * gender). Run after the registration update, in the same batch. Returns a
 * warning when a group that can no longer change lost a member.
 */
export async function groupStatementsForRemoval(actor: string, registration: Registration, reason: string) {
  const group = await getGroupFor(registration.id);
  const statements: { sql: string; params: unknown[] }[] = [];
  if (!group) return { statements, warning: null };
  statements.push(
    { sql: "DELETE FROM camp_group_members WHERE registration_id = ?", params: [registration.id] },
    auditStatement({
      actor,
      campId: registration.camp_id,
      action: "group.remove",
      entity: "group",
      entityId: group.id,
      before: { registration_id: registration.id, reason },
      ifChanged: true,
    }),
    ...afterLeaving(group.id, registration.id),
  );
  const left = group.members.length - 1;
  const warning =
    group.state === "open" || left === 0
      ? null
      : `${registration.full_name} was in a roommate group closed by the deadline, which now has ${left} of ${group.capacity} places filled.`;
  return { statements, warning };
}
