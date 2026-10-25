import { notFound } from "next/navigation";
import { Check, CircleCheck, CircleDashed, CircleSlash, Minus } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { ROOMMATE_LABELS, filtersToQuery, listPeopleForLeader, parsePeopleFilters, scopeFor } from "@/lib/camp/reports";
import { listRoomTypes } from "@/lib/camp/rooms";
import { CampError, REGISTRATION_STATUS_LABELS } from "@/lib/camp/types";
import { PeopleFilters } from "@/components/camp/PeopleFilters";
import { headlineClass } from "@/components/camp/ui";
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
      <div className="rounded-[10px] border border-stone-border bg-white p-8 text-center">
        <h1 className="text-lg font-medium">Not set up yet</h1>
        <p className="mt-2 text-sm text-warm-gray">{err.message}</p>
      </div>
    );
  }

  const filters = parsePeopleFilters(await searchParams);
  const [people, roomTypes] = await Promise.all([listPeopleForLeader(staff, camp.id, filters), listRoomTypes(camp.id)]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className={headlineClass}>
          {scope.kind === "all" ? "Everyone" : scope.value} <span className="text-cyan-edge">· {people.length}</span>
        </h1>
        <p className="text-sm text-warm-gray">Read-only. Payment amounts and contact details aren&apos;t shown.</p>
      </header>

      <PeopleFilters
        filters={filters}
        roomTypes={roomTypes}
        exportHref={`/admin/camp/${camp.id}/people/export${filtersToQuery(filters)}`}
        searchLabel="Search by name"
        showChurch={false}
        hide={scope.kind === "fellowship" ? ["fellowship", "pfcc"] : scope.kind === "pfcc" ? ["pfcc"] : []}
      />

      <div className="overflow-x-auto rounded-[10px] border border-stone-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-border text-left text-warm-gray">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Name</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Fellowship</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Payment</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Roommates</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Room assigned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-border">
            {people.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-warm-gray">
                  {filtersToQuery(filters) ? "Nobody matches these filters." : "Nobody from your group has registered yet."}
                </td>
              </tr>
            )}
            {people.map((p) => (
              <tr key={p.id} className="cm-row">
                <td className="px-4 py-3 font-medium">{p.full_name}</td>
                <td className="px-4 py-3">{p.fellowship}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    {p.status === "fully_paid" ? (
                      <CircleCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                    ) : p.status === "cancelled" ? (
                      <CircleSlash className="h-3.5 w-3.5 text-warm-gray" strokeWidth={1.8} aria-hidden="true" />
                    ) : (
                      <CircleDashed className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                    )}
                    {REGISTRATION_STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-warm-gray">{p.roommate ? ROOMMATE_LABELS[p.roommate] : ""}</td>
                <td className="px-4 py-3">
                  {p.has_room ? (
                    <Check className="h-4 w-4 text-ink-black" aria-label="Yes" />
                  ) : (
                    <Minus className="h-4 w-4 text-ash-gray" aria-label="No" />
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
