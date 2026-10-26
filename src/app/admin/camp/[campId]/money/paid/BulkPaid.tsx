"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CommuneLoader } from "@/components/camp/brand";
import { headlineClass, primaryButtonClass } from "@/components/camp/ui";
import { checkBulkAction } from "../../../actions";

type State = { status: "pending" | "success" | "failed"; people: number; credited: number } | { error: string } | null;

/** Waits for Paystack to confirm, then says how many balances were cleared. The webhook is what really credits it. */
export function BulkPaid({ campId, reference }: { campId: string; reference: string }) {
  const [state, setState] = useState<State>(null);
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const r = await checkBulkAction(campId, reference);
      if (!r.ok) return setState({ error: r.error });
      setState(r.data);
      if (r.data.status === "pending" && ++tries < 30) timer = setTimeout(check, 4000);
    };
    check();
    return () => clearTimeout(timer);
  }, [campId, reference]);

  const done = state && "status" in state && state.status === "success";
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-5 pt-10">
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
      <Link href={`/admin/camp/${campId}/people`} className={`${primaryButtonClass} h-12`}>
        Back to People
      </Link>
    </div>
  );
}
