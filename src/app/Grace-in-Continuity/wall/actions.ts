"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { clearSession, currentRole, roleForCode, setSession } from "@/lib/grace/auth";
import { getNoteFolder, trashNote } from "@/lib/grace/drive";

const DRIVE_ID = /^[\w-]{10,100}$/;

// Wrong-code attempts per IP. Per server instance only, so it slows guessing
// rather than stopping it outright; the pause on every miss does the rest.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export type UnlockState = { error: string | null };

export async function unlock(_prev: UnlockState, form: FormData): Promise<UnlockState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    return { error: "Too many wrong tries. Please wait 10 minutes and try again." };
  }

  const role = roleForCode(String(form.get("code") ?? ""));
  if (!role) {
    const fresh = !entry || entry.resetAt <= now;
    attempts.set(ip, {
      count: fresh ? 1 : entry.count + 1,
      resetAt: fresh ? now + WINDOW_MS : entry.resetAt,
    });
    await new Promise((r) => setTimeout(r, 800));
    return { error: "That code is not right. Please check it and try again." };
  }

  attempts.delete(ip);
  await setSession(role);
  revalidatePath("/Grace-in-Continuity/wall");
  return { error: null };
}

export async function lock() {
  await clearSession();
  revalidatePath("/Grace-in-Continuity/wall");
}

export async function deleteNote(id: string): Promise<{ error: string | null }> {
  if ((await currentRole()) !== "admin") {
    return { error: "Only the admin code can delete notes." };
  }
  if (!DRIVE_ID.test(id) || !(await getNoteFolder(id))) {
    return { error: "This note was already removed." };
  }
  try {
    await trashNote(id);
  } catch (err) {
    console.error("[grace/delete]", err);
    return { error: "We could not delete this note. Please try again." };
  }
  revalidatePath("/Grace-in-Continuity/wall");
  return { error: null };
}
