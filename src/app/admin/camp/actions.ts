"use server";

import { revalidatePath } from "next/cache";
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
  setPlacesLeft,
  updateRoom,
  updateRoomType,
} from "@/lib/camp/rooms";
import { changeRoomType, recordRefund } from "@/lib/camp/adjustments";
import { assignGroup, assignPerson, unassign } from "@/lib/camp/assignments";
import { cancelRegistration } from "@/lib/camp/registrations";
import { campOrigin } from "@/lib/camp/origin";
import { sendRoomSms } from "@/lib/camp/room-sms";
import { removeStaff, saveStaff } from "@/lib/camp/staff";
import { CAMP_PHOTOS, CampError, type CampInput, type CampPhoto, type Gender, type RoomInput, type Staff } from "@/lib/camp/types";

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

export async function assignPersonAction(roomId: string, registrationId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return (await assignPerson(staff.email, String(roomId), String(registrationId))).warning;
  });
}

export async function assignGroupAction(roomId: string, groupId: string) {
  return run(async () => {
    const staff = await requireCampRole("coordinator");
    return (await assignGroup(staff.email, String(roomId), String(groupId))).warning;
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
