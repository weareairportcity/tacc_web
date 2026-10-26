import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { GROUP_CODE_LENGTH, generateGroupCode, normalizeCode } from "./codes";
import { allow } from "./rate-limit";
import { todayInGhana } from "./registrations";
import {
  CampError,
  type Group,
  type GroupMember,
  type GroupState,
  type Invitee,
  type ReceivedInvite,
  type Registration,
  type SentInvite,
} from "./types";

/**
 * Roommate groups. D1 has no row locks, so every change is one guarded
 * statement: the WHERE clause holds the rule (open, room left, eligible) and
 * the database applies it atomically, which is what stops two people taking
 * the last place. When a guard matches nothing, `explain` reads the state to
 * say why. Migration 0006's triggers repeat the rules as a backstop.
 *
 * Callers pass the signed-in attendee's own registration; nothing here trusts
 * an id from the browser to say who is acting.
 */

const actorOf = (me: Registration) => `attendee:${me.id}`;
const MINUTE = 60 * 1000;

// SQL for "this group can still change", with g = camp_groups and c = camps.
const OPEN = "g.locked_at IS NULL AND date('now') <= c.roommate_deadline_on";

export function groupState(g: { locked_at: string | null; roommate_deadline_on: string }, today = todayInGhana()): GroupState {
  if (today > g.roommate_deadline_on) return "final";
  return g.locked_at ? "locked" : "open";
}

type GroupRow = Omit<Group, "state" | "members">;

const GROUP_SELECT = `SELECT g.id, g.camp_id, g.room_type_id, t.name AS room_type_name, g.gender, g.code,
    g.owner_registration_id, g.locked_at, t.capacity, c.roommate_deadline_on
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
  if (group.state === "final") throw new CampError("The roommate deadline has passed, so groups can't change.");
  if (group.state === "locked") throw new CampError("This group is locked. Its owner can unlock it before the deadline.");
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
    ...closeOtherInvites(me.id),
  ]);
  if (!results[0].results.length) throw new CampError("You're already in a group. Leave it first.");
  return id;
}

/** Pending invites to someone who has just joined a group no longer apply. */
function closeOtherInvites(registrationId: string) {
  return [
    {
      sql: `UPDATE camp_group_invites SET status = 'cancelled'
            WHERE registration_id = ? AND status = 'pending'
              AND EXISTS (SELECT 1 FROM camp_group_members WHERE registration_id = ?)`,
      params: [registrationId, registrationId],
    },
  ];
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
  if (group.state !== "open") {
    try {
      requireOpen(group);
    } catch (err) {
      return err as CampError;
    }
  }
  if (group.members.length >= group.capacity) return new CampError("That group is full.");
  return new CampError("You couldn't join that group. Please try again.");
}

async function join(me: Registration, groupId: string, extra: { sql: string; params: unknown[] }[] = []) {
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
    ...extra,
    ...closeOtherInvites(me.id),
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

// ─── Leaving, removing, locking ──────────────────────────────────────────────

/**
 * Statements that run after a member has gone: ownership passes to the
 * longest-standing member, and an empty group is deleted (with its invites).
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
  if (!results[0].results.length) throw new CampError("This group is locked. Its owner can unlock it before the deadline.");
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
  if (!results[0].results.length) throw new CampError("This group is locked. Unlock it first.");
}

/** The owner locks or unlocks the group. Both stop at the deadline. */
export async function setLocked(me: Registration, locked: boolean) {
  const group = await requireOwner(me);
  if (group.state === "final") throw new CampError("The roommate deadline has passed, so groups can't change.");
  if ((group.state === "locked") === locked) return;
  const results = await batch("app", [
    {
      sql: `UPDATE camp_groups SET locked_at = ${locked ? "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')" : "NULL"}
            WHERE id = ? AND owner_registration_id = ? AND locked_at IS ${locked ? "" : "NOT "}NULL
              AND date('now') <= (SELECT roommate_deadline_on FROM camps WHERE id = camp_groups.camp_id)
            RETURNING id`,
      params: [group.id, me.id],
    },
    auditStatement({
      actor: actorOf(me),
      campId: me.camp_id,
      action: locked ? "group.lock" : "group.unlock",
      entity: "group",
      entityId: group.id,
      ifChanged: true,
    }),
  ]);
  if (!results[0].results.length) throw new CampError("The group changed. Please refresh and try again.");
}

// ─── Invites ─────────────────────────────────────────────────────────────────

const MAX_PENDING_INVITES = 20;

/**
 * People the owner could invite, by name: same camp, room type and gender,
 * Fully Paid, in no group. Only name and fellowship, never contact details.
 */
export async function searchInvitees(me: Registration, raw: string): Promise<Invitee[]> {
  const group = await requireOwner(me);
  const term = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (term.length < 2) return [];
  if (!(await allow(`group-search:${me.id}`, 60, 15 * MINUTE))) {
    throw new CampError("Too many searches. Please wait a few minutes and try again.");
  }
  const like = `%${term.slice(0, 60).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return query<Invitee>(
    "app",
    `SELECT r.id, r.full_name, r.fellowship,
       EXISTS (SELECT 1 FROM camp_group_invites i WHERE i.group_id = ? AND i.registration_id = r.id AND i.status = 'pending') AS invited
     FROM camp_registrations r
     WHERE r.camp_id = ? AND r.room_type_id = ? AND r.gender = ? AND r.status = 'fully_paid' AND r.id <> ?
       AND NOT EXISTS (SELECT 1 FROM camp_group_members m WHERE m.registration_id = r.id)
       AND r.full_name LIKE ? ESCAPE '\\'
     ORDER BY r.full_name LIMIT 10`,
    [group.id, group.camp_id, group.room_type_id, group.gender, me.id, like],
  );
}

export async function invite(me: Registration, inviteeId: string) {
  const group = await requireOwner(me);
  requireOpen(group);
  checkId(inviteeId, "registration");
  if (group.members.length >= group.capacity) throw new CampError("Your group is full.");
  const id = crypto.randomUUID();
  const results = await batch("app", [
    {
      sql: `INSERT INTO camp_group_invites (id, group_id, registration_id, invited_by)
            SELECT ?, g.id, r.id, ? FROM camp_groups g
            JOIN camps c ON c.id = g.camp_id
            JOIN camp_registrations r ON r.id = ?
            WHERE g.id = ? AND g.owner_registration_id = ? AND ${OPEN}
              AND r.camp_id = g.camp_id AND r.room_type_id = g.room_type_id AND r.gender = g.gender
              AND r.status = 'fully_paid'
              AND NOT EXISTS (SELECT 1 FROM camp_group_members m WHERE m.registration_id = r.id)
              AND NOT EXISTS (SELECT 1 FROM camp_group_invites i
                              WHERE i.group_id = g.id AND i.registration_id = r.id AND i.status = 'pending')
              AND (SELECT COUNT(*) FROM camp_group_invites i WHERE i.group_id = g.id AND i.status = 'pending') < ?
            RETURNING id`,
      params: [id, me.id, inviteeId, group.id, me.id, MAX_PENDING_INVITES],
    },
    auditStatement({
      actor: actorOf(me),
      campId: me.camp_id,
      action: "group.invite",
      entity: "group",
      entityId: group.id,
      after: { invite_id: id, registration_id: inviteeId },
      ifChanged: true,
    }),
  ]);
  if (!results[0].results.length) {
    throw new CampError("You can't invite that person. They may have joined a group, or already have your invite.");
  }
}

/** The owner withdraws a pending invite. */
export async function cancelInvite(me: Registration, inviteId: string) {
  const group = await requireOwner(me);
  await batch("app", [
    {
      sql: "UPDATE camp_group_invites SET status = 'cancelled' WHERE id = ? AND group_id = ? AND status = 'pending'",
      params: [checkId(inviteId, "invite"), group.id],
    },
    auditStatement({
      actor: actorOf(me),
      campId: me.camp_id,
      action: "group.invite_cancel",
      entity: "group",
      entityId: group.id,
      after: { invite_id: inviteId },
      ifChanged: true,
    }),
  ]);
}

export function listSentInvites(groupId: string): Promise<SentInvite[]> {
  return query<SentInvite>(
    "app",
    `SELECT i.id, i.created_at, i.registration_id, r.full_name, r.fellowship
     FROM camp_group_invites i JOIN camp_registrations r ON r.id = i.registration_id
     WHERE i.group_id = ? AND i.status = 'pending' ORDER BY i.created_at`,
    [checkId(groupId, "group")],
  );
}

export function listReceivedInvites(me: Registration): Promise<ReceivedInvite[]> {
  return query<ReceivedInvite>(
    "app",
    `SELECT i.id, i.created_at, i.group_id, o.full_name AS owner_name, t.capacity,
       (SELECT COUNT(*) FROM camp_group_members m WHERE m.group_id = g.id) AS member_count
     FROM camp_group_invites i
     JOIN camp_groups g ON g.id = i.group_id
     JOIN camp_registrations o ON o.id = g.owner_registration_id
     JOIN camp_room_types t ON t.id = g.room_type_id
     WHERE i.registration_id = ? AND i.status = 'pending' ORDER BY i.created_at DESC`,
    [me.id],
  );
}

async function pendingInviteTo(me: Registration, inviteId: string) {
  const [row] = await query<{ group_id: string }>(
    "app",
    "SELECT group_id FROM camp_group_invites WHERE id = ? AND registration_id = ? AND status = 'pending'",
    [checkId(inviteId, "invite"), me.id],
  );
  if (!row) throw new CampError("That invite is no longer open.");
  return row.group_id;
}

/** Joins the inviting group through the same guarded insert as a code. */
export async function acceptInvite(me: Registration, inviteId: string) {
  requireFullyPaid(me);
  const groupId = await pendingInviteTo(me, inviteId);
  await join(me, groupId, [
    {
      sql: `UPDATE camp_group_invites SET status = 'accepted'
            WHERE id = ? AND status = 'pending'
              AND EXISTS (SELECT 1 FROM camp_group_members WHERE group_id = ? AND registration_id = ?)`,
      params: [inviteId, groupId, me.id],
    },
  ]);
}

export async function declineInvite(me: Registration, inviteId: string) {
  const groupId = await pendingInviteTo(me, inviteId);
  await batch("app", [
    {
      sql: "UPDATE camp_group_invites SET status = 'declined' WHERE id = ? AND registration_id = ? AND status = 'pending'",
      params: [inviteId, me.id],
    },
    auditStatement({
      actor: actorOf(me),
      campId: me.camp_id,
      action: "group.invite_decline",
      entity: "group",
      entityId: groupId,
      after: { invite_id: inviteId },
      ifChanged: true,
    }),
  ]);
}

// ─── Cancellation ────────────────────────────────────────────────────────────

/**
 * For a coordinator's cancellation or room-type change: takes the person out
 * of their group (locked or not; the trigger allows it once the registration
 * is cancelled or no longer matches the group's room type) and closes their
 * invites. Run after the registration update, in the same batch. Returns a
 * warning when a locked or final group lost a member.
 */
export async function groupStatementsForRemoval(actor: string, registration: Registration, reason: string) {
  const group = await getGroupFor(registration.id);
  const statements: { sql: string; params: unknown[] }[] = [
    {
      sql: "UPDATE camp_group_invites SET status = 'cancelled' WHERE registration_id = ? AND status = 'pending'",
      params: [registration.id],
    },
  ];
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
      : `${registration.full_name} was in a ${group.state} roommate group, which now has ${left} of ${group.capacity} places filled.`;
  return { statements, warning };
}
