import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatGroupCode } from "@/lib/camp/codes";
import { formatCedis } from "@/lib/camp/money";
import { listFlaggedPayments, todayInGhana } from "@/lib/camp/registrations";
import { ROOMMATE_LABELS, filtersToQuery, listPeople, parsePeopleFilters } from "@/lib/camp/reports";
import { listRoomTypes } from "@/lib/camp/rooms";
import { REGISTRATION_STATUS_LABELS } from "@/lib/camp/types";
import { PeopleFilters } from "@/components/camp/PeopleFilters";
import { Card, REGISTRATION_STATUS_STYLES } from "@/components/camp/ui";
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
    <div className="space-y-6">
      <div>
        <Link href={`/admin/camp/${camp.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {camp.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">People ({people.length})</h1>
        <p className="mt-1 text-sm text-slate-500">
          Public page: <span className="font-mono">/camps/{camp.slug}</span>
        </p>
      </div>

      {flagged.length > 0 && (
        <Card title={`Payments to look at (${flagged.length})`}>
          <ul className="space-y-2 text-sm">
            {flagged.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="font-medium">{p.full_name}</span>
                <span className="font-mono text-xs">{p.reference}</span>
                <span>{formatCedis(p.charged_pesewas)}</span>
                <span className="text-slate-500">{FLAG_LABELS[p.flag ?? ""] ?? p.flag}</span>
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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Fellowship</th>
              <th className="px-4 py-2 font-medium">Room type</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Group</th>
              <th className="px-4 py-2 font-medium">Room</th>
              <th className="px-4 py-2 text-right font-medium">Paid</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {people.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                  {filtersToQuery(filters) ? "Nobody matches these filters." : "No registrations yet."}
                </td>
              </tr>
            )}
            {people.map((r) => {
              const balance = r.price_pesewas - r.paid_pesewas;
              const overdue = pastDue && balance > 0 && r.status !== "cancelled";
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <Link href={`/admin/camp/${camp.id}/registrations/${r.id}`} className="font-medium hover:underline">
                      {r.full_name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {r.phone} · {r.gender}
                    </div>
                  </td>
                  <td className="px-4 py-2">{r.fellowship}</td>
                  <td className="px-4 py-2">{r.room_type_name}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REGISTRATION_STATUS_STYLES[r.status]}`}>
                      {REGISTRATION_STATUS_LABELS[r.status]}
                    </span>
                    {overdue && <span className="ml-2 text-xs font-medium text-red-600">Past due</span>}
                    {r.flagged > 0 && <AlertTriangle className="ml-2 inline h-4 w-4 text-amber-600" />}
                  </td>
                  <td className="px-4 py-2">
                    {r.group_code ? (
                      <span className="whitespace-nowrap">
                        <span className="font-mono text-xs">{formatGroupCode(r.group_code)}</span>
                        {r.roommate && <span className="ml-2 text-xs text-slate-500">{ROOMMATE_LABELS[r.roommate]}</span>}
                      </span>
                    ) : r.roommate ? (
                      <span className="text-xs text-slate-500">{ROOMMATE_LABELS[r.roommate]}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">{r.room_label ?? ""}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">{formatCedis(r.paid_pesewas)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">{formatCedis(balance)}</td>
                  <td className="px-4 py-2 text-right">
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
