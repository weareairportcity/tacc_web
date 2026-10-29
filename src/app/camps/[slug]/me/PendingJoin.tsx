import { Users } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { getGroupByCode, getGroupFor } from "@/lib/camp/groups";
import { readJoin } from "@/lib/camp/join-memory";
import { currentAttendee } from "@/lib/camp/session";
import { JoinButton } from "../join/[code]/JoinButton";
import { ForgetJoin } from "./MeControls";

/**
 * "Join Kofi's group?": a friend's link they opened before they'd registered
 * or paid, remembered on this phone. Shown only while they could still join
 * it; otherwise nothing.
 */
export async function PendingJoin({ slug }: { slug: string }) {
  const code = await readJoin(slug);
  if (!code) return null;
  const camp = await getCampBySlug(slug);
  const me = camp && (await currentAttendee(camp.id));
  if (!camp || !me) return null;
  const [group, mine] = await Promise.all([getGroupByCode(camp.id, code), getGroupFor(me.id)]);
  if (
    !group ||
    mine ||
    group.state !== "open" ||
    group.gender !== me.gender ||
    group.room_type_id !== me.room_type_id ||
    group.members.length >= group.capacity
  ) {
    return null;
  }
  const owner = group.members.find((m) => m.registration_id === group.owner_registration_id) ?? group.members[0];
  const name = owner ? owner.full_name.split(" ")[0] : "your friend";
  return (
    <section aria-labelledby="pending-join" className="cm-rise flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-seline-hero">
      <span className="flex items-center gap-3">
        <Users className="h-[22px] w-[22px] flex-none" strokeWidth={1.5} aria-hidden="true" />
        <span className="flex flex-col">
          <span id="pending-join" className="text-base font-semibold">
            Join {name}&apos;s group?
          </span>
          <span className="text-sm text-warm-gray">
            You opened their link before you registered. {group.members.length} of {group.capacity} places taken.
          </span>
        </span>
      </span>
      <JoinButton slug={slug} code={code} label={`Join ${name}'s group`} />
      <ForgetJoin slug={slug} />
    </section>
  );
}
