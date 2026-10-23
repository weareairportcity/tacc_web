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
