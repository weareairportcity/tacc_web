import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { ROOMMATE_LABELS, filtersToQuery, listPeopleForLeader, parsePeopleFilters, scopeFor } from "@/lib/camp/reports";
import { listRoomTypes } from "@/lib/camp/rooms";
import { CampError, REGISTRATION_STATUS_LABELS } from "@/lib/camp/types";
import { PeopleFilters } from "@/components/camp/PeopleFilters";
import { REGISTRATION_STATUS_STYLES } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";

/**
 * Leaders' read-only list: their own fellowship or PFCC only (applied in the
 * query from their staff record), with no contact details or amounts.
 */
export default async function LeaderPeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ campId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await pageStaff("leader", "coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp || camp.status === "draft") notFound();

  let scope;
  try {
    scope = scopeFor(staff);
  } catch (err) {
    if (!(err instanceof CampError)) throw err;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold">Not set up yet</h1>
        <p className="mt-2 text-sm text-slate-500">{err.message}</p>
      </div>
    );
  }

  const filters = parsePeopleFilters(await searchParams);
  const [people, roomTypes] = await Promise.all([listPeopleForLeader(staff, camp.id, filters), listRoomTypes(camp.id)]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/camp" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Camps
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {camp.name}: {scope.kind === "all" ? "everyone" : scope.value} ({people.length})
        </h1>
        <p className="mt-1 text-sm text-slate-500">Read-only. Payment amounts and contact details aren&apos;t shown.</p>
      </div>

      <PeopleFilters
        filters={filters}
        roomTypes={roomTypes}
        exportHref={`/admin/camp/${camp.id}/people/export${filtersToQuery(filters)}`}
        searchLabel="Search by name"
        showChurch={false}
        hide={scope.kind === "fellowship" ? ["fellowship", "pfcc"] : scope.kind === "pfcc" ? ["pfcc"] : []}
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Fellowship</th>
              <th className="px-4 py-2 font-medium">Payment</th>
              <th className="px-4 py-2 font-medium">Roommates</th>
              <th className="px-4 py-2 font-medium">Room assigned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {people.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  {filtersToQuery(filters) ? "Nobody matches these filters." : "Nobody from your group has registered yet."}
                </td>
              </tr>
            )}
            {people.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 font-medium">{p.full_name}</td>
                <td className="px-4 py-2">{p.fellowship}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REGISTRATION_STATUS_STYLES[p.status]}`}>
                    {REGISTRATION_STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{p.roommate ? ROOMMATE_LABELS[p.roommate] : ""}</td>
                <td className="px-4 py-2">
                  {p.has_room ? (
                    <Check className="h-4 w-4 text-emerald-700" aria-label="Yes" />
                  ) : (
                    <Minus className="h-4 w-4 text-slate-300" aria-label="No" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
