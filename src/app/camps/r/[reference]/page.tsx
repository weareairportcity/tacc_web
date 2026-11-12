import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { getReceipt } from "@/lib/camp/receipts";
import { GoBack } from "@/components/camp/GoBack";
import { ReceiptCard, type ReceiptView } from "@/components/camp/ReceiptCard";
import { ReceiptActions } from "./PrintButton";

export const metadata: Metadata = { title: "Receipt · Commune", robots: { index: false, follow: false } };

/**
 * The receipt for one payment (ReceiptCard, the same one coordinators see).
 * The link comes in the "payment received" text and notification, and from
 * the attendee's payments. Downloads as a PDF; prints on its own.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const r = await getReceipt(decodeURIComponent(reference));
  if (!r) notFound();
  const camp = await getCampBySlug(r.camp_slug);
  if (!camp) notFound();
  const view: ReceiptView = {
    reference: r.reference,
    paid_at: r.paid_at,
    full_name: r.full_name,
    room_type_name: r.room_type_name,
    // A coordinator's payment carries their note or email; an email isn't shown to the attendee.
    payer: r.bulk ? (r.payer_name && !r.payer_name.includes("@") ? r.payer_name : "A camp coordinator") : r.payer_name && r.payer_name !== r.full_name ? r.payer_name : null,
    bulk: r.bulk,
    method: r.method,
    amount_pesewas: r.amount_pesewas,
    fee_pesewas: r.fee_pesewas,
    charged_pesewas: r.charged_pesewas,
    price_pesewas: r.price_pesewas,
    paid_pesewas: r.paid_pesewas,
    transaction_id: r.transaction_id,
  };

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 pb-8 pt-2">
      {/* Only the receipt itself prints. */}
      <style>{`@media print { body * { visibility: hidden !important; } #receipt, #receipt * { visibility: visible !important; } #receipt { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; } }`}</style>
      <GoBack fallback={`/camps/${r.camp_slug}/me`} />
      <div className="cm-rise">
        <ReceiptCard id="receipt" r={view} camp={camp} />
      </div>
      <ReceiptActions receipt={view} camp={{ name: camp.name, starts_on: camp.starts_on }} title={`Receipt for ${r.full_name}, ${r.camp_name}`} />
    </div>
  );
}
