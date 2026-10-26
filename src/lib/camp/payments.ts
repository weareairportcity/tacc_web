import { post } from "@/lib/cf";
import { CampError, type PaymentStatus } from "./types";

/**
 * The Next side of camp payments. The Worker holds the Paystack key and does
 * the real work (workers/soulwinning/src/camp.ts); callers here have already
 * checked that the signed-in attendee owns the registration.
 */

/** Worker errors meant for the attendee pass through; anything else is generic. */
async function worker<T>(path: string, body: unknown): Promise<T> {
  try {
    return await post<T>(path, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    // The Worker's user-facing messages are full sentences; internal ones aren't.
    if (/[.!?]$/.test(message)) throw new CampError(message);
    throw err;
  }
}

export type Checkout = {
  reference: string;
  authorization_url: string;
  amount_pesewas: number;
  fee_pesewas: number;
  charged_pesewas: number;
};

export function startPayment(registrationId: string, amountPesewas: number, callbackUrl: string) {
  return worker<Checkout>("/v1/admin/camp/pay-init", {
    registration_id: registrationId,
    amount_pesewas: amountPesewas,
    callback_url: callbackUrl,
  });
}

export async function checkPayment(registrationId: string, reference: string): Promise<PaymentStatus> {
  return (await worker<{ status: PaymentStatus }>("/v1/admin/camp/check", { registration_id: registrationId, reference }))
    .status;
}

/** A payment link opened by someone else (a parent or sponsor): their receipt email and name. */
export function startPaymentFor(registrationId: string, amountPesewas: number, callbackUrl: string, payer: { email: string; name: string }) {
  return worker<Checkout>("/v1/admin/camp/pay-init", {
    registration_id: registrationId,
    amount_pesewas: amountPesewas,
    callback_url: callbackUrl,
    payer_email: payer.email,
    payer_name: payer.name,
  });
}

export type BulkCheckout = Checkout & { people: number };

/** A coordinator paying several people's balances in one checkout. */
export function startBulkPayment(input: {
  campId: string;
  registrationIds: string[];
  paidBy: string;
  payerEmail: string;
  note: string;
  callbackUrl: string;
}) {
  return worker<BulkCheckout>("/v1/admin/camp/bulk-init", {
    camp_id: input.campId,
    registration_ids: input.registrationIds,
    paid_by: input.paidBy,
    payer_email: input.payerEmail,
    note: input.note,
    callback_url: input.callbackUrl,
  });
}

export function checkBulkPayment(campId: string, reference: string) {
  return worker<{ status: PaymentStatus; people: number; credited: number }>("/v1/admin/camp/bulk-check", { camp_id: campId, reference });
}

/** Sends money back through Paystack. Paystack's fees are never refunded. */
export function refundThroughPaystack(input: { registrationId: string; amountPesewas: number; actor: string; note: string; requestId?: string }) {
  return worker<{ refunded_pesewas: number; short_pesewas: number }>("/v1/admin/camp/refund", {
    registration_id: input.registrationId,
    amount_pesewas: input.amountPesewas,
    actor: input.actor,
    note: input.note,
    request_id: input.requestId,
  });
}
