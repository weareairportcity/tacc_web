"use client";

import type { OpenPayment } from "@/lib/camp/payments";
import { OpenPaymentCard, OpenPaymentDock } from "@/components/camp/OpenPayment";
import { cancelPaymentAction } from "../actions";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** The coordinator's own pay-for-people checkouts that haven't finished, floating on every page. */
export function OpenPayments({ campId, payments }: { campId: string; payments: OpenPayment[] }) {
  if (!payments.length) return null;
  return (
    <OpenPaymentDock label="Payments still processing">
      {payments.map((p) => (
        <OpenPaymentCard
          key={p.reference}
          payment={p}
          title={`Paying for ${people(p.people)}`}
          canResume
          onCancel={(ref) => cancelPaymentAction(campId, ref)}
          className="pr-11"
        />
      ))}
    </OpenPaymentDock>
  );
}

/** Inside "Pay for them": what's holding it up, and the way out. */
export function Blockers({ campId, me, payments }: { campId: string; me: string; payments: OpenPayment[] }) {
  return (
    <div className="flex flex-col gap-2">
      {payments.map((p) => (
        <OpenPaymentCard
          key={p.reference}
          payment={p}
          title={
            p.kind === "single"
              ? `${p.full_name}'s own payment`
              : p.paid_by === me
                ? `Your payment for ${people(p.people)}`
                : `${p.paid_by.split("@")[0]} paying for ${people(p.people)}`
          }
          canResume={p.kind === "bulk" && p.paid_by === me}
          onCancel={(ref) => cancelPaymentAction(campId, ref)}
        />
      ))}
    </div>
  );
}
