import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { listPeople, listPeopleForLeader, scopeFor } from "@/lib/camp/reports";
import { listRoomTypes } from "@/lib/camp/rooms";
import { listViews } from "@/lib/camp/views";
import { CampError } from "@/lib/camp/types";
import { PFCC_GROUPS } from "@/lib/fellowships";
import { NoAccess, pageStaff } from "../../access";
import { PeopleView, type PersonListRow } from "./PeopleView";

/**
 * People, for coordinators and leaders. The whole camp (a leader: their
 * scope only, applied in SQL) comes down once, so filters, counts and sort
 * change instantly in the browser and stay in the URL.
 */
export default async function PeoplePage({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<Record<string, string>> }) {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const leader = staff.role === "leader";
  if (leader && camp.status === "draft") notFound();

  let rows: PersonListRow[];
  try {
    rows = leader
      ? (await listPeopleForLeader(staff, camp.id, {})).map((r) => ({
          id: r.id,
          full_name: r.full_name,
          fellowship: r.fellowship,
          pfcc: r.pfcc,
          status: r.status,
          price: r.price_pesewas,
          paid: r.paid_pesewas,
          room: null,
          placed: r.has_room,
          last: null,
        }))
      : (await listPeople(camp.id, {})).map((r) => ({
          id: r.id,
          full_name: r.full_name,
          phone: r.phone,
          fellowship: r.fellowship,
          pfcc: r.pfcc,
          gender: r.gender,
          room_type: r.room_type_name,
          status: r.status,
          price: r.price_pesewas,
          paid: r.paid_pesewas,
          room: r.room_label ?? (r.group_code ? "In a group" : r.any_room ? "Any room" : null),
          placed: !!r.room_label,
          checked_in: !!r.checked_in_at,
          last: r.last_paid_at ?? r.created_at,
          last_paid: r.last_paid_at ? r.last_paid_pesewas : null,
          registered: r.created_at,
        }));
  } catch (err) {
    if (err instanceof CampError) return <p className="text-sm">{err.message}</p>;
    throw err;
  }

  const [roomTypes, views] = await Promise.all([leader ? [] : listRoomTypes(camp.id), listViews(camp.id, staff.email)]);
  const scope = leader ? scopeFor(staff) : null;

  const query = new URLSearchParams(await searchParams).toString();
  return (
    <PeopleView
      // A new search from the top bar starts the page fresh.
      key={new URLSearchParams(query).get("q") ?? ""}
      campId={camp.id}
      leader={leader}
      scopeName={scope && scope.kind !== "all" ? scope.value : null}
      rows={rows}
      roomTypes={roomTypes.map((t) => t.name)}
      pfccs={PFCC_GROUPS.map((g) => ({ pfcc: g.pfcc, fellowships: g.fellowships.map((f) => f.name) }))}
      views={views}
      initialQuery={query}
    />
  );
}
