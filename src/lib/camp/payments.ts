import { post, query } from "@/lib/cf";
import { checkId } from "./camps";
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

/**
 * Gives up on a payment nobody finished, after asking Paystack (see the
 * Worker's payCancel). "pending" means mobile money is still waiting for
 * approval on a phone; "success" means it went through after all.
 */
export function cancelPayment(campId: string, reference: string) {
  return worker<{ status: PaymentStatus }>("/v1/admin/camp/pay-cancel", { camp_id: campId, reference });
}

export type OpenPayment = {
  reference: string;
  /** "bulk" is a coordinator paying for several people; "single" is one person's own checkout. */
  kind: "bulk" | "single";
  paid_by: string;
  /** For a single payment, whose balance; for a bulk one, how many people. */
  full_name: string | null;
  people: number;
  amount_pesewas: number;
  checkout_url: string | null;
  created_at: string;
};

/** The pay-for-people checkouts this coordinator started that haven't finished. */
export function listMyOpenBulkPayments(campId: string, email: string) {
  return query<OpenPayment>(
    "app",
    `SELECT b.reference, 'bulk' AS kind, b.paid_by, NULL AS full_name, b.amount_pesewas, b.checkout_url, b.created_at,
            (SELECT COUNT(*) FROM camp_payments p WHERE p.bulk_id = b.id) AS people
     FROM camp_bulk_payments b WHERE b.camp_id = ? AND b.paid_by = ? AND b.status = 'pending' ORDER BY b.created_at DESC LIMIT 5`,
    [checkId(campId, "camp"), email],
  );
}

/** What's holding up a payment for these people: their checkouts still processing. */
export function listOpenPaymentsFor(campId: string, registrationIds: string[]) {
  const ids = registrationIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!ids.length) return Promise.resolve([] as OpenPayment[]);
  return query<OpenPayment>(
    "app",
    `SELECT COALESCE(b.reference, p.reference) AS reference, CASE WHEN b.id IS NULL THEN 'single' ELSE 'bulk' END AS kind,
            COALESCE(b.paid_by, '') AS paid_by, r.full_name, COALESCE(b.amount_pesewas, p.amount_pesewas) AS amount_pesewas,
            COALESCE(b.checkout_url, p.checkout_url) AS checkout_url, p.created_at,
            CASE WHEN b.id IS NULL THEN 1 ELSE (SELECT COUNT(*) FROM camp_payments s WHERE s.bulk_id = b.id) END AS people
     FROM camp_payments p
     JOIN camp_registrations r ON r.id = p.registration_id
     LEFT JOIN camp_bulk_payments b ON b.id = p.bulk_id
     WHERE r.camp_id = ? AND p.status = 'pending' AND r.id IN (${ids.map(() => "?").join(",")})
     ORDER BY p.created_at DESC`,
    [checkId(campId, "camp"), ...ids],
  );
}
