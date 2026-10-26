"use server";

import { revalidatePath } from "next/cache";
import { getCampBySlug } from "@/lib/camp/camps";
import { formatCode, hashCode } from "@/lib/camp/codes";
import { submitFeedback, type FeedbackInput } from "@/lib/camp/feedback";
import { cedisToPesewas } from "@/lib/camp/money";
import { cancelPayment, checkPayment, startPayment, startPaymentFor } from "@/lib/camp/payments";
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
import { AlreadyRegistered, findByCode, getRegistration, listPayments, register, resetCode } from "@/lib/camp/registrations";
import { cancelMine, deleteMyDetails, setAnyRoom, updateProfile } from "@/lib/camp/profile";
import { askForRefund, askForRoomChange, withdrawRequest } from "@/lib/camp/requests";
import { makeToken, readToken } from "@/lib/camp/tokens";
import { campOrigin as origin } from "@/lib/camp/origin";
import { currentAttendee, endAttendeeSession, startAttendeeSession } from "@/lib/camp/session";
import { CampError, type PaymentStatus, type ProfileInput, type Registration, type RegistrationInput } from "@/lib/camp/types";
import { COMMUNE_SENDER, sendSMS } from "@/lib/mnotify";

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
  `${campName}: your sign-in code is ${formatCode(code)}. Keep it private. Sign in at ${url}`;

/** `registered`: that phone is already registered, so the page sends them to sign in instead. */
export async function registerAction(slug: string, input: RegistrationInput) {
  return run<{ code: string } | { registered: true }>(async () => {
    const camp = await campFor(slug);
    await limit(`register:${await clientIp()}`, 10, 60 * MINUTE);
    let created;
    try {
      created = await register(camp, input);
    } catch (err) {
      if (err instanceof AlreadyRegistered) return { registered: true as const };
      throw err;
    }
    const { id, code } = created;
    await startAttendeeSession(id, hashCode(code));
    // The code is also on screen, so a failed text doesn't block anyone.
    await sendSMS(input.phone, codeText(camp.name, code, `${await origin()}/camps/${camp.slug}`), COMMUNE_SENDER).catch(() => false);
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
    if (reset) await sendSMS(reset.phone, codeText(camp.name, reset.code, `${await origin()}/camps/${camp.slug}`), COMMUNE_SENDER);
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

export type PaymentCheck = { status: PaymentStatus; amount: number; fee: number; paid: number; price: number };

/** The payment's state plus the attendee's totals after it, for the "payment received" screen. */
export async function checkPaymentAction(slug: string, reference: string) {
  return run<PaymentCheck>(async () => {
    const camp = await campFor(slug);
    const me = await currentAttendee(camp.id);
    if (!me) throw new CampError("Please sign in again.");
    const status = await checkPayment(me.id, String(reference));
    if (status !== "pending") revalidatePath(`/camps/${camp.slug}/me`);
    const [fresh, payments] = await Promise.all([getRegistration(me.id), listPayments(me.id)]);
    const payment = payments.find((p) => p.reference === reference);
    return {
      status,
      amount: payment?.amount_pesewas ?? 0,
      fee: payment?.fee_pesewas ?? 0,
      paid: fresh?.paid_pesewas ?? me.paid_pesewas,
      price: fresh?.price_pesewas ?? me.price_pesewas,
    };
  });
}

/** "Cancel it" on the attendee's own payment that's still processing. Paystack is asked first. */
export async function cancelMyPaymentAction(slug: string, reference: string) {
  return run(async () => {
    const camp = await campFor(slug);
    const me = await currentAttendee(camp.id);
    if (!me) throw new CampError("Please sign in again.");
    const payment = (await listPayments(me.id)).find((p) => p.reference === String(reference) && p.status === "pending" && !p.bulk_id);
    if (!payment) throw new CampError("That payment has already finished.");
    const { status } = await cancelPayment(camp.id, payment.reference);
    revalidatePath(`/camps/${camp.slug}/me`);
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

// ─── Your details, cancelling, requests ──────────────────────────────────────

/** Runs something as the signed-in attendee, then refreshes their pages. */
function mine<T>(slug: string, fn: (me: Registration, camp: Awaited<ReturnType<typeof campFor>>) => Promise<T>) {
  return run(async () => {
    const { camp, me } = await signedIn(slug);
    const result = await fn(me, camp);
    revalidatePath(`/camps/${camp.slug}`, "layout");
    return result;
  });
}

export async function updateMyDetailsAction(slug: string, input: ProfileInput) {
  return mine(slug, (me) => updateProfile(`attendee:${me.id}`, me.id, input).then(() => null));
}

export async function setAnyRoomAction(slug: string, anyRoom: boolean) {
  return mine(slug, (me) => setAnyRoom(me, anyRoom === true).then(() => null));
}

export async function cancelMineAction(slug: string, reason: string, deleteDetails: boolean) {
  return run(async () => {
    const { camp, me } = await signedIn(slug);
    const result = await cancelMine(me, String(reason ?? ""), deleteDetails === true);
    if (deleteDetails === true) await endAttendeeSession();
    revalidatePath(`/camps/${camp.slug}`, "layout");
    return result;
  });
}

export async function deleteMyDetailsAction(slug: string) {
  return run(async () => {
    const { camp, me } = await signedIn(slug);
    await deleteMyDetails(me);
    await endAttendeeSession();
    revalidatePath(`/camps/${camp.slug}`, "layout");
    return null;
  });
}

export async function askRefundAction(slug: string, amountCedis: string, reason: string) {
  return mine(slug, (me) => askForRefund(me, cedisToPesewas(String(amountCedis)), String(reason ?? "")).then(() => null));
}

export async function askRoomChangeAction(slug: string, roomTypeId: string, reason: string) {
  return mine(slug, (me) => askForRoomChange(me, String(roomTypeId), String(reason ?? "")).then(() => null));
}

export async function withdrawRequestAction(slug: string, requestId: string) {
  return mine(slug, (me) => withdrawRequest(me, String(requestId)).then(() => null));
}

/** A link a parent or sponsor can open to pay this registration without signing in. */
export async function myPayLinkAction(slug: string) {
  return run(async () => {
    const { camp, me } = await signedIn(slug);
    return `${await origin()}/camps/${camp.slug}/pay/${makeToken("pay", me.id)}`;
  });
}

/** Someone paying through a pay link. The link names the registration; nothing else can be paid with it. */
export async function payViaLinkAction(slug: string, token: string, amountCedis: string, payerName: string, payerEmail: string) {
  return run(async () => {
    const camp = await campFor(slug);
    await limit(`paylink:${await clientIp()}`, 20, 60 * MINUTE);
    const id = readToken("pay", String(token));
    const reg = id ? await getRegistration(id) : null;
    if (!reg || reg.camp_id !== camp.id) throw new CampError("This pay link isn't valid.");
    if (reg.status === "cancelled") throw new CampError("This registration has been cancelled.");
    const balance = reg.price_pesewas - reg.paid_pesewas;
    if (balance <= 0) throw new CampError(`${reg.full_name.split(" ")[0]} is already fully paid.`);
    const amount = cedisToPesewas(String(amountCedis));
    if (amount < 100) throw new CampError("The smallest payment is GHS 1.00.");
    if (amount > balance) throw new CampError("That's more than what's outstanding.");
    const email = String(payerEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CampError("Enter your email for the receipt.");
    const checkout = await startPaymentFor(reg.id, amount, `${await origin()}/camps/${camp.slug}/pay/${token}/done`, {
      email,
      name: String(payerName ?? "").trim().slice(0, 80),
    });
    return checkout.authorization_url;
  });
}

/** The pay-link return page: has it gone through? Same check as the attendee's own. */
export async function checkLinkPaymentAction(slug: string, token: string, reference: string) {
  return run(async () => {
    const camp = await campFor(slug);
    const id = readToken("pay", String(token));
    const reg = id ? await getRegistration(id) : null;
    if (!reg || reg.camp_id !== camp.id) throw new CampError("This pay link isn't valid.");
    return checkPayment(reg.id, String(reference));
  });
}

/** The after-camp feedback form. The link names who it's for; the answer is saved without it. */
export async function submitFeedbackAction(slug: string, token: string, input: FeedbackInput) {
  return run(async () => {
    const camp = await campFor(slug);
    await limit(`feedback:${await clientIp()}`, 30, 60 * MINUTE);
    await submitFeedback(camp, String(token), {
      rating: Number(input?.rating),
      best: String(input?.best ?? ""),
      change: String(input?.change ?? ""),
    });
    return null;
  });
}
