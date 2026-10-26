import { notFound, redirect } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { listMyRequests } from "@/lib/camp/requests";
import { currentAttendee } from "@/lib/camp/session";
import { CampBackLink } from "@/components/camp/photos";
import { Card, headlineClass } from "@/components/camp/ui";
import { CancelForm } from "./CancelForm";

/** Cancelling, asking for money back, and the refund policy. */
export default async function CancelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}`);
  const waiting = (await listMyRequests(me)).find((r) => r.kind === "refund" && r.status === "pending");
  return (
    <div className="flex flex-col gap-6">
      <CampBackLink href={`/camps/${camp.slug}/me`} camp={camp} label="Your registration" />
      <h1 className={`cm-rise ${headlineClass}`}>
        {me.status === "cancelled" ? (
          <>
            Ask for a <span className="text-cyan-edge">refund</span>
          </>
        ) : (
          <>
            Can&apos;t <span className="text-cyan-edge">come</span>?
          </>
        )}
      </h1>
      <Card title="Refund policy">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed">
          <li>A coordinator decides each request, case by case.</li>
          <li>Paystack fees aren&apos;t refunded.</li>
          <li>Money goes back to the MoMo or card you used, in 1–5 working days.</li>
        </ul>
      </Card>
      <CancelForm
        slug={camp.slug}
        paid={me.paid_pesewas}
        cancelled={me.status === "cancelled"}
        waiting={waiting ? { id: waiting.id, amount: waiting.amount_pesewas ?? 0 } : null}
      />
    </div>
  );
}
