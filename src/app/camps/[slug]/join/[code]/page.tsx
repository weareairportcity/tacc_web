import { notFound, redirect } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { getGroupByCode, getGroupFor } from "@/lib/camp/groups";
import { currentAttendee } from "@/lib/camp/session";
import { CampBackLink } from "@/components/camp/photos";
import { headlineClass } from "@/components/camp/ui";
import { JoinButton } from "./JoinButton";

/** A friend's join link. Not signed in: sign in first, then come straight back here. */
export default async function JoinPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}?next=${encodeURIComponent(`/camps/${camp.slug}/join/${code}`)}#sign-in`);
  const [group, mine] = await Promise.all([getGroupByCode(camp.id, code), getGroupFor(me.id)]);
  if (mine && group && mine.id === group.id) redirect(`/camps/${camp.slug}/roommates`);
  const owner = group?.members.find((m) => m.registration_id === group.owner_registration_id) ?? group?.members[0];

  const problem = !group
    ? "This link doesn't match a group for this camp."
    : me.status !== "fully_paid"
      ? "You can join once you're fully paid."
      : group.gender !== me.gender
        ? "That group is for the other gender."
        : group.room_type_id !== me.room_type_id
          ? `That group is for ${group.room_type_name}. You booked ${me.room_type_name}.`
          : group.state !== "open"
            ? "That group is locked."
            : group.members.length >= group.capacity
              ? "That group is full."
              : mine
                ? "You're already in a group. Leave it first."
                : null;

  return (
    <div className="flex flex-col gap-6">
      <CampBackLink href={`/camps/${camp.slug}/me`} camp={camp} label="Your registration" />
      <h1 className={`cm-rise ${headlineClass}`}>
        Join <span className="text-cyan-edge">{owner ? `${owner.full_name.split(" ")[0]}'s` : "a"}</span> room?
      </h1>
      {group && (
        <p className="text-[15px] text-warm-gray">
          {group.room_type_name} · {group.members.length} of {group.capacity} · {group.members.map((m) => m.full_name.split(" ")[0]).join(", ")}
        </p>
      )}
      {problem ? (
        <p role="alert" className="rounded-[10px] border border-stone-border bg-white px-4 py-3.5 text-[15px]">
          {problem}
        </p>
      ) : (
        <JoinButton slug={camp.slug} code={code} />
      )}
    </div>
  );
}
