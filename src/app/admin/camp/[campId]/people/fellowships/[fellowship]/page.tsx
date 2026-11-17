import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { listPeople, listPeopleForLeader, scopeFor } from "@/lib/camp/reports";
import { groupForFellowship } from "@/lib/fellowships";
import { headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../../../access";
import { FellowshipMembers, type Member } from "./FellowshipMembers";

/**
 * One fellowship's people, from People › Fellowships. Tap a person for their
 * details in the side panel: the full panel for coordinators, the leader's
 * card (with Pay for them) for a group or PFCC leader.
 */
export default async function FellowshipPage({ params }: { params: Promise<{ campId: string; fellowship: string }> }) {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const { campId, fellowship: raw } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const leader = staff.role === "leader";
  if (leader && camp.status === "draft") notFound();
  const scope = scopeFor(staff);
  if (leader && scope.kind === "fellowship") redirect(`/leaders/${camp.id}/people`);
  const fellowship = decodeURIComponent(raw);

  const rows: Member[] = leader
    ? (await listPeopleForLeader(staff, camp.id, { fellowship })).map((r) => ({ id: r.id, full_name: r.full_name, status: r.status, price: r.price_pesewas, paid: r.paid_pesewas, room: null }))
    : (await listPeople(camp.id, { fellowship })).map((r) => ({
        id: r.id,
        full_name: r.full_name,
        status: r.status,
        price: r.price_pesewas,
        paid: r.paid_pesewas,
        room: r.room_label ?? null,
      }));
  // Outside a leader's group or PFCC, the list comes back empty: nothing to show.
  if (leader && rows.length === 0) notFound();
  const base = `${leader ? "/leaders" : "/admin/camp"}/${camp.id}/people/fellowships`;
  const group = groupForFellowship(fellowship);

  return (
    <div className="flex flex-col gap-5">
      <Link href={base} className="-ml-1 inline-flex h-10 items-center gap-1 self-start rounded-full pl-1 pr-3 text-[15px] text-warm-gray hover:text-ink-black">
        <ChevronLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Fellowships
      </Link>
      <header className="flex flex-col gap-1.5">
        <h1 className={`${headlineClass} text-[34px]`}>{fellowship}</h1>
        <p className="text-[15px] text-warm-gray">{[group, rows[0] ? null : "No one registered yet"].filter(Boolean).join(" · ") || "Everyone registered in this fellowship."}</p>
      </header>
      <FellowshipMembers campId={camp.id} leader={leader} rows={rows} />
    </div>
  );
}
