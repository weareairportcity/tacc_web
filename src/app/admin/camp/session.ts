"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { currentStaff } from "@/lib/camp/auth";
import { signInLeader, signOutLeader } from "@/lib/camp/leaders";
import { noteAccess, notePresence, type AccessRole } from "@/lib/camp/logs";
import { allowVisitor } from "@/lib/camp/rate-limit";
import type { Staff } from "@/lib/camp/types";

const roleOf = (staff: Staff): AccessRole => staff.role;

/** Signs a coordinator out. A leader code on the same device stays signed in on the leaders' side. */
export async function signOutAction() {
  const staff = await currentStaff().catch(() => null);
  if (staff) await noteAccess({ actor: staff.email, role: roleOf(staff), event: "sign_out" });
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/camp/sign-in");
}

/** Signs a leader out. A coordinator on the same device stays signed in on the coordinators' side. */
export async function leaderSignOutAction() {
  await signOutLeader();
  redirect("/leaders");
}

/** A leader's sign-in code. Rate-limited per phone, with a ceiling per address: the code is the only credential. */
export async function leaderSignInAction(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await allowVisitor("leader-signin", 10, 100, 15 * 60 * 1000))) {
    return { ok: false, error: "Too many tries. Wait a few minutes and try again." };
  }
  try {
    const leader = await signInLeader(String(code ?? ""));
    if (!leader) await noteAccess({ actor: "visitor", role: "visitor", event: "sign_in_failed", ok: false });
    return leader ? { ok: true } : { ok: false, error: "That code doesn't match. Check it and try again." };
  } catch (err) {
    console.error("leader sign-in failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * A coordinator's password sign-in happens in the browser (Supabase), so the page reports it
 * here once it worked; the session cookie says who it was. A failed one says only which email
 * was typed, which the log marks as not signed in.
 */
export async function noteStaffSignInAction(ok: boolean, typedEmail?: string) {
  if (ok) {
    const staff = await currentStaff().catch(() => null);
    if (staff) await noteAccess({ actor: staff.email, role: roleOf(staff), event: "sign_in" });
    return;
  }
  if (!(await allowVisitor("staff-signin-note", 20, 200, 15 * 60 * 1000))) return;
  const email = String(typedEmail ?? "").trim().toLowerCase().slice(0, 120);
  await noteAccess({ actor: /^[^\s@]+@[^\s@]+$/.test(email) ? email : "visitor", role: "coordinator", event: "sign_in_failed", ok: false });
}

/** "I'm here": a coordinator's or leader's tab is open (Seen.tsx, every few minutes). */
export async function staffSeenAction(campId: string | null) {
  const staff = await currentStaff().catch(() => null);
  if (!staff) return;
  const camp = typeof campId === "string" && /^[0-9a-f-]{36}$/i.test(campId) ? campId : null;
  await notePresence(staff.email, roleOf(staff), camp);
}
