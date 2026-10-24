"use server";

import { revalidatePath } from "next/cache";
import { requireCampRole } from "@/lib/camp/auth";
import { createCamp, updateCamp } from "@/lib/camp/camps";
import type { CsvError } from "@/lib/camp/csv";
import { cedisToPesewas } from "@/lib/camp/money";
import {
  createRoom,
  createRoomType,
  deleteRoom,
  deleteRoomType,
  importRooms,
  updateRoom,
  updateRoomType,
} from "@/lib/camp/rooms";
import { assignGroup, assignPerson, unassign } from "@/lib/camp/assignments";
import { cancelRegistration } from "@/lib/camp/registrations";
import { removeStaff, saveStaff } from "@/lib/camp/staff";
import { CampError, type CampInput, type RoomInput, type Staff } from "@/lib/camp/types";

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
