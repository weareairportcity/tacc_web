import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import { getReceipt } from "@/lib/camp/receipts";
import { formatDate, headlineClass } from "@/components/camp/ui";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Receipt · Commune", robots: { index: false, follow: false } };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

/**
 * The receipt for one payment. The link comes in the "payment received"
 * text and notification, and from the attendee's payments. Prints (or saves
 * as PDF) on one page.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const r = await getReceipt(decodeURIComponent(reference));
  if (!r) notFound();
  const left = Math.max(0, r.price_pesewas - r.paid_pesewas);
  const rows: [string, string][] = [
    ["For", `${r.full_name} · ${r.room_type_name}`],
    ...(r.payer_name ? ([["Paid by", r.payer_name]] as [string, string][]) : []),
    ["Date", when(r.paid_at)],
    ["Reference", r.reference],
    ...(r.transaction_id ? ([["expressPay transaction", r.transaction_id]] as [string, string][]) : []),
  ];

  return (
    <section className="cm-rise mx-auto mt-2 flex w-full max-w-[560px] flex-col gap-6 rounded-2xl bg-white p-6 shadow-seline-hero print:mt-0 print:shadow-none sm:p-8">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm text-st-paid">
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Payment received
        </p>
        <h1 className={`${headlineClass} text-[34px]`}>Receipt</h1>
        <p className="text-[15px] text-warm-gray">
          The Airport City Church · {r.camp_name}, {formatDate(r.starts_on)}
        </p>
      </header>

      <dl className="flex flex-col gap-1.5 rounded-[12px] bg-stone-canvas p-4 text-[15px] tabular-nums">
        <div className="flex justify-between gap-4">
          <dt className="text-warm-gray">Towards camp</dt>
          <dd>{formatCedis(r.amount_pesewas)}</dd>
        </div>
        {r.fee_pesewas > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-warm-gray">Payment fee</dt>
            <dd>{formatCedis(r.fee_pesewas)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t border-stone-border pt-1.5 font-semibold">
          <dt>{r.bulk ? "Paid for this person" : "Total paid"}</dt>
          <dd>{formatCedis(r.charged_pesewas)}</dd>
        </div>
      </dl>

      <dl className="flex flex-col text-[15px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-t border-stone-border py-2.5 first:border-t-0">
            <dt className="text-warm-gray">{k}</dt>
            <dd className={k === "Reference" || k === "expressPay transaction" ? "font-mono text-[13px]" : ""}>{v}</dd>
          </div>
        ))}
      </dl>

      <p className="rounded-[12px] border border-stone-border px-4 py-3 text-[15px]">
        {left === 0 ? (
          <>Fully paid. See you at camp!</>
        ) : (
          <>
            {formatCedis(left)} left to pay of {formatCedis(r.price_pesewas)} (as of today).
          </>
        )}
      </p>

      <PrintButton />
    </section>
  );
}
