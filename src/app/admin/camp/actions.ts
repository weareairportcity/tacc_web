"use server";

import { notifyPrefs, removePushSub, savePushSub } from "@/lib/camp/push";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { allow } from "@/lib/camp/rate-limit";
import { extraRoomsNeeded, nextRoomLabels, planRandomFill, type FillStep } from "@/lib/camp/fill";
import { findPeople, getBulkReceipt, idsInScope, scopeFor } from "@/lib/camp/reports";
import { leaderAccounts, newLeaderCode, turnOffLeaderCode } from "@/lib/camp/leaders";
import { batch } from "@/lib/cf";
import { auditStatement } from "@/lib/camp/audit";
import { requireCampRole } from "@/lib/camp/auth";
import { createCamp, getCamp, setAppSwitch, setCampPhoto, setShirtPaidOnly, setShirtsOn, updateCamp, setHelpPhone, type AppSwitch } from "@/lib/camp/camps";
import { appDetails, sendBroadcast, sendLeaderToPerson, sendToPeople, type Audience, type Delivery } from "@/lib/camp/broadcast";
import { notifyLeaders, pushMany } from "@/lib/camp/notify";
import { leaderOwners, markTeamInstalled, teamOwner } from "@/lib/camp/team-app";
import { markAllRead } from "@/lib/camp/inbox";
import { logMedicalCall, medicalCard, medicalFind, type CallWho } from "@/lib/camp/medical";
import { MEDICAL_TEAM } from "@/lib/camp/leader-name";
import { TEAM_NO_APP_COOKIE } from "@/lib/camp/ipad";
import { listPeopleForLeader } from "@/lib/camp/reports";
import { formatCedis } from "@/lib/camp/money";
import { todayInGhana } from "@/lib/camp/registrations";
import { putMedia } from "@/lib/cf";
import type { CsvError } from "@/lib/camp/csv";
import { cedisToPesewas } from "@/lib/camp/money";
import {
  createRoom,
  createRooms,
  createRoomType,
  deleteRoom,
  deleteRoomType,
  getRoomType,
  importRooms,
  listRooms,
  listRoomTypes,
  setPlacesLeft,
  updateRoom,
  updateRoomType,
} from "@/lib/camp/rooms";
import { changeRoomType, movePayment, recordRefund } from "@/lib/camp/adjustments";
import { cancelScheduled, scheduleMessage } from "@/lib/camp/scheduled";
import { resolveComplaint } from "@/lib/camp/complaints";
import { changeGender, roomsFor } from "@/lib/camp/gender";
import { assignGroup, assignPerson, getMyRoom, getPoolBoard, listPools, unassign, unassignMany } from "@/lib/camp/assignments";
import { cancelRegistration, getRegistration, listPayments } from "@/lib/camp/registrations";
import { listRefunds } from "@/lib/camp/adjustments";
import { arrivalCounts, arrivalPage, findArrivals, getArrival, markScan, personCard, scanRoster, syncScans, undoScan, type ArrivalTab, type ScanMode, type SyncedScan } from "@/lib/camp/checkin";
import { getGroupFor } from "@/lib/camp/groups";
import { cancelPayment, checkBulkPayment, listOpenPaymentsByReference, listOpenPaymentsFor, startBulkPayment } from "@/lib/camp/payments";
import { checkChunk, paymentsToCheck } from "@/lib/camp/reconciliation";
import { getPrivateDetails, updateProfile } from "@/lib/camp/profile";
import { approveRefund, approveRoomChange, declineRequest, listMyRequests } from "@/lib/camp/requests";
import { deleteView, saveView } from "@/lib/camp/views";
import { makeToken, readToken } from "@/lib/camp/tokens";
import { campOrigin } from "@/lib/camp/origin";
import { sendRoomSms } from "@/lib/camp/room-sms";
import { sendThanks } from "@/lib/camp/feedback";
import { removeStaff, saveStaff, setStaffPhone } from "@/lib/camp/staff";
import {
  CAMP_PHOTOS,
  CampError,
  GENDERS,
  type CampInput,
  type CampPhoto,
  type Gender,
  type ProfileInput,
  type RoomInput,
  type Staff,
} from "@/lib/camp/types";

/**
 * Camp admin actions. Each one checks the caller's camp role itself: server
 * actions are reachable by direct POST, so a page-level check isn't enough.
 * Errors come back as values because Next hides thrown messages in production.
 */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/**
 * A change: on success the page the coordinator is on is rebuilt in this same response
 * (revalidatePath), so the client doesn't need to ask again. `quiet` skips that, for scans:
 * the scanning phone moves people in its own lists, and rebuilding the whole check-in page
 * on every scan would read thousands of rows each time.
 */
async function run<T>(fn: () => Promise<T>, { quiet = false } = {}): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    if (!quiet) revalidatePath("/admin/camp", "layout");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof CampError) return { ok: false, error: err.message };
    console.error("camp admin action failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Like run, for actions that only read: nothing changed, so nothing to refresh. */

/**
 * The same request from the same person within 10 seconds is a double tap, not a second wish:
 * only the first goes through. Guards the actions that would cost money or send texts twice.
 */
async function once(actor: string, name: string, args: unknown[]) {
  const key = createHash("sha256").update(JSON.stringify([actor, name, args])).digest("base64url").slice(0, 32);
  if (!(await allow(`once:${key}`, 1, 10_000))) throw new CampError("That already went through a moment ago.");
}

async function look<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof CampError) return { ok: false, error: err.message };
    console.error("camp admin lookup failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const nullable = (id: string | null) => (id && id.trim() ? id : null);

// ─── Camps ───────────────────────────────────────────────────────────────────

export async function saveCampAction(id: string | null, input: CampInput) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "saveCampAction", [id, input]);
    const existing = nullable(id);
    if (existing) {
      await updateCamp(staff.email, existing, input);
      return existing;
    }
    return createCamp(staff.email, input);
  });
}

/** Settings: T-shirts only for people who've paid in full, or for anyone registered. */
export async function setShirtRuleAction(campId: string, on: boolean) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await setShirtPaidOnly(staff.email, String(campId), on === true);
    return null;
  });
}

/** Settings: whether registration asks for a T-shirt size. The scanner stays either way. */
/** Settings: the app and details switches. */
export async function setAppSwitchAction(campId: string, which: AppSwitch, on: boolean) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await setAppSwitch(staff.email, String(campId), which, on === true);
    return null;
  });
}

export async function setShirtsOnAction(campId: string, on: boolean) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await setShirtsOn(staff.email, String(campId), on === true);
    return null;
  });
}

// ─── Camp photos ─────────────────────────────────────────────────────────────

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PHOTO_MAX = 8 * 1024 * 1024;

/** Uploads a camp's logo, banner or venue photo to R2 (media.theairportcitychurch.com) and puts it on the camp. */
export async function uploadCampPhotoAction(campId: string, kind: CampPhoto, form: FormData) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    if (!CAMP_PHOTOS.includes(kind)) throw new CampError("Unknown photo.");
    const camp = await getCamp(campId);
    if (!camp) throw new CampError("Unknown camp.");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new CampError("Choose a photo.");
    const ext = PHOTO_TYPES[file.type];
    if (!ext) throw new CampError("Use a JPG, PNG or WebP photo.");
    if (file.size > PHOTO_MAX) throw new CampError("That photo is over 8 MB. Use a smaller one.");
    // A new key per upload, so the old URL can stay cached forever.
    const url = await putMedia(`camp-${camp.slug}-${kind.replace("_", "-")}-${Date.now()}.${ext}`, new Uint8Array(await file.arrayBuffer()), file.type);
    await setCampPhoto(staff.email, camp.id, kind, url, String(form.get("credit") ?? ""));
    return url;
  });
}

/** Changes a photo's credit line, or removes the photo when url is empty. */
export async function saveCampPhotoAction(campId: string, kind: CampPhoto, url: string, credit: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await setCampPhoto(staff.email, campId, kind, url, credit);
    return null;
  });
}

// ─── Room types ──────────────────────────────────────────────────────────────

export async function saveRoomTypeAction(
  campId: string,
  id: string | null,
  input: { name: string; price: string; capacity: number; subtext?: string },
) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "saveRoomTypeAction", [campId, id, input]);
    const values = {
      name: input.name,
      subtext: input.subtext,
      price_pesewas: cedisToPesewas(String(input.price ?? "")),
      capacity: input.capacity,
    };
    const existing = nullable(id);
    if (existing) await updateRoomType(staff.email, existing, values);
    else await createRoomType(staff.email, campId, values);
    return null;
  });
}

/** placesLeft: null for no limit, 0 for full, otherwise remaining. placesTotal: a total; asRooms means that number is rooms, not beds. */
export async function setPlacesLeftAction(
  roomTypeId: string,
  gender: Gender,
  placesLeft: number | null,
  placesTotal: number | null = null,
  asRooms = false,
) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await setPlacesLeft(staff.email, roomTypeId, gender, placesLeft, placesTotal, asRooms);
    return null;
  });
}

export async function deleteRoomTypeAction(id: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await deleteRoomType(staff.email, id);
    return null;
  });
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

export async function saveRoomAction(campId: string, id: string | null, input: RoomInput) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "saveRoomAction", [campId, id, input]);
    const existing = nullable(id);
    if (existing) await updateRoom(staff.email, existing, input);
    else await createRoom(staff.email, campId, input);
    return null;
  });
}

export async function deleteRoomAction(id: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await deleteRoom(staff.email, id);
    return null;
  });
}

export async function importRoomsAction(campId: string, csvText: string) {
  return run<{ created: number; errors: CsvError[] }>(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "importRoomsAction", [campId, csvText]);
    if (typeof csvText !== "string" || csvText.length > 1024 * 1024) throw new CampError("The file must be under 1 MB.");
    return importRooms(staff.email, campId, csvText);
  });
}

// ─── Registrations ───────────────────────────────────────────────────────────

export async function cancelRegistrationAction(id: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return (await cancelRegistration(staff.email, id)).warning;
  });
}

// Each returns a warning for the coordinator, or null.

/** Moves a payment that went onto the wrong person to the right one. Both balances follow. */
export async function movePaymentAction(campId: string, paymentId: string, toRegistrationId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "movePaymentAction", [campId, paymentId, toRegistrationId]);
    await personIn(campId, String(toRegistrationId));
    return await movePayment(staff.email, String(paymentId), String(toRegistrationId));
  });
}

export async function recordRefundAction(registrationId: string, amountCedis: string, reference: string, note: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "recordRefundAction", [registrationId, amountCedis, reference, note]);
    const amount = cedisToPesewas(String(amountCedis));
    return (
      await recordRefund(staff.email, String(registrationId), {
        amount_pesewas: amount,
        reference: String(reference),
        note: String(note),
      })
    ).warning;
  });
}

export async function changeRoomTypeAction(registrationId: string, roomTypeId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return (await changeRoomType(staff.email, String(registrationId), String(roomTypeId))).warning;
  });
}

/** Rooms of the other gender a person could move into as their gender changes. */
export async function genderRoomsAction(campId: string, registrationId: string) {
  return look(async () => {
    await requireCampRole("coordinator");
    const person = await personIn(campId, registrationId);
    return roomsFor(person, person.gender === "male" ? "female" : "male");
  });
}

/** Changes someone's gender; they leave their group and room, and go into `roomId` if given. */
export async function changeGenderAction(campId: string, registrationId: string, gender: Gender, roomId: string | null) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    const person = await personIn(campId, registrationId);
    return (await changeGender(staff.email, person.id, gender, { roomId: roomId ? String(roomId) : null })).warning;
  });
}

// ─── Room assignment ─────────────────────────────────────────────────────────
// Each returns a warning (a partly filled room, an open group) or null.

// Each returns who was placed (for Undo), the room's name and any warning.

export async function assignPersonAction(roomId: string, registrationId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return assignPerson(staff.email, String(roomId), String(registrationId));
  });
}

export async function assignGroupAction(roomId: string, groupId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return assignGroup(staff.email, String(roomId), String(groupId));
  });
}

async function applyFillSteps(actor: string, steps: FillStep[]) {
  let placed = 0;
  const problems: { names: string[]; error: string }[] = [];
  for (const step of steps) {
    const names = Array.isArray(step?.names) ? step.names.map(String).slice(0, 20) : [];
    try {
      if (step?.kind === "group") placed += (await assignGroup(actor, String(step.roomId), String(step.groupId))).placed.length;
      else if (step?.kind === "person") {
        await assignPerson(actor, String(step.roomId), String(step.registrationId));
        placed++;
      }
    } catch (err) {
      if (!(err instanceof CampError)) throw err;
      problems.push({ names, error: err.message });
    }
  }
  return { placed, problems };
}

/**
 * "Fill rooms for me", after the coordinator has checked the draft (src/lib/camp/fill.ts).
 * Each placement goes through the same checks as a drag on the board; one that no longer
 * fits (someone else placed them meanwhile) is reported, and the rest still go in.
 */
export async function fillRoomsAction(campId: string, steps: FillStep[]) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    const list = Array.isArray(steps) ? steps.slice(0, 1000) : [];
    await once(staff.email, "fillRoomsAction", [campId, list.length, list[0] ?? null]);
    return applyFillSteps(staff.email, list);
  });
}

/**
 * Puts every waiting group and person, across every room type, into a random
 * room that fits. Creates rooms of the type's size when there aren't enough.
 * Groups stay together, one group per room; leftover beds take ungrouped
 * people. Coordinators rename rooms later (All rooms) when the venue has numbers.
 */
export async function fillAllRoomsAction(campId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "fillAllRoomsAction", [campId]);
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    let placed = 0;
    const problems: { names: string[]; error: string }[] = [];
    const existing = await listRooms(camp.id);
    const labels = existing.map((r) => r.label);
    for (const pool of await listPools(camp.id)) {
      if (!GENDERS.includes(pool.gender)) continue;
      const gender = pool.gender as Gender;
      let board = await getPoolBoard(camp.id, pool.room_type_id, gender);
      if (!board.groups.length && !board.people.length) continue;
      const type = await getRoomType(pool.room_type_id);
      if (!type) continue;
      const extra = extraRoomsNeeded(board, type.capacity);
      if (extra > 0) {
        const created = nextRoomLabels(labels, gender, type.name, type.capacity, extra);
        labels.push(...created);
        await createRooms(
          staff.email,
          camp.id,
          created.map((label) => ({ room_type_id: type.id, label, gender, capacity: type.capacity })),
        );
        board = await getPoolBoard(camp.id, pool.room_type_id, gender);
      }
      const result = await applyFillSteps(staff.email, planRandomFill(board).steps);
      placed += result.placed;
      problems.push(...result.problems);
    }
    return { placed, problems };
  });
}

/** Undo for a placement. */
export async function unassignManyAction(registrationIds: string[]) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await unassignMany(staff.email, Array.isArray(registrationIds) ? registrationIds.map(String) : []);
    return null;
  });
}

/** Texts placed people their room (those not yet told, up to MAX_PER_SEND per press). */
export async function sendRoomSmsAction(campId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "sendRoomSmsAction", [campId]);
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    return sendRoomSms(staff.email, camp);
  });
}

/** After camp: texts everyone who arrived a thank-you with their feedback link (not yet texted, up to MAX_PER_SEND). */
export async function sendThanksAction(campId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "sendThanksAction", [campId]);
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    return sendThanks(staff.email, camp, await campOrigin());
  });
}

export async function unassignAction(registrationId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await unassign(staff.email, String(registrationId));
    return null;
  });
}

// ─── Staff (admins only) ─────────────────────────────────────────────────────

export async function saveStaffAction(input: Staff) {
  return run(async () => {
    const staff = await requireCampRole("admin");
    await saveStaff(staff.email, input);
    return null;
  });
}

export async function removeStaffAction(email: string) {
  return run(async () => {
    const staff = await requireCampRole("admin");
    await removeStaff(staff.email, email);
    return null;
  });
}

// ─── v2: one person, paying for people, check-in, requests, views ───────────

/** Checks the person belongs to the camp the coordinator is looking at. */
async function personIn(campId: string, registrationId: string) {
  const person = await getRegistration(String(registrationId));
  if (!person || person.camp_id !== String(campId)) throw new CampError("Unknown person.");
  return person;
}

/** Everything the person panel shows. */
export async function getPersonAction(campId: string, registrationId: string) {
  return look(async () => {
    await requireCampRole("coordinator");
    const person = await personIn(campId, registrationId);
    const [payments, refunds, group, room, details, requests, arrival, roomTypes, app] = await Promise.all([
      listPayments(person.id),
      listRefunds(person.id),
      getGroupFor(person.id),
      getMyRoom(person.id),
      getPrivateDetails(person.id),
      listMyRequests(person),
      getArrival(person.id),
      listRoomTypes(person.camp_id),
      appDetails(person.id),
    ]);
    return {
      person,
      app,
      payments,
      refunds,
      group: group && { members: group.members.filter((m) => m.registration_id !== person.id).map((m) => m.full_name), state: group.state, capacity: group.capacity },
      room,
      details,
      requests: requests.filter((r) => r.status === "pending"),
      checkedIn: arrival?.checked_in_at ?? null,
      roomTypes: roomTypes.map((t) => ({ id: t.id, name: t.name, price: t.price_pesewas })),
    };
  });
}

export async function updatePersonAction(campId: string, registrationId: string, input: ProfileInput) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    const person = await personIn(campId, registrationId);
    await updateProfile(staff.email, person.id, input);
    return null;
  });
}

/**
 * Records money a coordinator has sent back by hand (a coordinator's own
 * decision): expressPay has no refund API. The reference is the MoMo or bank
 * transaction ID. Returns the amount and any warning for the coordinator.
 */
export async function refundPersonAction(campId: string, registrationId: string, amountCedis: string, reference: string, note: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "refundPersonAction", [campId, registrationId, amountCedis, reference, note]);
    const person = await personIn(campId, registrationId);
    const ref = String(reference ?? "").trim();
    if (ref.length < 3) throw new CampError("Enter the reference for the money you sent back (the MoMo or bank transaction ID).");
    const amount = cedisToPesewas(String(amountCedis));
    const { warning } = await recordRefund(staff.email, person.id, { amount_pesewas: amount, reference: ref, note: String(note ?? "").slice(0, 300) });
    return { refunded_pesewas: amount, warning };
  });
}

/** A link a parent or sponsor can open to pay this registration without signing in. */
export async function payLinkAction(campId: string, registrationId: string) {
  return look(async () => {
    await requireCampRole("coordinator");
    const person = await personIn(campId, registrationId);
    const camp = await getCamp(person.camp_id);
    return `${await campOrigin()}/camps/${camp!.slug}/pay/${makeToken("pay", person.id)}`;
  });
}

/**
 * One expressPay checkout for several people's balances. Returns where to
 * send the payer. Leaders pay for their own people only.
 */
export async function payForPeopleAction(campId: string, registrationIds: string[], note: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader", "pastor");
    await once(staff.email, "payForPeopleAction", [campId, registrationIds, note]);
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    const ids = Array.isArray(registrationIds) ? registrationIds.map(String).slice(0, 100) : [];
    const leader = staff.role === "leader";
    if (leader && (await idsInScope(camp.id, ids, scopeFor(staff))).length !== new Set(ids).size) throw new CampError(`You can only pay for people in ${staff.scope_value}.`);
    const checkout = await startBulkPayment({
      campId: camp.id,
      registrationIds: ids,
      paidBy: staff.email,
      note: String(note ?? ""),
      callbackUrl: `${await campOrigin()}${leader ? "/leaders" : "/admin/camp"}/${camp.id}/money/paid`,
    });
    await batch("app", [
      auditStatement({ actor: staff.email, campId: camp.id, action: "payment.bulk_start", entity: "bulk_payment", entityId: checkout.reference, after: { people: ids.length, amount: checkout.amount_pesewas } }),
    ]);
    if (!checkout.authorization_url) throw new CampError("expressPay couldn't start the payment. Please try again.");
    return checkout.authorization_url;
  });
}

/** "Check all with expressPay", step 1: which payments to ask about (the last 30 days). */
export async function paymentsToCheckAction(campId: string) {
  return look(async () => {
    await requireCampRole("coordinator");
    return paymentsToCheck(String(campId));
  });
}

/** Step 2, a chunk at a time so the page can show progress. Read-only. */
export async function checkWithExpressPayAction(campId: string, references: string[]) {
  return look(async () => {
    await requireCampRole("coordinator");
    return checkChunk(String(campId), Array.isArray(references) ? references.map(String) : []);
  });
}

/**
 * A message to the people picked on People (or one person, from their
 * panel), each greeted by name: the app for people with it, a text for the
 * rest; "both" when it's important. The page shows the cost first.
 */
export async function messagePeopleAction(campId: string, registrationIds: string[], message: string, how: Delivery) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "messagePeopleAction", [campId, registrationIds, message, how]);
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    return sendToPeople(staff.email, camp, registrationIds, message, how);
  });
}

/**
 * A fellowship, PFCC or group leader: one in-app message to one of their
 * people. Never a text. If that person hasn't turned notifications on, we
 * say so and send nothing.
 */
export async function leaderMessageAction(campId: string, registrationId: string, message: string) {
  return run(async () => {
    const staff = await requireCampRole("leader");
    await once(staff.email, "leaderMessageAction", [campId, registrationId, message]);
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    const id = String(registrationId);
    const allowed = await idsInScope(camp.id, [id], scopeFor(staff));
    if (!allowed.length) throw new CampError("They aren't one of your people.");
    const person = (await listPeopleForLeader(staff, camp.id, {})).find((r) => r.id === id);
    if (!person) throw new CampError("They aren't one of your people.");
    return sendLeaderToPerson(staff.email, camp, person, String(message ?? ""));
  });
}

/** Texts: one message to everyone registered, or part of them. appFirst: app notifications for people with the app. */
export async function broadcastAction(campId: string, audience: Audience, message: string, how: Delivery) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "broadcastAction", [campId, audience, message]);
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    const r = await sendBroadcast(staff.email, camp, audience, message, how);
    revalidatePath(`/admin/camp/${camp.id}/texts`);
    return r;
  });
}

/** Texts: schedule a message for later. `sendAtGhana` is "YYYY-MM-DDTHH:mm" in Ghana time (the same as UTC). */
export async function scheduleBroadcastAction(campId: string, audience: Audience, message: string, how: Delivery, sendAtGhana: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "scheduleBroadcastAction", [campId, audience, message, how, sendAtGhana]);
    const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(sendAtGhana)) ? `${sendAtGhana}:00Z` : "";
    const r = await scheduleMessage(staff.email, String(campId), { audience, message: String(message), how, sendAt: at });
    revalidatePath(`/admin/camp/${campId}/texts`);
    return r;
  });
}

/** Complaints: mark one resolved (a leader only for their own people's). The person is thanked in the app. */
export async function resolveComplaintAction(campId: string, id: string, note: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    await once(staff.email, "resolveComplaintAction", [campId, id]);
    await resolveComplaint(staff.email, String(id), String(note ?? ""), scopeFor(staff));
    revalidatePath(`/admin/camp/${String(campId)}/complaints`);
    revalidatePath(`/leaders/${String(campId)}/complaints`);
    return null;
  });
}

/** Texts: cancel a scheduled message that hasn't gone yet. */
export async function cancelScheduledAction(campId: string, id: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await cancelScheduled(staff.email, String(id));
    revalidatePath(`/admin/camp/${String(campId)}/texts`);
    return null;
  });
}

/**
 * Leaders: "Remind the 8 still to pay", as an app notification to the ones
 * with the app. Only when a coordinator has switched it on in Settings; never
 * a text (no credits), and at most once a day per person.
 */
export async function leaderRemindAction(campId: string) {
  return run(async () => {
    const staff = await requireCampRole("leader", "coordinator");
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    if (!camp.leader_reminders) throw new CampError("Payment reminders are switched off for this camp. A coordinator can switch them on in Settings.");
    const rows = staff.role === "leader" ? await listPeopleForLeader(staff, camp.id, {}) : [];
    const owing = rows.filter((r) => (r.status === "registered" || r.status === "partially_paid") && r.price_pesewas > r.paid_pesewas);
    const reachable = owing.filter((r) => r.app === "on");
    const day = todayInGhana();
    const { delivered, skipped } = await pushMany(
      reachable.map((r) => ({
        registration_id: r.id,
        kind: "due_soon" as const,
        title: "A reminder to pay",
        body: `Hi ${r.full_name.trim().split(/\s+/)[0]}, you still have ${formatCedis(r.price_pesewas - r.paid_pesewas)} to pay for ${camp.name}, due ${new Date(`${camp.payment_due_on}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}. Tap to pay in Commune.`,
        url: `/camps/${camp.slug}/me#pay`,
        once: `leader-remind:${r.id}:${day}`,
      })),
    );
    await batch("app", [
      auditStatement({ actor: staff.email, campId: camp.id, action: "people.remind", entity: "camp", entityId: camp.id, after: { sent: delivered.size, already: skipped.size, no_app: owing.length - reachable.length } }),
    ]);
    return { sent: delivered.size, already: skipped.size, noApp: owing.length - reachable.length };
  });
}

// Check-in and T-shirts: the QR on a pass is a signed link (tokens.ts); search
// covers the rest. Leaders can do both, for their own people only.

const scanTarget = (tokenOrId: string) => {
  const id = readToken("checkin", String(tokenOrId)) ?? (/^[0-9a-f-]{36}$/i.test(String(tokenOrId)) ? String(tokenOrId) : null);
  if (!id) throw new CampError("That QR isn't a Commune pass.");
  return id;
};
const modeOf = (mode: unknown): ScanMode => (mode === "shirt" ? "shirt" : "checkin");

export async function scanAction(campId: string, tokenOrId: string, mode: ScanMode) {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    const scope = scopeFor(staff);
    // No counts here: the scanning phone adds one itself, and asks for fresh counts every 20 s.
    return markScan(staff.email, String(campId), scanTarget(tokenOrId), modeOf(mode), scope);
  }, { quiet: true });
}

/** The scanning phone's counts, every 20 s. */
export async function scanCountsAction(campId: string) {
  return look(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    return arrivalCounts(String(campId), scopeFor(staff));
  });
}

/** More of the Arrived / Not here yet lists, 50 at a time. */
export async function arrivalsAction(campId: string, mode: ScanMode, tab: ArrivalTab, offset: number) {
  return look(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    return arrivalPage(String(campId), modeOf(mode), tab === "notYet" ? "notYet" : "here", scopeFor(staff), Number(offset) || 0);
  });
}

export async function undoScanAction(campId: string, registrationId: string, mode: ScanMode) {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    const scope = scopeFor(staff);
    await undoScan(staff.email, String(campId), String(registrationId), modeOf(mode), scope);
    return null;
  }, { quiet: true });
}

// From a person's panel on People: the page shows it, so it's rebuilt as with any change.
export async function checkInAction(campId: string, tokenOrId: string) {
  const r = await scanAction(campId, tokenOrId, "checkin");
  if (r.ok) revalidatePath("/admin/camp", "layout");
  return r;
}

export async function undoCheckInAction(campId: string, registrationId: string) {
  const r = await undoScanAction(campId, registrationId, "checkin");
  if (r.ok) revalidatePath("/admin/camp", "layout");
  return r;
}

/** The scanning phone's copy of the list, for checking people in with no signal. */
export async function scanRosterAction(campId: string) {
  return look(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    return scanRoster(String(campId), scopeFor(staff));
  });
}

/** Scans a phone kept with no signal: the pass (or id) scanned, the job, and when it happened. */
export async function syncScansAction(campId: string, scans: { key: string; target: string; mode: ScanMode; at: string }[]) {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    const scope = scopeFor(staff);
    const list = Array.isArray(scans) ? scans.slice(0, 100) : [];
    const bad: SyncedScan[] = [];
    const good = list.flatMap((s) => {
      const key = String(s?.key ?? "").slice(0, 64);
      try {
        return [{ key, id: scanTarget(String(s?.target ?? "")), mode: modeOf(s?.mode), at: String(s?.at ?? "") }];
      } catch (err) {
        bad.push({ key, ok: false, error: err instanceof CampError ? err.message : "That QR isn't a Commune pass." });
        return [];
      }
    });
    const results = [...bad, ...(await syncScans(staff.email, String(campId), good, scope))];
    return { results, counts: await arrivalCounts(String(campId), scope) };
  }, { quiet: true });
}

/** One person's details, when a name is tapped on Check-in or a leader's People. */
export async function personCardAction(campId: string, registrationId: string) {
  return look(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    return personCard(String(campId), String(registrationId), scopeFor(staff));
  });
}

export async function findArrivalsAction(campId: string, term: string) {
  return look(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    return findArrivals(String(campId), String(term), scopeFor(staff));
  });
}

// Requests

/** Records the refund the coordinator sent by hand (with its reference) and approves the request. */
export async function approveRefundAction(requestId: string, amountCedis: string, note: string, reference: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return approveRefund(staff.email, String(requestId), cedisToPesewas(String(amountCedis)), String(note ?? ""), String(reference ?? ""));
  });
}

/** A downgrade they've overpaid for needs the reference of the difference sent back. */
export async function approveRoomChangeAction(requestId: string, note: string, reference = "") {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return approveRoomChange(staff.email, String(requestId), String(note ?? ""), String(reference ?? ""));
  });
}

export async function declineRequestAction(requestId: string, note: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    const request = await declineRequest(staff.email, String(requestId), String(note ?? ""));
    return request.full_name;
  });
}

// Saved People views

export async function saveViewAction(campId: string, name: string, queryString: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    return saveView(String(campId), staff.email, String(name), String(queryString));
  });
}

export async function deleteViewAction(viewId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    await deleteView(staff.email, String(viewId));
    return null;
  });
}

/** The coordinator's own phone, for the 7 pm summary text. */
export async function setMyPhoneAction(phone: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return setStaffPhone(staff, String(phone ?? ""));
  });
}

/** The number attendees can call or WhatsApp from any page. */
export async function setHelpPhoneAction(campId: string, phone: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return setHelpPhone(staff.email, String(campId), String(phone ?? ""));
  });
}

/** The return page after paying for several people. */
export async function checkBulkAction(campId: string, reference: string) {
  return look(async () => {
    const staff = await requireCampRole("coordinator", "leader", "pastor");
    // A leader or the Pastor sees only the payments they made themselves.
    const mine = await getBulkReceipt(String(campId), String(reference));
    if ((staff.role === "leader" || staff.role === "pastor") && mine?.paid_by !== staff.email) throw new CampError("That payment isn't one of yours.");
    const check = await checkBulkPayment(String(campId), String(reference));
    return { ...check, receipt: await getBulkReceipt(String(campId), String(reference)) };
  });
}

/** The top bar's "Find a person", as you type. Leaders search their own group only. */
export async function findPeopleAction(campId: string, term: string) {
  return look(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    return findPeople(String(campId), String(term), scopeFor(staff));
  });
}

// ─── Medical team ─────────────────────────────────────────────────────────────

/** The medical team's search: anyone in the camp, by name or phone. Names and fellowships only. */
export async function medicalFindAction(campId: string, term: string) {
  return look(async () => {
    await requireCampRole("medical", "coordinator");
    return medicalFind(String(campId), String(term));
  });
}

/** One person's health notes, emergency contact, room and roommates. Each look goes in the History, with what was searched. */
export async function medicalCardAction(campId: string, personId: string, searched = "") {
  return look(async () => {
    const staff = await requireCampRole("medical", "coordinator");
    return medicalCard(staff.email, String(campId), String(personId), String(searched));
  });
}

/** A tap on Call in the medical search, noted in the History. */
export async function medicalCallAction(campId: string, personId: string, who: CallWho) {
  return run(
    async () => {
      const staff = await requireCampRole("medical", "coordinator");
      await logMedicalCall(staff.email, String(campId), String(personId), String(who) as CallWho);
      return null;
    },
    { quiet: true },
  );
}

/** The medical team's code: one, shared, shown once. The old one stops working. */
export async function newMedicalCodeAction() {
  return run(async () => {
    const staff = await requireCampRole("admin");
    await once(staff.email, "newMedicalCodeAction", []);
    return newLeaderCode(staff.email, "medical", MEDICAL_TEAM);
  });
}

// ─── Leader codes (admins only) ──────────────────────────────────────────────

/** A new sign-in code for a fellowship, PFCC or Group Leader (by name), shown once. The old one stops working. */
export async function newLeaderCodeAction(kind: "fellowship" | "pfcc" | "group", value: string, holder?: string) {
  return run(async () => {
    const staff = await requireCampRole("admin");
    await once(staff.email, "newLeaderCodeAction", [kind, value, holder ?? ""]);
    return newLeaderCode(staff.email, kind === "pfcc" ? "pfcc" : kind === "group" ? "group" : "fellowship", String(value), holder === undefined ? undefined : String(holder));
  });
}

export async function turnOffLeaderCodeAction(id: string) {
  return run(async () => {
    const staff = await requireCampRole("admin");
    await turnOffLeaderCode(staff.email, String(id));
    return null;
  });
}

// ─── Payments still processing ───────────────────────────────────────────────

/** A leader may give up on their own checkout, or one that's only for their people. */
async function leaderMayCancel(staff: Staff, campId: string, reference: string) {
  const bulk = await getBulkReceipt(campId, reference);
  if (bulk) return bulk.paid_by === staff.email || (await idsInScope(campId, bulk.people.map((p) => p.id), scopeFor(staff))).length === bulk.people.length;
  const [single] = await listOpenPaymentsByReference(campId, reference);
  return !!single && (await idsInScope(campId, [single.registration_id], scopeFor(staff))).length === 1;
}

/** What's holding up "Pay for them": checkouts still processing for these people. */
export async function openPaymentsForAction(campId: string, registrationIds: string[]) {
  return look(async () => {
    const staff = await requireCampRole("coordinator", "leader", "pastor");
    const ids = Array.isArray(registrationIds) ? registrationIds.map(String) : [];
    const payments = await listOpenPaymentsFor(String(campId), await idsInScope(String(campId), ids, scopeFor(staff)));
    return { me: staff.email, payments };
  });
}

/** "Cancel it": gives up on an unfinished checkout once expressPay confirms nobody paid. Logged. */
export async function cancelPaymentAction(campId: string, reference: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader", "pastor");
    if ((staff.role === "leader" || staff.role === "pastor") && !(await leaderMayCancel(staff, String(campId), String(reference)))) throw new CampError("That payment isn't for your people.");
    const { status } = await cancelPayment(String(campId), String(reference));
    await batch("app", [
      auditStatement({ actor: staff.email, campId: String(campId), action: "payment.cancel", entity: "payment", entityId: String(reference), after: { status } }),
    ]);
    return status;
  });
}

// ─── App notifications ───────────────────────────────────────────────────────

// Coordinators ('staff:<email>') and leader codes ('leader:<code id>') alike: Commune Team.
export async function staffPushSubscribeAction(subscription: unknown) {
  return run(
    async () => {
      const staff = await requireCampRole("coordinator", "leader", "pastor", "medical");
      // Every code on this phone keeps its notifications ("Add another account").
      const keep = staff.role === "leader" || staff.role === "medical" ? (await leaderAccounts()).filter((a) => !a.active).map((a) => `leader:${a.id}`) : [];
      await savePushSub(teamOwner(staff), subscription, keep);
      return true;
    },
    { quiet: true },
  );
}

export async function staffPushRemoveAction(endpoint: string) {
  return run(
    async () => {
      const staff = await requireCampRole("coordinator", "leader", "pastor", "medical");
      await removePushSub(endpoint, teamOwner(staff));
      return true;
    },
    { quiet: true },
  );
}

export async function staffNotifyPrefsAction(off?: string[]) {
  return run(
    async () => {
      const staff = await requireCampRole("coordinator", "leader", "pastor", "medical");
      return notifyPrefs(teamOwner(staff), off);
    },
    { quiet: true },
  );
}

/** Commune Team was opened from a Home Screen (or Android said it installed it). */
export async function teamInstalledAction(platform: string) {
  return run(
    async () => {
      const staff = await requireCampRole("coordinator", "leader", "pastor", "medical");
      await markTeamInstalled(teamOwner(staff), String(platform));
      return true;
    },
    { quiet: true },
  );
}

/** "My device can't do this" on the Commune Team set-up: this device opens the pages without the app, for a year. */
export async function teamNoAppAction() {
  return run(async () => {
    await requireCampRole("coordinator", "leader", "pastor", "medical");
    (await cookies()).set(TEAM_NO_APP_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
    return true;
  });
}

/** Texts: a message to every leader's phone, as an app notification (free). Leaders share codes, so there's no number to text. */
export async function messageLeadersAction(campId: string, message: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await once(staff.email, "messageLeadersAction", [campId, message]);
    const text = String(message ?? "").trim();
    if (text.length < 3) throw new CampError("Write the message first.");
    if (text.length > 400) throw new CampError("Keep it to 400 characters.");
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    const phones = await notifyLeaders(await leaderOwners(), { title: `${camp.name}: from the coordinators`, body: text, url: `/leaders/${camp.id}/people` });
    await batch("app", [auditStatement({ actor: staff.email, campId: camp.id, action: "leaders.message", entity: "camp", entityId: camp.id, after: { phones } })]);
    return phones;
  });
}

/** The Notifications page was opened: everything in it counts as read (a leader code's holders share theirs). */
export async function markInboxReadAction() {
  return run(
    async () => {
      const staff = await requireCampRole("coordinator", "leader", "pastor", "medical");
      await markAllRead(teamOwner(staff));
      return null;
    },
    { quiet: true },
  );
}
