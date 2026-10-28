"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { signInLeader, signOutLeader } from "@/lib/camp/leaders";
import { allow, clientIp } from "@/lib/camp/rate-limit";

/** Signs a coordinator out. A leader code on the same device stays signed in on the leaders' side. */
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/camp/sign-in");
}

/** Signs a leader out. A coordinator on the same device stays signed in on the coordinators' side. */
export async function leaderSignOutAction() {
  await signOutLeader();
  redirect("/leaders");
}

/** A leader's sign-in code. Rate-limited per address: the code is the only credential. */
export async function leaderSignInAction(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await allow(`leader-signin:${await clientIp()}`, 10, 15 * 60 * 1000))) {
    return { ok: false, error: "Too many tries. Wait a few minutes and try again." };
  }
  try {
    const leader = await signInLeader(String(code ?? ""));
    return leader ? { ok: true } : { ok: false, error: "That code doesn't match. Check it and try again." };
  } catch (err) {
    console.error("leader sign-in failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
