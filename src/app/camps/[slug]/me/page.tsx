import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftRight, Check, ChevronRight, CircleSlash, Clock, Download, Lock, MessageSquareHeart, RotateCcw, UserRound, Users, type LucideIcon } from "lucide-react";
import { getMyRoom } from "@/lib/camp/assignments";
import { getCampBySlug } from "@/lib/camp/camps";
import { feedbackOpen, hasAnswered } from "@/lib/camp/feedback";
import { getGroupFor } from "@/lib/camp/groups";
import { formatCedis } from "@/lib/camp/money";
import { passQrSvg } from "@/lib/camp/pass";
import { makeToken } from "@/lib/camp/tokens";
import { getPrivateDetails } from "@/lib/camp/profile";
import { daysUntil, listPayments, todayInGhana } from "@/lib/camp/registrations";
import { listMyRequests } from "@/lib/camp/requests";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import { CampBanner, CampLogo } from "@/components/camp/photos";
import { formatDate, formatDay, headlineClass, primaryButtonClass, secondaryButtonClass, titleClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { InstallHint, SharePayLink, WithdrawRequest } from "./MeControls";
import { PayForm } from "./PayForm";
import { ResumePayment } from "./ResumePayment";
import { SignOut } from "./SignOut";
import { PendingJoin } from "./PendingJoin";

const PAYMENT_LABELS = { pending: "Processing", success: "Paid", failed: "Not completed" } as const;

/**
 * The attendee's home. Not fully paid: what's left to pay comes first, and the
 * pass is locked (no QR until it can actually be used). Fully paid: the pass
 * with its QR, then a "Before camp" checklist whose next step carries its own
 * button, then the same four actions as tiles that look like buttons.
 */
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
  const [payments, group, room, details, requests, qr, answered, roomTypes] = await Promise.all([
    listPayments(me.id),
    fullyPaid ? getGroupFor(me.id) : null,
    fullyPaid ? getMyRoom(me.id) : null,
    getPrivateDetails(me.id),
    listMyRequests(me),
    fullyPaid ? passQrSvg(camp.id, me.id) : null,
    askFeedback ? hasAnswered(camp.id, me.id) : true,
    fullyPaid ? listRoomTypes(camp.id) : [],
  ]);
  const sleeps = roomTypes.find((t) => t.id === me.room_type_id)?.capacity;
  const balance = me.price_pesewas - me.paid_pesewas;
  const share = me.price_pesewas > 0 ? me.paid_pesewas / me.price_pesewas : 1;
  const pending = payments.find((p) => p.status === "pending");
  const paid = payments.filter((p) => p.status === "success");
  const open = requests.filter((r) => r.status === "pending");
  const firstName = me.full_name.split(" ")[0];
  const days = daysUntil(camp.starts_on);
  const choosing = todayInGhana() <= camp.roommate_deadline_on;
  const others = group ? group.members.filter((m) => m.registration_id !== me.id).map((m) => m.full_name.split(" ")[0]) : [];

  const headline = cancelled ? (
    <>
      Registration <span className="text-cyan-edge">cancelled</span>
    </>
  ) : fullyPaid ? (
    room ? (
      <>
        You&apos;re in <span className="text-cyan-edge">{room.label}</span>
      </>
    ) : days > 0 ? (
      <>
        {days} {days === 1 ? "day" : "days"} to <span className="text-cyan-edge">camp</span>
      </>
    ) : (
      <>
        Camp is <span className="text-cyan-edge">here</span>
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

  const roommatesSub = group
    ? `${group.members.length} of ${group.capacity} in your group`
    : room
      ? `Placed in ${room.label}`
      : me.any_room
      ? "Any room is fine"
      : choosing
        ? "Not chosen yet"
        : "We'll place you";
  // A coordinator placing them in a room settles it too.
  const roommatesDone = !!group || !!room || !!me.any_room || !choosing;

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

      {fullyPaid && choosing && !group && <PendingJoin slug={camp.slug} />}

      {cancelled && (
        <p className="flex items-start gap-2.5 rounded-[10px] border border-stone-border bg-white p-5 text-[15px] leading-relaxed">
          <CircleSlash className="mt-0.5 h-[18px] w-[18px] flex-none" strokeWidth={1.6} aria-hidden="true" />
          This registration is cancelled.
        </p>
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
        <>
          <Steps current={1} />
          <section aria-label="Your payment" className="cm-rise flex flex-col gap-4 rounded-2xl border border-stone-border bg-white p-5 shadow-seline-card sm:p-6" style={{ animationDelay: "60ms" }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex flex-col gap-1">
                <span className="text-sm text-warm-gray">Still to pay</span>
                <span className="font-display text-[40px] leading-none tracking-[-0.025em] tabular-nums">{formatCedis(balance)}</span>
              </span>
              <span className="text-right text-[13px] leading-normal text-warm-gray">
                {me.room_type_name}
                <br />
                {formatCedis(me.price_pesewas)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-border" role="img" aria-label={`${formatCedis(me.paid_pesewas)} of ${formatCedis(me.price_pesewas)} paid`}>
              <div className="cm-grow h-full rounded-full bg-st-paid" style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
            <p className="flex items-center gap-2 text-[13px] text-warm-gray">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
              Paid {formatCedis(me.paid_pesewas)} · due {formatDay(camp.payment_due_on)}
            </p>
            <PayForm slug={camp.slug} balance={balance} feeBps={camp.fee_bps} dueOn={formatDate(camp.payment_due_on)} />
            <SharePayLink slug={camp.slug} />
          </section>
          <LockedPass balance={balance} />
        </>
      )}

      {fullyPaid && (
        <section aria-label="Your pass" className="cm-rise flex flex-col overflow-hidden rounded-2xl bg-white shadow-seline-hero" style={{ animationDelay: "60ms" }}>
          <CampBanner camp={camp} className="h-[84px]" />
          <div className="flex flex-col gap-3.5 p-5">
            <p className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-[15px] font-medium">{me.full_name}</span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" /> Paid in full
              </span>
            </p>
            {qr && (
              <div className="flex flex-col items-center gap-3 rounded-[12px] border border-stone-border px-3.5 pt-[18px] pb-4">
                <span className="w-[196px] bg-white [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label="Your check-in QR code" dangerouslySetInnerHTML={{ __html: qr }} />
                <span className="text-[15px] font-medium">Show this at check-in</span>
                <a href={`/camps/${camp.slug}/me/pass`} download={`${camp.slug}-pass.png`} className={`${secondaryButtonClass} h-11`}>
                  <Download className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Save as image
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {fullyPaid && (
        <BeforeCamp
          items={[
            { done: true, title: "Registered", sub: `${formatDay(me.created_at)} · ${me.room_type_name}` },
            {
              done: true,
              title: "Paid in full",
              sub: `${formatCedis(me.price_pesewas)}${paid[0]?.paid_at ? ` · ${formatDay(paid[0].paid_at)}` : ""}`,
            },
            {
              done: roommatesDone,
              title: group || room ? "Roommates" : "Choose roommates",
              sub: room && !group
                ? `A coordinator placed you in ${room.label}.`
                : group
                ? `With ${others.length ? others.join(", ") : "nobody yet"}. ${group.members.length} of ${group.capacity}${choosing && group.members.length < group.capacity ? `; friends can join until ${formatDay(camp.roommate_deadline_on)}` : ""}.`
                : me.any_room
                  ? "Any room is fine. We'll place you."
                  : choosing
                    ? `${sleeps ? `${me.room_type_name} rooms sleep ${sleeps}. ` : ""}Pick your roommates by ${formatDay(camp.roommate_deadline_on)}, or we'll place you.`
                    : "The deadline has passed. We'll place you.",
              action: (
                <span className="flex flex-col gap-2">
                  <Link href={`/camps/${camp.slug}/roommates`} className={`${primaryButtonClass} h-12 w-full text-[15px]`}>
                    <Users className="h-[17px] w-[17px]" strokeWidth={1.7} aria-hidden="true" /> Choose roommates
                  </Link>
                  <span className="px-2 py-1 text-center text-[13px] leading-normal text-warm-gray">
                    Friend already has a group? Ask them to send you the link, then tap it.
                  </span>
                </span>
              ),
            },
            {
              done: !!details.emergency_name,
              title: "Emergency contact",
              sub: details.emergency_name ? `${details.emergency_name} · ${details.emergency_phone}` : "Someone we can call if something happens at camp.",
              action: (
                <Link href={`/camps/${camp.slug}/me/details`} className={`${primaryButtonClass} h-12 w-full text-[15px]`}>
                  <UserRound className="h-[17px] w-[17px]" strokeWidth={1.7} aria-hidden="true" /> Add emergency contact
                </Link>
              ),
            },
            {
              done: !!room,
              title: room ? `Room ${room.label}` : "Get your room",
              sub: room
                ? room.roommates.length
                  ? `With ${room.roommates.join(", ")}.`
                  : `${room.room_type_name}.`
                : `We'll text you your room after ${formatDay(camp.roommate_deadline_on)}.`,
            },
          ]}
        />
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

      <InstallHint />

      <section className="flex flex-col">
        <h2 className={`${titleClass} mb-3`}>Your registration</h2>
        <nav aria-label="Your registration" className="grid grid-cols-2 gap-2.5">
          {!cancelled &&
            (fullyPaid ? (
              <Tile href={`/camps/${camp.slug}/roommates`} icon={Users} label="Roommates" sub={roommatesSub} state={roommatesDone ? "done" : "todo"} />
            ) : (
              <Tile icon={Users} label="Roommates" sub="After full payment" state="locked" />
            ))}
          <Tile
            href={`/camps/${camp.slug}/me/details`}
            icon={UserRound}
            label="Your details"
            sub={details.emergency_name ? "Emergency contact added" : "Add an emergency contact"}
            state={details.emergency_name ? "done" : "todo"}
          />
          {!cancelled && (
            <Tile href={`/camps/${camp.slug}/me/room`} icon={ArrowLeftRight} label="Room type" sub={`${me.room_type_name} · ${formatCedis(me.price_pesewas)}`} />
          )}
          {(!cancelled || me.paid_pesewas > 0) && (
            <Tile href={`/camps/${camp.slug}/me/cancel`} icon={RotateCcw} label={cancelled ? "Ask for a refund" : "Cancel or refund"} sub="Ask for money back" />
          )}
        </nav>
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
                  <span className="text-warm-gray">{formatDay((p.paid_at ?? p.created_at).slice(0, 10))}</span>
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

/** Registered · Paid · Roommates · Room, joined by a line. `current` is the step to do now. */
function Steps({ current }: { current: number }) {
  const labels = ["Registered", "Paid", "Roommates", "Room"];
  return (
    <ol aria-label="Your progress" className="grid grid-cols-4 px-0.5">
      {labels.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? "step" : undefined}
          className={cn("relative flex flex-col items-center gap-1.5 text-[12px]", i <= current ? "text-ink-black" : "text-warm-gray", i === current && "font-medium")}
        >
          {i < labels.length - 1 && (
            <span aria-hidden="true" className={cn("absolute top-[11px] right-[calc(-50%+16px)] left-[calc(50%+16px)] h-0.5", i < current ? "bg-soot" : "bg-stone-border")} />
          )}
          {i < current ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-soot text-white">
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />
            </span>
          ) : i === current ? (
            <span className="cm-pulse flex h-6 w-6 items-center justify-center rounded-full border-2 border-cyan-signal bg-white">
              <span className="h-2 w-2 rounded-full bg-cyan-signal" />
            </span>
          ) : (
            <span className="h-6 w-6 rounded-full border border-stone-muted bg-white" />
          )}
          {label}
        </li>
      ))}
    </ol>
  );
}

/** No QR until it can be used: a greyed pass that says what unlocks it. */
function LockedPass({ balance }: { balance: number }) {
  return (
    <section aria-label="Your pass" className="cm-rise flex items-center gap-4 rounded-2xl border border-dashed border-stone-muted p-[18px]" style={{ animationDelay: "120ms" }}>
      <span aria-hidden="true" className="relative grid h-[84px] w-[84px] flex-none grid-cols-9 gap-px rounded-[10px] border border-stone-border bg-white p-1.5">
        {Array.from({ length: 81 }, (_, i) => (
          <span key={i} className={cn("aspect-square rounded-[2px]", (i * 7 + Math.floor(i / 9)) % 3 ? "bg-stone-border" : "")} />
        ))}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-soot">
            <Lock className="h-[18px] w-[18px] text-white" strokeWidth={1.8} />
          </span>
        </span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-[15px] font-medium">Your check-in pass</span>
        <span className="text-[13px] leading-normal text-warm-gray">Unlocks when you&apos;ve paid in full. {formatCedis(balance)} to go.</span>
      </span>
    </section>
  );
}

type Item = { done: boolean; title: string; sub: string; action?: React.ReactNode };

/** Steps before camp, joined by a line. The first one not done is "now" and shows its button. */
function BeforeCamp({ items }: { items: Item[] }) {
  const now = items.findIndex((i) => !i.done);
  const done = items.filter((i) => i.done).length;
  return (
    <section aria-labelledby="before-camp" className="cm-rise rounded-2xl border border-stone-border bg-white p-5 shadow-seline-card" style={{ animationDelay: "120ms" }}>
      <h2 id="before-camp" className={`${titleClass} flex items-baseline justify-between`}>
        Before camp
        <span className="font-sans text-[13px] text-warm-gray">
          {done} of {items.length} done
        </span>
      </h2>
      <div aria-hidden="true" className="mt-2.5 mb-5 h-1 overflow-hidden rounded-full bg-stone-border">
        <div className="cm-grow h-full rounded-full bg-soot" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
      </div>
      <ol className="flex flex-col">
        {items.map((item, i) => {
          const state = item.done ? "done" : i === now ? "now" : "later";
          const last = i === items.length - 1;
          return (
            <li key={item.title} aria-current={state === "now" ? "step" : undefined} className={cn("relative flex gap-3.5", !last && "pb-5")}>
              {!last && <span aria-hidden="true" className={cn("absolute top-8 -bottom-1.5 left-[13px] w-0.5", state === "done" ? "bg-soot" : "bg-stone-border")} />}
              {state === "done" ? (
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-soot">
                  <Check className="h-[15px] w-[15px] text-white" strokeWidth={2.6} aria-label="Done" />
                </span>
              ) : state === "now" ? (
                <span className="cm-pulse flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 border-cyan-signal bg-white">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-signal" />
                </span>
              ) : (
                <span className="h-7 w-7 flex-none rounded-full border border-stone-muted bg-white" />
              )}
              <span className="flex flex-1 flex-col gap-[3px] pt-[3px]">
                <span className={cn("text-[15px]", state === "now" ? "font-semibold" : "font-medium", state === "later" && "text-warm-gray")}>{item.title}</span>
                <span className="text-[13px] leading-normal text-warm-gray">{item.sub}</span>
                {state === "now" && item.action && <span className="mt-2.5">{item.action}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** One action: a whole-card link that looks and presses like a button. */
function Tile({ href, icon: Icon, label, sub, state }: { href?: string; icon: LucideIcon; label: string; sub: string; state?: "done" | "todo" | "locked" }) {
  const status =
    state === "done" ? (
      <span className="inline-flex items-center gap-1">
        <Check className="h-[13px] w-[13px] text-st-paid" strokeWidth={2.4} aria-hidden="true" />
        {sub}
      </span>
    ) : state === "todo" ? (
      <span className="inline-flex items-center gap-1.5 font-medium text-ink-black">
        <span className="h-[7px] w-[7px] flex-none rounded-full bg-cyan-signal" aria-hidden="true" />
        {sub}
      </span>
    ) : state === "locked" ? (
      <span className="inline-flex items-center gap-1">
        <Lock className="h-[13px] w-[13px]" strokeWidth={1.8} aria-hidden="true" />
        {sub}
      </span>
    ) : (
      sub
    );
  if (!href) {
    return (
      <span aria-disabled="true" className="flex min-h-[124px] flex-col gap-3.5 rounded-[14px] border border-dashed border-stone-muted p-4 text-warm-gray">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0efee]">
          <Icon className="h-5 w-5 text-ash-gray" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="mt-auto flex flex-col gap-0.5">
          <span className="text-[15px] font-medium">{label}</span>
          <span className="text-[13px]">{status}</span>
        </span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="cm-press flex min-h-[124px] flex-col gap-3.5 rounded-[14px] border border-stone-border bg-white p-4 shadow-seline-card transition-colors hover:border-stone-muted"
    >
      <span className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-rail">
          <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <ChevronRight className="h-4 w-4 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="mt-auto flex flex-col gap-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-[13px] text-warm-gray">{status}</span>
      </span>
    </Link>
  );
}
