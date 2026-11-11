import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { getReceipt } from "@/lib/camp/receipts";
import { GoBack } from "@/components/camp/GoBack";
import { CampLogo } from "@/components/camp/photos";
import { formatDate } from "@/components/camp/ui";
import { ReceiptActions } from "./PrintButton";

export const metadata: Metadata = { title: "Receipt · Commune", robots: { index: false, follow: false } };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

const METHOD: Record<string, string> = { momo: "Mobile money", card: "Card" };

/**
 * The receipt for one payment: what was paid stands out first (the big
 * amount and tick), then who it was for and by, then the references a
 * coordinator or bank might ask for. Looks like a paper receipt, prints as
 * one page (nothing else on the page prints), and can be shared.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const r = await getReceipt(decodeURIComponent(reference));
  if (!r) notFound();
  const camp = await getCampBySlug(r.camp_slug);
  const left = Math.max(0, r.price_pesewas - r.paid_pesewas);

  const who: [string, string][] = [
    ["Attendee", r.full_name],
    ["Room type", r.room_type_name],
    ...(r.payer_name ? ([["Paid by", r.bulk ? `${r.payer_name} (for several people)` : r.payer_name]] as [string, string][]) : []),
    ["Date", when(r.paid_at)],
    ...(r.method && METHOD[r.method] ? ([["Paid with", METHOD[r.method]]] as [string, string][]) : []),
  ];
  const refs: [string, string][] = [
    ["Receipt no.", r.reference],
    ...(r.transaction_id ? ([["expressPay ref.", r.transaction_id]] as [string, string][]) : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 pb-8 pt-2">
      {/* Only the receipt itself prints. */}
      <style>{`@media print { body * { visibility: hidden !important; } #receipt, #receipt * { visibility: visible !important; } #receipt { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; } }`}</style>
      <GoBack fallback={`/camps/${r.camp_slug}/me`} />

      <article id="receipt" aria-label={`Receipt ${r.reference}`} className="cm-rise relative overflow-hidden rounded-[22px] bg-white shadow-seline-hero">
        <header className="flex items-center gap-3 border-b border-stone-border px-6 py-4">
          {camp && <CampLogo camp={camp} size={40} />}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-medium">{r.camp_name}</span>
            <span className="text-[13px] text-warm-gray">
              The Airport City Church · {formatDate(r.starts_on)}
            </span>
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-warm-gray">Receipt</span>
        </header>

        {/* The one thing to see first: it went through, and how much. */}
        <section className="flex flex-col items-center gap-3 px-6 pb-6 pt-7 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-st-paid/12">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-st-paid">
              <Check className="h-6 w-6 text-white" strokeWidth={2.6} aria-hidden="true" />
            </span>
          </span>
          <p className="text-[15px] text-warm-gray">{r.bulk ? "Paid for this person" : "Payment received"}</p>
          <p className="font-display text-[44px] leading-none tracking-[-0.03em] tabular-nums">{formatCedis(r.charged_pesewas)}</p>
          {r.fee_pesewas > 0 && (
            <p className="text-[13px] text-warm-gray tabular-nums">
              {formatCedis(r.amount_pesewas)} towards camp + {formatCedis(r.fee_pesewas)} payment fee
            </p>
          )}
        </section>

        <Tear />

        <dl className="flex flex-col px-6 py-2 text-[15px]">
          {who.map(([k, v]) => (
            <Row key={k} term={k} value={v} />
          ))}
        </dl>

        <div className="mx-6 my-2 flex items-center justify-between gap-3 rounded-[14px] bg-stone-canvas px-4 py-3.5 text-[15px] tabular-nums">
          {left === 0 ? (
            <>
              <span className="font-medium">Fully paid</span>
              <span className="text-warm-gray">See you at camp!</span>
            </>
          ) : (
            <>
              <span className="font-medium">{formatCedis(left)} left to pay</span>
              <span className="text-[13px] text-warm-gray">of {formatCedis(r.price_pesewas)}, as of today</span>
            </>
          )}
        </div>

        <dl className="flex flex-col px-6 pb-4 pt-2">
          {refs.map(([k, v]) => (
            <Row key={k} term={k} value={v} mono />
          ))}
        </dl>

        <footer className="border-t border-dashed border-stone-border px-6 py-4 text-center text-[12px] leading-relaxed text-warm-gray">
          Thank you. Keep this receipt for your records. Questions? Contact the camp coordinators.
        </footer>
      </article>

      <ReceiptActions title={`Receipt for ${r.full_name}, ${r.camp_name}`} />
    </div>
  );
}

function Row({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-stone-border/70 py-2.5 last:border-b-0">
      <dt className="flex-none text-warm-gray">{term}</dt>
      <dd className={mono ? "break-all text-right font-mono text-[13px]" : "text-right"}>{value}</dd>
    </div>
  );
}

/** The torn edge between the amount and the details, like a till receipt. */
function Tear() {
  return (
    <div aria-hidden="true" className="relative flex h-6 items-center">
      <span className="absolute -left-3 h-6 w-6 rounded-full bg-stone-canvas print:hidden" />
      <span className="mx-5 w-full border-t-2 border-dashed border-stone-border" />
      <span className="absolute -right-3 h-6 w-6 rounded-full bg-stone-canvas print:hidden" />
    </div>
  );
}
