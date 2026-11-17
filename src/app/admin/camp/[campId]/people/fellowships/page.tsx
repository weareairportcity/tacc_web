import { notFound, redirect } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { getFellowshipBreakdown, scopeFor } from "@/lib/camp/reports";
import { headlineClass } from "@/components/camp/ui";
import { PeopleTabs } from "@/components/camp/PeopleTabs";
import { FellowshipRanking, GroupRanking, MoneyCard, active, rankGroups, sum } from "@/components/camp/FellowshipRanking";
import { NoAccess, pageStaff } from "../../../access";

/**
 * People › Fellowships: each fellowship ranked by how many have registered
 * (cancelled left out), with the money. Coordinators see every fellowship and
 * the groups ranked; a Group or PFCC leader sees their own fellowships.
 * Tap one for its own page of people.
 */
export default async function FellowshipsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const leader = staff.role === "leader";
  if (leader && camp.status === "draft") notFound();
  const scope = scopeFor(staff);
  // A fellowship leader has one fellowship: nothing to rank.
  if (leader && scope.kind === "fellowship") redirect(`/leaders/${camp.id}/people`);

  const ranked = await getFellowshipBreakdown(camp.id, scope);
  const everyone = active(sum(ranked));
  const people = `${leader ? "/leaders" : "/admin/camp"}/${camp.id}/people`;
  const groups = leader ? [] : rankGroups(ranked);

  return (
    <div className="flex flex-col gap-5">
      <h1 className={`${headlineClass} text-[34px]`}>{leader && scope.kind !== "all" ? scope.value : "People"}</h1>
      <PeopleTabs base={people} current="fellowships" />
      <p className="text-[15px] text-warm-gray">
        {ranked.length} {ranked.length === 1 ? "fellowship" : "fellowships"} ranked by how many have registered. {everyone} {everyone === 1 ? "person" : "people"} in all;
        cancelled registrations aren&apos;t counted.
      </p>

      {ranked.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-6 text-center text-[15px] text-warm-gray">No registrations yet.</p>
      ) : (
        <>
          <MoneyCard all={sum(ranked)} />
          {groups.length > 1 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-semibold">By group</h2>
              <GroupRanking groups={groups} />
            </section>
          )}
          <section className="flex flex-col gap-2.5">
            {groups.length > 1 && <h2 className="text-[15px] font-semibold">By fellowship</h2>}
            <FellowshipRanking ranked={ranked} showGroup={!leader} href={(name) => `${people}/fellowships/${encodeURIComponent(name)}`} />
          </section>
        </>
      )}
    </div>
  );
}
