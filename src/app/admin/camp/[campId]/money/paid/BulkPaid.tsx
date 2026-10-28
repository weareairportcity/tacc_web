"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock } from "lucide-react";
import type { BulkReceipt } from "@/lib/camp/reports";
import { actorName } from "@/lib/camp/history-words";
import { formatCedis } from "@/lib/camp/money";
import { CommuneLoader } from "@/components/camp/brand";
import { headlineClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { checkBulkAction } from "../../../actions";

type State = { status: "pending" | "success" | "failed"; people: number; credited: number; receipt: BulkReceipt | null } | { error: string } | null;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

/**
 * Where Paystack sends a coordinator back after paying for several people,
 * and the receipt for one of those payments (from Money). Waits for Paystack
 * to confirm; the webhook is what really credits it.
 */
export function BulkPaid({ campId, reference, leader }: { campId: string; reference: string; leader: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>(null);
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const r = await checkBulkAction(campId, reference);
      if (!r.ok) return setState({ error: r.error });
      setState(r.data);
      if (r.data.status === "pending" && ++tries < 30) timer = setTimeout(check, 4000);
      // Settled: the "still processing" card on every page goes.
      else if (r.data.status !== "pending") router.refresh();
    };
    check();
    return () => clearTimeout(timer);
  }, [campId, reference, router]);

  const receipt = state && "receipt" in state ? state.receipt : null;
  const done = state && "status" in state && state.status === "success";
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 pt-6">
      <div className="flex flex-col items-start gap-3">
        {!state || ("status" in state && state.status === "pending") ? (
          <>
            <CommuneLoader size={56} />
            <h1 className={`${headlineClass} text-[32px]`}>Confirming with Paystack…</h1>
            <p className="text-[15px] text-warm-gray">Mobile money can take a minute.</p>
          </>
        ) : done ? (
          <>
            <h1 className={`cm-rise ${headlineClass} text-[32px]`}>
              <span className="text-cyan-edge">{state.credited}</span> {state.credited === 1 ? "balance" : "balances"} cleared
            </h1>
            {state.credited < state.people && <p className="text-[15px]">{state.people - state.credited} had already paid. That money is waiting for a refund on Money.</p>}
          </>
        ) : (
          <>
            <h1 className={`${headlineClass} text-[32px]`}>The payment didn&apos;t go through</h1>
            <p className="text-[15px] text-warm-gray">{"error" in state ? state.error : "Nothing was charged."}</p>
          </>
        )}
      </div>

      {receipt && (
        <section className="cm-rise flex flex-col overflow-hidden rounded-[16px] bg-white shadow-[0_12px_45px_rgba(17,12,46,0.12)]">
          <ul aria-label="People paid for" className="flex flex-col">
            {receipt.people.map((p) => {
              const paid = p.status === "success";
              return (
                <li key={p.id} className="flex min-h-14 items-center gap-3 border-b border-stone-border px-5 py-2.5 text-[15px]">
                  <span
                    role="img"
                    className={cn("flex h-6 w-6 flex-none items-center justify-center rounded-full", paid ? "bg-st-paid text-white" : "bg-stone-canvas text-warm-gray")}
                    aria-label={paid ? "Cleared" : p.flag ? "Waiting for a refund" : p.status === "pending" ? "Processing" : "Not cleared"}
                  >
                    {paid ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{p.full_name}</span>
                    <span className="text-[13px] text-warm-gray">
                      {p.fellowship}
                      {p.flag && " · already paid, refund waiting"}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatCedis(p.amount_pesewas)}</span>
                </li>
              );
            })}
          </ul>
          <dl className="flex flex-col gap-1.5 bg-stone-canvas/60 px-5 py-4 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt className="text-warm-gray">Balances</dt>
              <dd>{formatCedis(receipt.amount_pesewas)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-warm-gray">Paystack fee</dt>
              <dd>{formatCedis(receipt.fee_pesewas)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-border pt-2 text-[15px] font-semibold">
              <dt>Charged</dt>
              <dd>{formatCedis(receipt.charged_pesewas)}</dd>
            </div>
          </dl>
          <p className="flex flex-wrap gap-x-3 gap-y-1 px-5 py-3.5 text-[13px] text-warm-gray">
            <span>{actorName(receipt.paid_by, null)}</span>
            <span>{when(receipt.paid_at ?? receipt.created_at)}</span>
            {receipt.note && <span>{receipt.note}</span>}
            <span className="font-mono">{receipt.reference}</span>
          </p>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`${leader ? "/leaders" : "/admin/camp"}/${campId}/people`} className={`${primaryButtonClass} h-12`}>
          Back to People
        </Link>
        {!leader && (
          <Link href={`/admin/camp/${campId}/money`} className="cm-press inline-flex h-12 items-center rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
            Money
          </Link>
        )}
      </div>
    </div>
  );
}
