import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { listRefunds } from "@/lib/camp/adjustments";
import { getMyRoom } from "@/lib/camp/assignments";
import { ID } from "@/lib/camp/camps";
import { formatGroupCode } from "@/lib/camp/codes";
import { getGroupFor } from "@/lib/camp/groups";
import { formatCedis } from "@/lib/camp/money";
import { getRegistration, listPayments } from "@/lib/camp/registrations";
import { listRoomTypes } from "@/lib/camp/rooms";
import { GROUP_STATE_LABELS } from "@/lib/camp/types";
import { Card, RegistrationStatus, headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../../access";
import { CancelButton } from "../CancelButton";
import { ChangeRoomType, RecordRefund } from "./PersonActions";

const PAYMENT_LABELS = { pending: "Processing", success: "Paid", failed: "Not completed" } as const;

/** One person: their money, group and room, and the coordinator's corrections. */
export default async function PersonPage({ params }: { params: Promise<{ campId: string; registrationId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId, registrationId } = await params;
  if (!ID.test(campId) || !ID.test(registrationId)) notFound();
  const person = await getRegistration(registrationId);
  if (!person || person.camp_id !== campId) notFound();

  const [payments, refunds, group, room, roomTypes] = await Promise.all([
    listPayments(person.id),
    listRefunds(person.id),
    getGroupFor(person.id),
    getMyRoom(person.id),
    listRoomTypes(campId),
  ]);
  const cancelled = person.status === "cancelled";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/admin/camp/${campId}/registrations`} className="-ml-1 inline-flex min-h-10 items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> People
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className={headlineClass}>{person.full_name}</h1>
            <span className="text-sm">
              <RegistrationStatus status={person.status} paid={person.paid_pesewas} price={person.price_pesewas} />
            </span>
          </div>
          <CancelButton id={person.id} name={person.full_name} cancelled={cancelled} />
        </div>
        <p className="mt-2 text-sm text-warm-gray">
          {person.phone} · {person.email} · {person.gender} · {person.fellowship} ({person.pfcc}) · {person.church}
        </p>
      </div>

      <Card lifted title="Registration">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-warm-gray">Room type</dt>
            <dd className="font-medium">{person.room_type_name}</dd>
          </div>
          <div>
            <dt className="text-warm-gray">Price</dt>
            <dd className="font-medium">{formatCedis(person.price_pesewas)}</dd>
          </div>
          <div>
            <dt className="text-warm-gray">Paid (after refunds)</dt>
            <dd className="font-medium">{formatCedis(person.paid_pesewas)}</dd>
          </div>
          <div>
            <dt className="text-warm-gray">Balance</dt>
            <dd className="font-display text-xl">{formatCedis(person.price_pesewas - person.paid_pesewas)}</dd>
          </div>
          <div>
            <dt className="text-warm-gray">Roommate group</dt>
            <dd className="font-medium">
              {group ? `${formatGroupCode(group.code)} · ${GROUP_STATE_LABELS[group.state]} · ${group.members.length} of ${group.capacity}` : "None"}
            </dd>
          </div>
          <div>
            <dt className="text-warm-gray">Room</dt>
            <dd className="font-medium">{room?.label ?? "Not placed"}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Payments">
        {payments.length === 0 ? (
          <p className="text-sm text-warm-gray">No payments.</p>
        ) : (
          <ul className="divide-y divide-stone-border text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{formatCedis(p.amount_pesewas)}</span>
                  <span className="text-warm-gray"> + {formatCedis(p.fee_pesewas)} fee</span>
                </span>
                <span className="font-mono text-xs text-warm-gray">{p.reference}</span>
                <span className="text-warm-gray">{(p.paid_at ?? p.created_at).slice(0, 10)}</span>
                <span className={p.status === "success" ? "text-ink-black" : "text-warm-gray"}>
                  {PAYMENT_LABELS[p.status]}
                  {p.flag && ` · ${p.flag.replace("_", " ")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Refunds">
        <div className="flex flex-col gap-4">
          {refunds.length > 0 && (
            <ul className="divide-y divide-stone-border text-sm">
              {refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium">{formatCedis(r.amount_pesewas)}</span>
                  <span className="font-mono text-xs text-warm-gray">{r.reference}</span>
                  <span className="text-warm-gray">{r.note}</span>
                  <span className="text-xs text-ash-gray">
                    {r.created_at.slice(0, 10)} · {r.recorded_by}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {person.paid_pesewas > 0 ? (
            <RecordRefund registrationId={person.id} paid={person.paid_pesewas} />
          ) : (
            <p className="text-sm text-warm-gray">Nothing paid to refund.</p>
          )}
        </div>
      </Card>

      {!cancelled && roomTypes.length > 1 && (
        <Card title="Change room type">
          <ChangeRoomType
            registrationId={person.id}
            current={person.room_type_id}
            roomTypes={roomTypes}
            paid={person.paid_pesewas}
          />
        </Card>
      )}
    </div>
  );
}
