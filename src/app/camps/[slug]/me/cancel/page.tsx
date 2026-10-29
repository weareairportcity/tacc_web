import { notFound, redirect } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { listMyRequests } from "@/lib/camp/requests";
import { currentAttendee } from "@/lib/camp/session";
import { Intro } from "@/components/camp/subpage";
import { CancelForm } from "./CancelForm";

/** Cancelling, asking for money back, and the refund policy. */
export default async function CancelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}`);
  const waiting = (await listMyRequests(me)).find((r) => r.kind === "refund" && r.status === "pending");
  const cancelled = me.status === "cancelled";
  return (
    <div className="flex flex-col gap-6">
      <Intro
        slug={camp.slug}
        title={
          cancelled ? (
            <>
              Ask for a <span className="text-cyan-edge">refund</span>
            </>
          ) : (
            <>
              Can&apos;t <span className="text-cyan-edge">come</span>?
            </>
          )
        }
      >
        Tell us what you&apos;d like. We&apos;ll text you when a coordinator has looked at it.
      </Intro>
      <CancelForm
        slug={camp.slug}
        paid={me.paid_pesewas}
        cancelled={cancelled}
        waiting={waiting ? { id: waiting.id, amount: waiting.amount_pesewas ?? 0 } : null}
      />
      <section className="flex flex-col gap-2.5 rounded-2xl bg-stone-rail p-5">
        <h2 className="font-display text-xl tracking-[-0.017em]">Good to know</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed">
          <li>A coordinator looks at each request and decides.</li>
          <li>
            <strong className="font-semibold">Refunds are sent to the number that paid</strong>{" "}(or the card), in 1 to 5 working days. If a friend paid for you, it goes back to
            them.
          </li>
          <li>The Paystack fee you paid can&apos;t be given back.</li>
        </ul>
      </section>
    </div>
  );
}
