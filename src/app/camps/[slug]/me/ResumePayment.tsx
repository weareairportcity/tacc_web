"use client";

import type { OpenPayment } from "@/lib/camp/payments";
import { OpenPaymentCard, OpenPaymentDock } from "@/components/camp/OpenPayment";
import { cancelMyPaymentAction } from "../actions";

/** The attendee's payment still processing, floating until it finishes: Resume or Cancel it. */
export function ResumePayment({ slug, payment }: { slug: string; payment: OpenPayment }) {
  const own = payment.kind === "single";
  return (
    <OpenPaymentDock label="Payment still processing">
      <OpenPaymentCard
        payment={payment}
        title={own ? "Your payment is processing" : "A coordinator is paying for you"}
        canResume={own}
        onCancel={own ? (ref) => cancelMyPaymentAction(slug, ref) : null}
        className="pr-11"
      />
    </OpenPaymentDock>
  );
}
