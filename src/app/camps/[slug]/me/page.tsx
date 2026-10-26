import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftRight, Check, ChevronRight, CircleSlash, Clock, Download, HeartPulse, MessageSquareHeart, RotateCcw, UserRound, Users } from "lucide-react";
import { getMyRoom } from "@/lib/camp/assignments";
import { getCampBySlug } from "@/lib/camp/camps";
import { feedbackOpen, hasAnswered } from "@/lib/camp/feedback";
import { getGroupFor, listReceivedInvites } from "@/lib/camp/groups";
import { formatCedis } from "@/lib/camp/money";
import { passQrSvg } from "@/lib/camp/pass";
import { makeToken } from "@/lib/camp/tokens";
import { getPrivateDetails } from "@/lib/camp/profile";
import { daysUntil, listPayments } from "@/lib/camp/registrations";
import { listMyRequests } from "@/lib/camp/requests";
import { currentAttendee } from "@/lib/camp/session";
import { CampBanner, CampLogo } from "@/components/camp/photos";
import { Card, formatDate, headlineClass, secondaryButtonClass, titleClass } from "@/components/camp/ui";
import { InstallHint, SharePayLink, WithdrawRequest } from "./MeControls";
import { PayForm } from "./PayForm";
import { ResumePayment } from "./ResumePayment";
import { SignOut } from "./SignOut";

const PAYMENT_LABELS = { pending: "Processing", success: "Paid", failed: "Not completed" } as const;

export default async function MyRegistration({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}`);

  const fullyPaid = me.status === "fully_paid";
  const cancelled = me.status === "cancelled";
  // After camp, people who arrived are asked how it went.
  const askFeedback = !cancelled && !!me.checked_in_at && feedbackOpen(camp);
  const [payments, group, invites, room, details, requests, qr, answered] = await Promise.all([
    listPayments(me.id),
    fullyPaid ? getGroupFor(me.id) : null,
    fullyPaid ? listReceivedInvites(me) : [],
    fullyPaid ? getMyRoom(me.id) : null,
    getPrivateDetails(me.id),
    listMyRequests(me),
    cancelled ? null : passQrSvg(camp.id, me.id),
    askFeedback ? hasAnswered(camp.id, me.id) : true,
  ]);
  const balance = me.price_pesewas - me.paid_pesewas;
  const share = me.price_pesewas > 0 ? me.paid_pesewas / me.price_pesewas : 1;
  const pending = payments.find((p) => p.status === "pending");
  const open = requests.filter((r) => r.status === "pending");
  const firstName = me.full_name.split(" ")[0];
  const days = daysUntil(camp.starts_on);
  const step = cancelled ? -1 : !fullyPaid ? 1 : room ? 3 : 2;

  const headline = cancelled ? (
    <>
      Registration <span className="text-cyan-edge">cancelled</span>
    </>
  ) : fullyPaid ? (
    room ? (
      <>
        You&apos;re in <span className="text-cyan-edge">{room.label}</span>
      </>
    ) : (
      <>
        You&apos;re <span className="text-cyan-edge">fully paid</span>
      </>
    )
  ) : share >= 0.5 ? (
    <>
      You&apos;re <span className="text-cyan-edge">halfway</span> there
    </>
  ) : me.paid_pesewas > 0 ? (
    <>
      You&apos;re <span className="text-cyan-edge">on your way</span>
    </>
  ) : (
    <>
      Your place is <span className="text-cyan-edge">saved</span>
    </>
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

      {!answered && (
        <Link
          href={`/camps/${camp.slug}/feedback/${makeToken("feedback", me.id)}`}
          className="cm-rise cm-press flex items-center gap-3.5 rounded-2xl bg-white p-5 shadow-seline-hero"
        >
          <MessageSquareHeart className="h-6 w-6 flex-none text-cyan-deep" strokeWidth={1.5} aria-hidden="true" />
          <span className="flex flex-1 flex-col">
            <span className="text-[17px] font-medium">How was camp?</span>
            <span className="text-sm text-warm-gray">Two minutes, and no name needed.</span>
          </span>
          <ChevronRight className="h-5 w-5 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
        </Link>
      )}

      {cancelled ? (
        <p className="flex items-start gap-2.5 rounded-[10px] border border-stone-border bg-white p-5 text-[15px] leading-relaxed">
          <CircleSlash className="mt-0.5 h-[18px] w-[18px] flex-none" strokeWidth={1.6} aria-hidden="true" />
          This registration is cancelled.
        </p>
      ) : (
        <section aria-label="Your pass" className="cm-rise flex flex-col overflow-hidden rounded-2xl bg-white shadow-seline-hero" style={{ animationDelay: "60ms" }}>
          <CampBanner camp={camp} className="h-24" />
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            {fullyPaid ? (
              <div className="flex items-end justify-between gap-3">
                <span className="flex flex-col gap-1">
                  <span className="text-[13px] text-warm-gray">{days > 0 ? "Camp starts in" : "Camp is"}</span>
                  <span className="overflow-hidden font-display text-[52px] leading-none tracking-[-0.03em] tabular-nums">
                    {days > 0 ? (
                      <>
                        {String(days)
                          .split("")
                          .map((d, i) => (
                            <span key={i} className="cm-digit" style={{ animationDelay: `${200 + i * 90}ms` }}>
                              {d}
                            </span>
                          ))}{" "}
                        <span className="text-2xl">{days === 1 ? "day" : "days"}</span>
                      </>
                    ) : (
                      "here"
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 pb-1 text-[13px]">
                  <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" /> Paid in full
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex flex-col gap-1">
                    <span className="text-sm text-warm-gray">Outstanding</span>
                    <span className="font-display text-[40px] leading-none tracking-[-0.025em] tabular-nums">{formatCedis(balance)}</span>
                  </span>
                  <span className="text-right text-sm text-warm-gray">
                    {me.room_type_name}
                    <br />
                    {formatCedis(me.price_pesewas)}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="h-2 overflow-hidden rounded-full bg-stone-border" role="img" aria-label={`${formatCedis(me.paid_pesewas)} of ${formatCedis(me.price_pesewas)} paid`}>
                    <div className="cm-grow h-full rounded-full bg-st-paid" style={{ width: `${Math.round(share * 100)}%` }} />
                  </div>
                  <p className="flex items-center gap-2 text-[13px] text-warm-gray">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                    Paid {formatCedis(me.paid_pesewas)} · due {formatDate(camp.payment_due_on)}
                  </p>
                </div>
              </>
            )}

            {qr && (
              <div className="flex items-center gap-4 rounded-[12px] border border-stone-border p-4">
                <span className="w-[120px] flex-none bg-white sm:w-[132px] [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label="Your check-in QR code" dangerouslySetInnerHTML={{ __html: qr }} />
                <span className="flex flex-col gap-2.5">
                  <span className="text-[15px] font-medium">Show at check-in</span>
                  <a href={`/camps/${camp.slug}/me/pass`} download={`${camp.slug}-pass.png`} className={`${secondaryButtonClass} h-9 px-3.5 text-[13px]`}>
                    <Download className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Save as image
                  </a>
                </span>
              </div>
            )}

            {fullyPaid ? (
              <dl className="grid grid-cols-3 gap-2 text-[13px]">
                <div>
                  <dt className="text-warm-gray">Room</dt>
                  <dd className="text-[15px] font-medium">{room?.label ?? "Soon"}</dd>
                </div>
                <div>
                  <dt className="text-warm-gray">Type</dt>
                  <dd className="text-[15px] font-medium">{me.room_type_name}</dd>
                </div>
                <div>
                  <dt className="text-warm-gray">With</dt>
                  <dd className="truncate text-[15px] font-medium">{room?.roommates.length ? room.roommates.join(", ") : group ? group.members.filter((m) => m.registration_id !== me.id).map((m) => m.full_name.split(" ")[0]).join(", ") || "—" : "—"}</dd>
                </div>
              </dl>
            ) : (
              <ol className="grid grid-cols-4 gap-2 border-t border-stone-border pt-4 text-center text-[12px]">
                {["Registered", "Paid", "Roommates", "Room"].map((label, i) => (
                  <li key={label} className="flex flex-col items-center gap-1.5" aria-current={i === step ? "step" : undefined}>
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
            )}
          </div>
        </section>
      )}

      {pending && !cancelled && (
        <ResumePayment
          slug={camp.slug}
          payment={{
            reference: pending.reference,
            kind: pending.bulk_id ? "bulk" : "single",
            paid_by: "",
            full_name: null,
            people: 1,
            amount_pesewas: pending.amount_pesewas,
            // A sponsor's pay-link checkout carries their email: only the attendee's own resumes here.
            checkout_url: pending.payer_name ? null : (pending.checkout_url ?? null),
            created_at: pending.created_at,
          }}
        />
      )}

      {!cancelled && !fullyPaid && (
        <Card title="Pay">
          <PayForm slug={camp.slug} balance={balance} feeBps={camp.fee_bps} dueOn={formatDate(camp.payment_due_on)} />
          <SharePayLink slug={camp.slug} firstName={firstName} />
        </Card>
      )}

      {open.map((r) => (
        <p key={r.id} className="flex items-center gap-3 rounded-[10px] border border-stone-border bg-white px-4 py-2 text-sm">
          <Clock className="h-4 w-4 flex-none" strokeWidth={1.7} aria-hidden="true" />
          <span className="flex-1">
            {r.kind === "refund" ? `Refund of ${formatCedis(r.amount_pesewas ?? 0)} asked` : `Move to ${r.to_room_type_name} asked`} · waiting
          </span>
          <WithdrawRequest slug={camp.slug} requestId={r.id} />
        </p>
      ))}

      {!cancelled && !details.emergency_name && (
        <Link href={`/camps/${camp.slug}/me/details`} className="cm-press flex items-center gap-3 rounded-[10px] border border-stone-border bg-white px-4 py-3.5">
          <HeartPulse className="h-5 w-5 flex-none" strokeWidth={1.5} aria-hidden="true" />
          <span className="flex-1 text-[15px] font-medium">Add an emergency contact</span>
          <ChevronRight className="h-4 w-4 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
        </Link>
      )}

      <InstallHint />

      <section className="flex flex-col">
        <h2 className={`${titleClass} mb-1.5`}>Your registration</h2>
        <ul className="flex flex-col">
          {[
            { href: `/camps/${camp.slug}/me/details`, icon: UserRound, label: "Your details", sub: "" },
            ...(fullyPaid
              ? [{ href: `/camps/${camp.slug}/roommates`, icon: Users, label: "Roommates", sub: group ? `${group.members.length} of ${group.capacity}` : invites.length ? `${invites.length} invite${invites.length === 1 ? "" : "s"}` : me.any_room ? "Any room" : `By ${formatDate(camp.roommate_deadline_on)}` }]
              : []),
            ...(!cancelled ? [{ href: `/camps/${camp.slug}/me/room`, icon: ArrowLeftRight, label: "Change room type", sub: me.room_type_name }] : []),
            ...(!cancelled || me.paid_pesewas > 0 ? [{ href: `/camps/${camp.slug}/me/cancel`, icon: RotateCcw, label: cancelled ? "Ask for a refund" : "Cancel or refund", sub: "" }] : []),
          ].map(({ href, icon: Icon, label, sub }) => (
            <li key={href} className="border-t border-stone-border">
              <Link href={href} className="cm-row flex min-h-14 items-center gap-3.5 px-1">
                <Icon className="h-5 w-5 flex-none" strokeWidth={1.5} aria-hidden="true" />
                <span className="flex flex-1 flex-col">
                  <span className="text-[15px] font-medium">{label}</span>
                  {sub && <span className="text-[13px] text-warm-gray">{sub}</span>}
                </span>
                <ChevronRight className="h-4 w-4 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col">
        <h2 className={`${titleClass} mb-1.5`}>Payments</h2>
        {payments.length === 0 ? (
          <p className="border-t border-stone-border py-3.5 text-sm text-warm-gray">None yet.</p>
        ) : (
          <ul className="flex flex-col text-sm tabular-nums">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-border py-3.5">
                <span>
                  <span className="font-medium">{formatCedis(p.amount_pesewas)}</span>
                  {p.fee_pesewas > 0 && <span className="text-warm-gray"> + {formatCedis(p.fee_pesewas)} fee</span>}
                  {p.payer_name && <span className="text-warm-gray"> · by {p.bulk_id ? "a coordinator" : p.payer_name}</span>}
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
