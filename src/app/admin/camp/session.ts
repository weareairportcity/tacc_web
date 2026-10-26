"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { signInLeader, signOutLeader } from "@/lib/camp/leaders";
import { allow, clientIp } from "@/lib/camp/rate-limit";

/** Signs out of Commune: a coordinator's Supabase session and a leader's code session alike. */
export async function signOutAction() {
  const supabase = await createClient();
  await Promise.all([supabase.auth.signOut(), signOutLeader()]);
  redirect("/admin/camp/sign-in");
}

/** After a coordinator signs in with their email: a leader code used earlier on this device stops counting. */
export async function endLeaderSessionAction() {
  await signOutLeader();
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
