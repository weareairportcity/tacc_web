"use server";

import { revalidatePath } from "next/cache";
import { findPeople, getBulkReceipt, idsInScope, scopeFor } from "@/lib/camp/reports";
import { newLeaderCode, turnOffLeaderCode } from "@/lib/camp/leaders";
import { batch } from "@/lib/cf";
import { auditStatement } from "@/lib/camp/audit";
import { requireCampRole } from "@/lib/camp/auth";
import { createCamp, getCamp, setCampPhoto, updateCamp } from "@/lib/camp/camps";
import { putMedia } from "@/lib/cf";
import type { CsvError } from "@/lib/camp/csv";
import { cedisToPesewas } from "@/lib/camp/money";
import {
  createRoom,
  createRoomType,
  deleteRoom,
  deleteRoomType,
  importRooms,
  listRoomTypes,
  setPlacesLeft,
  updateRoom,
  updateRoomType,
} from "@/lib/camp/rooms";
import { changeRoomType, recordRefund } from "@/lib/camp/adjustments";
import { assignGroup, assignPerson, getMyRoom, unassign, unassignMany } from "@/lib/camp/assignments";
import { cancelRegistration, getRegistration, listPayments } from "@/lib/camp/registrations";
import { listRefunds } from "@/lib/camp/adjustments";
import { arrivalCounts, findArrivals, getArrival, markScan, scanRoster, syncScans, undoScan, type ScanMode, type SyncedScan } from "@/lib/camp/checkin";
import { getGroupFor } from "@/lib/camp/groups";
import { cancelPayment, checkBulkPayment, listOpenPaymentsByReference, listOpenPaymentsFor, refundThroughPaystack, startBulkPayment } from "@/lib/camp/payments";
import { getPrivateDetails, updateProfile } from "@/lib/camp/profile";
import { approveRefund, approveRoomChange, declineRequest, listMyRequests } from "@/lib/camp/requests";
import { deleteView, saveView } from "@/lib/camp/views";
import { makeToken, readToken } from "@/lib/camp/tokens";
import { COMMUNE_SENDER, sendSMS } from "@/lib/mnotify";
import { campOrigin } from "@/lib/camp/origin";
import { sendRoomSms } from "@/lib/camp/room-sms";
import { sendThanks } from "@/lib/camp/feedback";
import { removeStaff, saveStaff, setStaffPhone } from "@/lib/camp/staff";
import {
  CAMP_PHOTOS,
  CampError,
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

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/admin/camp", "layout");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof CampError) return { ok: false, error: err.message };
    console.error("camp admin action failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Like run, for actions that only read: nothing changed, so nothing to refresh. */
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
    const existing = nullable(id);
    if (existing) {
      await updateCamp(staff.email, existing, input);
      return existing;
    }
    return createCamp(staff.email, input);
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
  input: { name: string; price: string; capacity: number },
) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    const values = { name: input.name, price_pesewas: cedisToPesewas(String(input.price ?? "")), capacity: input.capacity };
    const existing = nullable(id);
    if (existing) await updateRoomType(staff.email, existing, values);
    else await createRoomType(staff.email, campId, values);
    return null;
  });
}

/** placesLeft: null for no limit, 0 for full, otherwise what the venue says is left. */
export async function setPlacesLeftAction(roomTypeId: string, gender: Gender, placesLeft: number | null) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    await setPlacesLeft(staff.email, roomTypeId, gender, placesLeft);
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

export async function recordRefundAction(registrationId: string, amountCedis: string, reference: string, note: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
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
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    return sendRoomSms(staff.email, camp, await campOrigin());
  });
}

/** After camp: texts everyone who arrived a thank-you with their feedback link (not yet texted, up to MAX_PER_SEND). */
export async function sendThanksAction(campId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
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
    const [payments, refunds, group, room, details, requests, arrival, roomTypes] = await Promise.all([
      listPayments(person.id),
      listRefunds(person.id),
      getGroupFor(person.id),
      getMyRoom(person.id),
      getPrivateDetails(person.id),
      listMyRequests(person),
      getArrival(person.id),
      listRoomTypes(person.camp_id),
    ]);
    return {
      person,
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

/** Sends money back through Paystack straight away (a coordinator's own decision). */
export async function refundPersonAction(campId: string, registrationId: string, amountCedis: string, note: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    const person = await personIn(campId, registrationId);
    return refundThroughPaystack({
      registrationId: person.id,
      amountPesewas: cedisToPesewas(String(amountCedis)),
      actor: staff.email,
      note: String(note ?? "").slice(0, 300),
    });
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One Paystack checkout for several people's balances. Returns where to send
 * the payer. Leaders pay for their own people only; with no email on
 * Commune, they give one for Paystack's receipt.
 */
export async function payForPeopleAction(campId: string, registrationIds: string[], note: string, payerEmail = "") {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    const camp = await getCamp(String(campId));
    if (!camp) throw new CampError("Unknown camp.");
    const ids = Array.isArray(registrationIds) ? registrationIds.map(String).slice(0, 100) : [];
    const leader = staff.role === "leader";
    const email = leader ? String(payerEmail ?? "").trim().toLowerCase() : staff.email;
    if (leader && !EMAIL.test(email)) throw new CampError("Enter your email for the Paystack receipt.");
    if (leader && (await idsInScope(camp.id, ids, scopeFor(staff))).length !== new Set(ids).size) throw new CampError(`You can only pay for people in ${staff.scope_value}.`);
    const checkout = await startBulkPayment({
      campId: camp.id,
      registrationIds: ids,
      paidBy: staff.email,
      payerEmail: email,
      note: String(note ?? ""),
      callbackUrl: `${await campOrigin()}/admin/camp/${camp.id}/money/paid`,
    });
    await batch("app", [
      auditStatement({ actor: staff.email, campId: camp.id, action: "payment.bulk_start", entity: "bulk_payment", entityId: checkout.reference, after: { people: ids.length, amount: checkout.amount_pesewas } }),
    ]);
    return checkout.authorization_url;
  });
}

/** A text to the people picked on People. Each text costs, so the page confirms first. */
export async function textPeopleAction(campId: string, registrationIds: string[], message: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    const text = String(message ?? "").trim();
    if (text.length < 3) throw new CampError("Write the message first.");
    if (text.length > 459) throw new CampError("Keep it to three texts (459 characters).");
    const ids = Array.isArray(registrationIds) ? registrationIds.map(String).slice(0, 500) : [];
    const people = await Promise.all(ids.map((id) => personIn(campId, id).catch(() => null)));
    const phones = people.filter((p) => p && p.status !== "cancelled" && /^233\d{9}$/.test(p.phone)).map((p) => p!.phone);
    if (!phones.length) throw new CampError("None of them can be texted.");
    if (!(await sendSMS(phones, text, COMMUNE_SENDER))) throw new CampError("The texts didn't go. Please try again.");
    await batch("app", [auditStatement({ actor: staff.email, campId: String(campId), action: "people.text", entity: "camp", entityId: String(campId), after: { count: phones.length } })]);
    return phones.length;
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
    const result = await markScan(staff.email, String(campId), scanTarget(tokenOrId), modeOf(mode), scope);
    return { ...result, counts: await arrivalCounts(String(campId), scope) };
  });
}

export async function undoScanAction(campId: string, registrationId: string, mode: ScanMode) {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    const scope = scopeFor(staff);
    await undoScan(staff.email, String(campId), String(registrationId), modeOf(mode), scope);
    return arrivalCounts(String(campId), scope);
  });
}

export async function checkInAction(campId: string, tokenOrId: string) {
  return scanAction(campId, tokenOrId, "checkin");
}

export async function undoCheckInAction(campId: string, registrationId: string) {
  return undoScanAction(campId, registrationId, "checkin");
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
  });
}

export async function findArrivalsAction(campId: string, term: string) {
  return look(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    return findArrivals(String(campId), String(term), scopeFor(staff));
  });
}

// Requests

export async function approveRefundAction(requestId: string, amountCedis: string, note: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return approveRefund(staff.email, String(requestId), cedisToPesewas(String(amountCedis)), String(note ?? ""));
  });
}

export async function approveRoomChangeAction(requestId: string, note: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return approveRoomChange(staff.email, String(requestId), String(note ?? ""));
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

/** The return page after paying for several people. */
export async function checkBulkAction(campId: string, reference: string) {
  return look(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    // A leader sees only the payments they made themselves.
    const mine = await getBulkReceipt(String(campId), String(reference));
    if (staff.role === "leader" && mine?.paid_by !== staff.email) throw new CampError("That payment isn't one of yours.");
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

// ─── Leader codes (admins only) ──────────────────────────────────────────────

/** A new sign-in code for a fellowship or PFCC leader, shown once. The old one stops working. */
export async function newLeaderCodeAction(kind: "fellowship" | "pfcc", value: string) {
  return run(async () => {
    const staff = await requireCampRole("admin");
    return newLeaderCode(staff.email, kind === "pfcc" ? "pfcc" : "fellowship", String(value));
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
    const staff = await requireCampRole("coordinator", "leader");
    const ids = Array.isArray(registrationIds) ? registrationIds.map(String) : [];
    const payments = await listOpenPaymentsFor(String(campId), await idsInScope(String(campId), ids, scopeFor(staff)));
    return { me: staff.email, payments };
  });
}

/** "Cancel it": gives up on an unfinished checkout once Paystack confirms nobody paid. Logged. */
export async function cancelPaymentAction(campId: string, reference: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator", "leader");
    if (staff.role === "leader" && !(await leaderMayCancel(staff, String(campId), String(reference)))) throw new CampError("That payment isn't for your people.");
    const { status } = await cancelPayment(String(campId), String(reference));
    await batch("app", [
      auditStatement({ actor: staff.email, campId: String(campId), action: "payment.cancel", entity: "payment", entityId: String(reference), after: { status } }),
    ]);
    return status;
  });
}
