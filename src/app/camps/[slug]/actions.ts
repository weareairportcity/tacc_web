"use server";

import { revalidatePath } from "next/cache";
import { getCampBySlug } from "@/lib/camp/camps";
import { formatCode, hashCode } from "@/lib/camp/codes";
import { cedisToPesewas } from "@/lib/camp/money";
import { checkPayment, startPayment } from "@/lib/camp/payments";
import { allow, clientIp } from "@/lib/camp/rate-limit";
import {
  acceptInvite,
  cancelInvite,
  createGroup,
  declineInvite,
  invite,
  joinByCode,
  leaveGroup,
  removeMember,
  searchInvitees,
  setLocked,
} from "@/lib/camp/groups";
import { findByCode, register, resetCode } from "@/lib/camp/registrations";
import { campOrigin as origin } from "@/lib/camp/origin";
import { currentAttendee, endAttendeeSession, startAttendeeSession } from "@/lib/camp/session";
import { CampError, type PaymentStatus, type Registration, type RegistrationInput } from "@/lib/camp/types";
import { sendSMS } from "@/lib/mnotify";

/**
 * Attendee actions. Server actions are reachable by direct POST, so each one
 * looks up the camp and the signed-in attendee itself, and acts only on that
 * attendee's own registration. Errors come back as values.
 */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const MINUTE = 60 * 1000;

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof CampError) return { ok: false, error: err.message };
    console.error("camp action failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

async function campFor(slug: string) {
  const camp = await getCampBySlug(String(slug));
  if (!camp) throw new CampError("This camp isn't available.");
  return camp;
}

async function limit(key: string, max: number, windowMs: number) {
  if (!(await allow(key, max, windowMs))) throw new CampError("Too many attempts. Please wait a few minutes and try again.");
}


const codeText = (campName: string, code: string, url: string) =>
  `TACC ${campName}: your camp sign-in code is ${formatCode(code)}. Keep it private. Sign in at ${url}`;

export async function registerAction(slug: string, input: RegistrationInput) {
  return run(async () => {
    const camp = await campFor(slug);
    await limit(`register:${await clientIp()}`, 10, 60 * MINUTE);
    const { id, code } = await register(camp, input);
    await startAttendeeSession(id, hashCode(code));
    // The code is also on screen, so a failed text doesn't block anyone.
    await sendSMS(input.phone, codeText(camp.name, code, `${await origin()}/camps/${camp.slug}`)).catch(() => false);
    return { code: formatCode(code) };
  });
}

export async function signInAction(slug: string, code: string) {
  return run(async () => {
    const camp = await campFor(slug);
    await limit(`signin:${await clientIp()}`, 10, 15 * MINUTE);
    const found = await findByCode(camp.id, code);
    if (!found) throw new CampError("That code doesn't match a registration for this camp.");
    await startAttendeeSession(found.id, found.codeHash);
    return null;
  });
}

/** Always answers the same way, so it can't be used to find out who registered. */
export async function forgotCodeAction(slug: string, phone: string) {
  return run(async () => {
    const camp = await campFor(slug);
    await limit(`forgot:${await clientIp()}`, 5, 60 * MINUTE);
    await limit(`forgot-phone:${camp.id}:${String(phone).replace(/\D/g, "").slice(-9)}`, 3, 24 * 60 * MINUTE);
    const reset = await resetCode(camp.id, phone);
    if (reset) await sendSMS(reset.phone, codeText(camp.name, reset.code, `${await origin()}/camps/${camp.slug}`));
    return null;
  });
}

export async function signOutAction() {
  await endAttendeeSession();
}

export async function payAction(slug: string, amountCedis: string) {
  return run(async () => {
    const camp = await campFor(slug);
    const me = await currentAttendee(camp.id);
    if (!me) throw new CampError("Please sign in again.");
    if (me.status === "cancelled") throw new CampError("This registration has been cancelled.");
    const amount = cedisToPesewas(amountCedis);
    const balance = me.price_pesewas - me.paid_pesewas;
    if (balance <= 0) throw new CampError("You're already fully paid.");
    if (amount < 100) throw new CampError("The smallest payment is GHS 1.00.");
    if (amount > balance) throw new CampError("That's more than your balance.");
    const checkout = await startPayment(me.id, amount, `${await origin()}/camps/${camp.slug}/paid`);
    return { url: checkout.authorization_url };
  });
}

export async function checkPaymentAction(slug: string, reference: string) {
  return run<PaymentStatus>(async () => {
    const camp = await campFor(slug);
    const me = await currentAttendee(camp.id);
    if (!me) throw new CampError("Please sign in again.");
    const status = await checkPayment(me.id, String(reference));
    if (status !== "pending") revalidatePath(`/camps/${camp.slug}/me`);
    return status;
  });
}

// ─── Roommate groups ─────────────────────────────────────────────────────────
// Each action acts as the signed-in attendee only; groups.ts re-checks that
// they're the owner, a member or the invitee before changing anything.

async function signedIn(slug: string) {
  const camp = await campFor(slug);
  const me = await currentAttendee(camp.id);
  if (!me) throw new CampError("Please sign in again.");
  return { camp, me };
}

/** Runs a group change, then refreshes the attendee's pages. */
function groupAction<T>(slug: string, fn: (me: Registration) => Promise<T>) {
  return run(async () => {
    const { camp, me } = await signedIn(slug);
    const result = await fn(me);
    revalidatePath(`/camps/${camp.slug}`, "layout");
    return result;
  });
}

export async function createGroupAction(slug: string) {
  return groupAction(slug, async (me) => {
    await createGroup(me);
    return null;
  });
}

export async function joinGroupAction(slug: string, code: string) {
  return groupAction(slug, async (me) => {
    await limit(`group-join-ip:${await clientIp()}`, 20, 15 * MINUTE);
    await joinByCode(me, String(code));
    return null;
  });
}

export async function leaveGroupAction(slug: string) {
  return groupAction(slug, (me) => leaveGroup(me).then(() => null));
}

export async function removeMemberAction(slug: string, registrationId: string) {
  return groupAction(slug, (me) => removeMember(me, String(registrationId)).then(() => null));
}

export async function setGroupLockedAction(slug: string, locked: boolean) {
  return groupAction(slug, (me) => setLocked(me, locked === true).then(() => null));
}

export async function searchInviteesAction(slug: string, term: string) {
  return run(async () => searchInvitees((await signedIn(slug)).me, String(term)));
}

export async function inviteAction(slug: string, registrationId: string) {
  return groupAction(slug, (me) => invite(me, String(registrationId)).then(() => null));
}

export async function cancelInviteAction(slug: string, inviteId: string) {
  return groupAction(slug, (me) => cancelInvite(me, String(inviteId)).then(() => null));
}

export async function acceptInviteAction(slug: string, inviteId: string) {
  return groupAction(slug, (me) => acceptInvite(me, String(inviteId)).then(() => null));
}

export async function declineInviteAction(slug: string, inviteId: string) {
  return groupAction(slug, (me) => declineInvite(me, String(inviteId)).then(() => null));
}
