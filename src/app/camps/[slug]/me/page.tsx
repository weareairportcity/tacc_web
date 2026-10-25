import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, BedDouble, Check, CircleSlash, Clock, Users } from "lucide-react";
import { getMyRoom } from "@/lib/camp/assignments";
import { getCampBySlug } from "@/lib/camp/camps";
import { getGroupFor, listReceivedInvites } from "@/lib/camp/groups";
import { formatCedis } from "@/lib/camp/money";
import { daysUntil, listPayments } from "@/lib/camp/registrations";
import { currentAttendee } from "@/lib/camp/session";
import { GROUP_STATE_LABELS } from "@/lib/camp/types";
import { CampBanner, CampLogo } from "@/components/camp/photos";
import { Card, formatDate, headlineClass, primaryButtonClass, secondaryButtonClass, titleClass } from "@/components/camp/ui";
import { PayForm } from "./PayForm";
import { SignOut } from "./SignOut";

const PAYMENT_LABELS = { pending: "Processing", success: "Paid", failed: "Not completed" } as const;

export default async function MyRegistration({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}`);

  const fullyPaid = me.status === "fully_paid";
  const [payments, group, invites, room] = await Promise.all([
    listPayments(me.id),
    fullyPaid ? getGroupFor(me.id) : null,
    fullyPaid ? listReceivedInvites(me) : [],
    fullyPaid ? getMyRoom(me.id) : null,
  ]);
  const balance = me.price_pesewas - me.paid_pesewas;
  const share = me.price_pesewas > 0 ? me.paid_pesewas / me.price_pesewas : 1;
  const pending = payments.find((p) => p.status === "pending");
  const firstName = me.full_name.split(" ")[0];
  const step = me.status === "cancelled" ? -1 : !fullyPaid ? 1 : room ? 3 : 2;

  const headline =
    me.status === "cancelled" ? (
      <>Registration <span className="text-cyan-edge">cancelled</span></>
    ) : fullyPaid ? (
      room ? (
        <>You&apos;re in <span className="text-cyan-edge">{room.label}</span></>
      ) : (
        <>You&apos;re <span className="text-cyan-edge">fully paid</span></>
      )
    ) : share >= 0.5 ? (
      <>You&apos;re <span className="text-cyan-edge">halfway</span> there</>
    ) : me.paid_pesewas > 0 ? (
      <>You&apos;re <span className="text-cyan-edge">on your way</span></>
    ) : (
      <>Your place is <span className="text-cyan-edge">saved</span></>
    );

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm text-warm-gray">
            <CampLogo camp={camp} size={24} />
            <span>
              Hi {firstName} · {camp.name}
            </span>
          </p>
          <h1 className={`cm-rise ${headlineClass}`}>{headline}</h1>
        </div>
        <SignOut />
      </div>

      {me.status === "cancelled" ? (
        <p className="flex items-start gap-2.5 rounded-[10px] border border-stone-border bg-white p-5 text-[15px] leading-relaxed">
          <CircleSlash className="mt-0.5 h-[18px] w-[18px] flex-none" strokeWidth={1.6} aria-hidden="true" />
          This registration has been cancelled. Speak to a camp coordinator if you think this is a mistake.
        </p>
      ) : (
        <section className="cm-rise flex flex-col overflow-hidden rounded-2xl bg-white shadow-seline-hero" style={{ animationDelay: "60ms" }}>
          <CampBanner camp={camp} className="h-28" />
          <div className="flex flex-col gap-5 p-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex flex-col gap-1">
              <span className="text-sm text-warm-gray">{fullyPaid ? "Paid in full" : "Left to pay"}</span>
              <span className="font-display text-[40px] leading-none tracking-[-0.025em] tabular-nums">
                {formatCedis(fullyPaid ? me.price_pesewas : balance)}
              </span>
            </span>
            <span className="text-right text-sm text-warm-gray">
              {me.room_type_name}
              <br />
              {formatCedis(me.price_pesewas)}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-stone-border"
            role="img"
            aria-label={`${formatCedis(me.paid_pesewas)} of ${formatCedis(me.price_pesewas)} paid`}
          >
            <div className="cm-grow h-full rounded-full bg-soot" style={{ width: `${Math.round(share * 100)}%` }} />
          </div>
          {!fullyPaid && (
            <p className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
              Paid {formatCedis(me.paid_pesewas)} · due {formatDate(camp.payment_due_on)} ({daysUntil(camp.payment_due_on)} days)
            </p>
          )}
          <ol className="grid grid-cols-4 gap-2 border-t border-stone-border pt-4 text-center text-[12px]">
            {["Registered", "Paid", "Roommates", "Room"].map((label, i) => (
              <li key={label} className="flex flex-col items-center gap-1.5">
                <span
                  className={
                    i < step
                      ? "flex h-6 w-6 items-center justify-center rounded-full bg-soot text-white"
                      : i === step
                        ? "flex h-6 w-6 items-center justify-center rounded-full border-2 border-cyan-signal bg-white"
                        : "flex h-6 w-6 items-center justify-center rounded-full border border-stone-muted bg-white"
                  }
                  aria-hidden="true"
                >
                  {i < step && <Check className="h-3.5 w-3.5" strokeWidth={2.4} />}
                </span>
                <span className={i <= step ? "text-ink-black" : "text-warm-gray"}>{label}</span>
              </li>
            ))}
          </ol>
          </div>
        </section>
      )}

      {me.status !== "cancelled" && !fullyPaid && (
        <Card title="Make a payment">
          {pending && (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-warm-gray">
              <Clock className="mt-0.5 h-4 w-4 flex-none text-ink-black" strokeWidth={1.7} aria-hidden="true" />
              Your payment of {formatCedis(pending.amount_pesewas)} is still processing. Mobile money can take a few minutes.
              Refresh to check, or start a new payment: the old one is cancelled if it hasn&apos;t gone through.
            </p>
          )}
          <PayForm slug={camp.slug} balance={balance} feeBps={camp.fee_bps} dueOn={formatDate(camp.payment_due_on)} />
        </Card>
      )}

      {fullyPaid && (
        <Card title="Your room">
          {room ? (
            <div className="flex items-start gap-3">
              <BedDouble className="mt-0.5 h-6 w-6 flex-none" strokeWidth={1.5} aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="font-display text-2xl tracking-[-0.015em]">{room.label}</p>
                <p className="text-sm text-warm-gray">
                  {room.room_type_name}
                  {room.roommates.length > 0 && ` · with ${room.roommates.join(", ")}`}
                </p>
              </div>
            </div>
          ) : (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-warm-gray">
              <Clock className="mt-0.5 h-4 w-4 flex-none text-ink-black" strokeWidth={1.7} aria-hidden="true" />
              Waiting for a room. A coordinator places you before camp, and we&apos;ll text you your room.
            </p>
          )}
        </Card>
      )}

      {me.status !== "cancelled" && (
        <Card title="Roommates">
          {!fullyPaid ? (
            <p className="text-sm leading-relaxed text-warm-gray">
              Once you&apos;re fully paid you can form a group with friends to share a room, by{" "}
              {formatDate(camp.roommate_deadline_on)}.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 flex-none" strokeWidth={1.6} aria-hidden="true" />
                {group
                  ? `You're in a group of ${group.members.length} of ${group.capacity} · ${GROUP_STATE_LABELS[group.state].toLowerCase()}`
                  : invites.length
                    ? `You have ${invites.length === 1 ? "an invite" : `${invites.length} invites`} to join a group.`
                    : `Form or join a group by ${formatDate(camp.roommate_deadline_on)}.`}
              </p>
              <Link
                href={`/camps/${camp.slug}/roommates`}
                className={group ? `${secondaryButtonClass} h-12 w-full` : `${primaryButtonClass} w-full`}
              >
                {group ? "Your group" : invites.length ? "See your invites" : "Choose roommates"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </Card>
      )}

      <section className="flex flex-col">
        <h2 className={`${titleClass} mb-1.5`}>Payment history</h2>
        {payments.length === 0 ? (
          <p className="border-t border-stone-border py-3.5 text-sm text-warm-gray">No payments yet.</p>
        ) : (
          <ul className="flex flex-col text-sm tabular-nums">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-border py-3.5">
                <span>
                  <span className="font-medium">{formatCedis(p.amount_pesewas)}</span>
                  <span className="text-warm-gray"> + {formatCedis(p.fee_pesewas)} fee</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-warm-gray">{formatDate((p.paid_at ?? p.created_at).slice(0, 10))}</span>
                  <span className={p.status === "success" ? "flex items-center gap-1" : "text-warm-gray"}>
                    {p.status === "success" && <Check className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />}
                    {PAYMENT_LABELS[p.status]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
