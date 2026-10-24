import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BedDouble, Users } from "lucide-react";
import { getMyRoom } from "@/lib/camp/assignments";
import { getCampBySlug } from "@/lib/camp/camps";
import { getGroupFor, listReceivedInvites } from "@/lib/camp/groups";
import { formatCedis } from "@/lib/camp/money";
import { listPayments } from "@/lib/camp/registrations";
import { currentAttendee } from "@/lib/camp/session";
import { GROUP_STATE_LABELS, REGISTRATION_STATUS_LABELS } from "@/lib/camp/types";
import { Card, REGISTRATION_STATUS_STYLES, buttonClass, formatDate } from "@/components/camp/ui";
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
  const pending = payments.find((p) => p.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{camp.name}</p>
          <h1 className="text-2xl font-bold">{me.full_name}</h1>
        </div>
        <SignOut />
      </div>

      <Card
        title="Your registration"
        action={
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REGISTRATION_STATUS_STYLES[me.status]}`}>
            {REGISTRATION_STATUS_LABELS[me.status]}
          </span>
        }
      >
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Room type</dt>
            <dd className="font-medium">{me.room_type_name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Price</dt>
            <dd className="font-medium">{formatCedis(me.price_pesewas)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Paid</dt>
            <dd className="font-medium">{formatCedis(me.paid_pesewas)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Balance</dt>
            <dd className="font-medium">{formatCedis(balance)}</dd>
          </div>
        </dl>
      </Card>

      {me.status === "cancelled" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          This registration has been cancelled. Speak to a camp coordinator if you think this is a mistake.
        </p>
      ) : me.status === "fully_paid" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          You&apos;re fully paid.
        </p>
      ) : (
        <Card title="Make a payment">
          {pending ? (
            <p className="text-sm text-slate-600">
              Your payment of {formatCedis(pending.amount_pesewas)} is still processing. Mobile money can take a few
              minutes. Refresh this page to check, or start a new payment and the old one will be cancelled if it
              hasn&apos;t gone through.
            </p>
          ) : null}
          <PayForm slug={camp.slug} balance={balance} feeBps={camp.fee_bps} dueOn={formatDate(camp.payment_due_on)} />
        </Card>
      )}

      {fullyPaid && (
        <Card title="Your room">
          {room ? (
            <div className="space-y-1 text-sm">
              <p className="flex items-center gap-2 text-base font-semibold">
                <BedDouble className="h-5 w-5 text-emerald-700" /> {room.label}
              </p>
              <p className="text-slate-600">
                {room.room_type_name}
                {room.roommates.length > 0 && ` · with ${room.roommates.join(", ")}`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Awaiting room assignment. A coordinator will place you before camp.</p>
          )}
        </Card>
      )}

      {me.status !== "cancelled" && (
        <Card title="Roommates">
          {!fullyPaid ? (
            <p className="text-sm text-slate-500">
              Once you&apos;re fully paid you can form a group with friends to share a room, by{" "}
              {formatDate(camp.roommate_deadline_on)}.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Users className="h-4 w-4" />
                {group
                  ? `You're in a group of ${group.members.length} of ${group.capacity} · ${GROUP_STATE_LABELS[group.state]}`
                  : invites.length
                    ? `You have ${invites.length === 1 ? "an invite" : `${invites.length} invites`} to join a group.`
                    : `Form or join a group by ${formatDate(camp.roommate_deadline_on)}.`}
              </p>
              <Link href={`/camps/${camp.slug}/roommates`} className={`${buttonClass} w-full py-3 text-base`}>
                {group ? "Your group" : "Choose roommates"}
              </Link>
            </div>
          )}
        </Card>
      )}

      <Card title="Payment history">
        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{formatCedis(p.amount_pesewas)}</span>
                  <span className="text-slate-500"> + {formatCedis(p.fee_pesewas)} fee</span>
                </span>
                <span className="text-slate-500">{(p.paid_at ?? p.created_at).slice(0, 10)}</span>
                <span className={p.status === "success" ? "text-emerald-700" : "text-slate-500"}>
                  {PAYMENT_LABELS[p.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
