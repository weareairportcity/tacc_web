import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { getRegistration } from "@/lib/camp/registrations";
import { readToken } from "@/lib/camp/tokens";
import { CampBanner } from "@/components/camp/photos";
import { formatDate, headlineClass } from "@/components/camp/ui";
import { PayForSomeone } from "./PayForSomeone";

export const metadata: Metadata = { title: "Pay for camp · Commune" };

/** A pay link a parent or sponsor opens without signing in. It pays this one registration only. */
export default async function PayLinkPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const camp = await getCampBySlug(slug);
  const id = readToken("pay", token);
  const reg = camp && id ? await getRegistration(id) : null;
  if (!camp || !reg || reg.camp_id !== camp.id) notFound();
  const first = reg.full_name.split(" ")[0];
  const balance = reg.price_pesewas - reg.paid_pesewas;

  return (
    <section className="cm-rise mt-2 flex flex-col overflow-hidden rounded-2xl bg-white shadow-seline-hero">
      <CampBanner camp={camp} className="h-28" />
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <p className="text-sm text-warm-gray">
          {camp.name} · {formatDate(camp.starts_on)}
        </p>
        <h1 className={`${headlineClass} text-[32px]`}>
          Pay for <span className="text-cyan-edge">{first}</span>
        </h1>
        {reg.status === "cancelled" ? (
          <p className="text-[15px]">This registration is cancelled.</p>
        ) : balance <= 0 ? (
          <p className="text-[15px]">{first} is already fully paid. Thank you.</p>
        ) : (
          <>
            <dl className="flex flex-col gap-2 rounded-[12px] bg-stone-canvas p-4 text-sm tabular-nums">
              <div className="flex justify-between">
                <dt className="text-warm-gray">{reg.room_type_name}</dt>
                <dd>{formatCedis(reg.price_pesewas)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-warm-gray">Already paid</dt>
                <dd>{formatCedis(reg.paid_pesewas)}</dd>
              </div>
              <div className="flex justify-between border-t border-stone-border pt-2 font-semibold">
                <dt>Outstanding</dt>
                <dd>{formatCedis(balance)}</dd>
              </div>
            </dl>
            <PayForSomeone slug={camp.slug} token={token} balance={balance} feeBps={camp.fee_bps} />
          </>
        )}
      </div>
    </section>
  );
}
