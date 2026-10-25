import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatGroupCode } from "@/lib/camp/codes";
import { formatCedis } from "@/lib/camp/money";
import { listFlaggedPayments, todayInGhana } from "@/lib/camp/registrations";
import { ROOMMATE_LABELS, filtersToQuery, listPeople, parsePeopleFilters } from "@/lib/camp/reports";
import { listRoomTypes } from "@/lib/camp/rooms";
import { PeopleFilters } from "@/components/camp/PeopleFilters";
import { Card, RegistrationStatus, headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { CancelButton } from "./CancelButton";

const FLAG_LABELS: Record<string, string> = {
  amount_mismatch: "Paystack amount didn't match",
  over_balance: "Paid after the balance was covered: refund in Paystack",
};

/** Coordinators' people table: everyone, filterable by URL, exportable to CSV. */
export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ campId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const filters = parsePeopleFilters(await searchParams);

  const [camp, people, flagged, roomTypes] = await Promise.all([
    getCamp(campId),
    listPeople(campId, filters),
    listFlaggedPayments(campId),
    listRoomTypes(campId),
  ]);
  if (!camp) notFound();
  const pastDue = todayInGhana() > camp.payment_due_on;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={headlineClass}>
          {people.length} <span className="text-cyan-edge">{people.length === 1 ? "person" : "people"}</span>
        </h1>
        <p className="text-sm text-warm-gray">
          Public page: <span className="font-mono text-ink-black">/camps/{camp.slug}</span>
        </p>
      </header>

      {flagged.length > 0 && (
        <Card lifted title={`${flagged.length} payment${flagged.length === 1 ? "" : "s"} to look at`}>
          <ul className="flex flex-col gap-2 text-sm">
            {flagged.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <AlertTriangle className="h-4 w-4 text-ink-black" />
                <span className="font-medium">{p.full_name}</span>
                <span className="font-mono text-xs">{p.reference}</span>
                <span>{formatCedis(p.charged_pesewas)}</span>
                <span className="text-warm-gray">{FLAG_LABELS[p.flag ?? ""] ?? p.flag}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <PeopleFilters
        filters={filters}
        roomTypes={roomTypes}
        exportHref={`/admin/camp/${camp.id}/registrations/export${filtersToQuery(filters)}`}
        searchLabel="Search by name or phone"
        showChurch
      />

      <div className="overflow-x-auto rounded-[10px] border border-stone-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-border text-left text-xs text-warm-gray">
            <tr>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Name</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Fellowship</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Room type</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Status</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Group</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Room</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Paid</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Balance</th>
              <th className="whitespace-nowrap px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-border">
            {people.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-warm-gray">
                  {filtersToQuery(filters) ? "Nobody matches these filters." : "No registrations yet."}
                </td>
              </tr>
            )}
            {people.map((r) => {
              const balance = r.price_pesewas - r.paid_pesewas;
              const overdue = pastDue && balance > 0 && r.status !== "cancelled";
              return (
                <tr key={r.id} className="cm-row">
                  <td className="whitespace-nowrap px-3 py-3">
                    <Link href={`/admin/camp/${camp.id}/registrations/${r.id}`} className="font-medium hover:underline">
                      {r.full_name}
                    </Link>
                    <div className="text-xs text-warm-gray">
                      0{r.phone.slice(3, 5)} {r.phone.slice(5, 8)} {r.phone.slice(8)} · {r.gender}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{r.fellowship}</td>
                  <td className="whitespace-nowrap px-3 py-3">{r.room_type_name}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className="flex items-center gap-2">
                      <RegistrationStatus status={r.status} paid={r.paid_pesewas} price={r.price_pesewas} />
                      {overdue && <span className="text-xs font-medium">· past due</span>}
                      {r.flagged > 0 && <AlertTriangle className="h-4 w-4" strokeWidth={1.7} aria-label="Payment to look at" />}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {r.group_code ? (
                      <span className="whitespace-nowrap">
                        <span className="font-mono text-xs">{formatGroupCode(r.group_code)}</span>
                        {r.roommate && <span className="ml-2 text-xs text-warm-gray">{ROOMMATE_LABELS[r.roommate]}</span>}
                      </span>
                    ) : r.roommate ? (
                      <span className="text-xs text-warm-gray">{ROOMMATE_LABELS[r.roommate]}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{r.room_label ?? ""}</td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-right">{formatCedis(r.paid_pesewas)}</td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-right">{formatCedis(balance)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <CancelButton id={r.id} name={r.full_name} cancelled={r.status === "cancelled"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
