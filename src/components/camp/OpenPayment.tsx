"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, X } from "lucide-react";
import type { OpenPayment } from "@/lib/camp/payments";
import type { PaymentStatus } from "@/lib/camp/types";
import { formatCedis } from "@/lib/camp/money";
import { Busy } from "@/components/camp/brand";
import { cn } from "@/lib/utils";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const AFTER: Record<PaymentStatus, string> = {
  failed: "Cancelled. You can pay again.",
  pending: "Mobile money is still waiting for approval on the phone. Approve or decline it there.",
  success: "It went through. Balances are updated.",
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

/**
 * A payment that's still processing, with a way out: Resume goes back to the
 * same Paystack checkout; Cancel it asks Paystack and clears it if nobody paid.
 */
export function OpenPaymentCard({
  payment,
  title,
  canResume,
  onCancel,
  className,
}: {
  payment: OpenPayment;
  title: string;
  canResume: boolean;
  onCancel: ((reference: string) => Promise<ActionResult<PaymentStatus>>) | null;
  className?: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <div role="status" className={cn("flex flex-col gap-3 rounded-[14px] border border-stone-border bg-white p-4", className)}>
      <p className="flex items-start gap-2.5 text-sm">
        <Clock className="mt-0.5 h-4 w-4 flex-none text-st-part" strokeWidth={1.8} aria-hidden="true" />
        <span className="flex flex-col">
          <span className="font-medium">{title}</span>
          <span className="tabular-nums text-warm-gray">
            {formatCedis(payment.amount_pesewas)} · started {time(payment.created_at)}
          </span>
        </span>
      </p>
      {note && <p className="text-[13px]">{note}</p>}
      {(canResume || onCancel) && (
        <div className="flex gap-2">
          {canResume && payment.checkout_url && (
            <a href={payment.checkout_url} className="cm-press inline-flex h-10 flex-1 items-center justify-center rounded-full border border-cyan-edge bg-cyan-signal px-4 text-sm font-medium text-ink-black">
              Resume
            </a>
          )}
          {onCancel && (
            <button
              type="button"
              disabled={pending}
              aria-busy={pending}
              onClick={() =>
                start(async () => {
                  const r = await onCancel(payment.reference);
                  if (!r.ok) return setNote(r.error);
                  setNote(AFTER[r.data]);
                  if (r.data !== "pending") router.refresh();
                })
              }
              className="cm-press inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-stone-border bg-white px-4 text-sm font-medium disabled:opacity-60"
            >
              <Busy pending={pending} text="Checking…" size={18}>
                Cancel it
              </Busy>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Floats above the page (and above the phone's bottom bar) until the payment
 * finishes or is hidden. Steps aside while people are selected on People, whose
 * bar sits in the same place (and whose Pay sheet shows the same card).
 */
export function OpenPaymentDock({ children, label }: { children: React.ReactNode; label: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <aside
      aria-label={label}
      className="cm-rise fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 flex flex-col gap-2 sm:left-auto sm:right-6 sm:w-[360px] lg:bottom-6 [body:has([data-selection-bar])_&]:hidden"
    >
      <div className="relative flex flex-col gap-2 rounded-[16px] shadow-[0_12px_45px_rgba(17,12,46,0.16)]">
        {children}
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Hide"
          className="cm-press absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full text-warm-gray"
        >
          <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
