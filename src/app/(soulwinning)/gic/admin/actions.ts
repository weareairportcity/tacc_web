"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { endAdminSession, isAdminCode, startAdminSession } from "@/lib/soulwinning/admin-auth";

// Wrong codes per IP (per server instance): slows guessing; the pause on
// every miss does the rest.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export type UnlockState = { error: string | null };

export async function unlockAdmin(_prev: UnlockState, form: FormData): Promise<UnlockState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    return { error: "Too many wrong tries. Please wait 10 minutes and try again." };
  }

  if (!isAdminCode(String(form.get("code") ?? ""))) {
    const fresh = !entry || entry.resetAt <= now;
    attempts.set(ip, { count: fresh ? 1 : entry.count + 1, resetAt: fresh ? now + WINDOW_MS : entry.resetAt });
    await new Promise((r) => setTimeout(r, 800));
    return { error: "That code is not right. Please check it and try again." };
  }

  attempts.delete(ip);
  await startAdminSession();
  revalidatePath("/gic/admin");
  return { error: null };
}

export async function lockAdmin() {
  await endAdminSession();
  revalidatePath("/gic/admin");
}
