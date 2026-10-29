import { notFound, redirect } from "next/navigation";
import { Check, Link2, Lock, Plus } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { getGroupFor } from "@/lib/camp/groups";
import { campOrigin } from "@/lib/camp/origin";
import { todayInGhana } from "@/lib/camp/registrations";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import { Choice, Intro, Note } from "@/components/camp/subpage";
import { formatDay } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { AnyRoom, CreateGroup, LeaveGroup, RemoveMember, ShareLink } from "./RoommateControls";

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * Roommates. Three numbered ways in: start a group (and send its link), join
 * a friend's group (by tapping their link: the only way in), or any room. In a
 * group: the places as faces, the WhatsApp link, the members, and Leave.
 */
export default async function RoommatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}`);
  if (me.status !== "fully_paid") redirect(`/camps/${camp.slug}/me`);

  const [group, origin, types] = await Promise.all([getGroupFor(me.id), campOrigin(), listRoomTypes(camp.id)]);
  const deadline = formatDay(camp.roommate_deadline_on);
  const gender = me.gender === "male" ? "men" : "women";
  const sleeps = types.find((t) => t.id === me.room_type_id)?.capacity;
  const firstName = me.full_name.split(" ")[0];

  if (!group) {
    const closed = todayInGhana() > camp.roommate_deadline_on;
    return (
      <div className="flex flex-col gap-3.5">
        <Intro
          slug={camp.slug}
          title={
            <>
              Choose your <span className="text-cyan-edge">roommates</span>
            </>
          }
        >
          {closed ? (
            "The deadline has passed. A coordinator is placing everyone in rooms now, and we'll text you yours."
          ) : (
            <>
              {sleeps ? `${me.room_type_name} rooms sleep ${sleeps} ${gender}. ` : ""}Choose who you&apos;ll share with by{" "}
              <strong className="font-medium text-ink-black">{deadline}</strong>. If you don&apos;t, we&apos;ll place you.
            </>
          )}
        </Intro>

        {!closed && (
          <>
            {me.any_room ? (
              <Note icon={Check} className="mt-3">
                You chose <strong className="font-semibold">any room</strong>. A coordinator will place you with others. You can still change your mind until {deadline}.
              </Note>
            ) : (
              <h2 className="mt-3 font-display text-xl tracking-[-0.017em]">Pick one</h2>
            )}
            {!me.any_room && (
              <>
                <Choice num={1} title="Start a group" sub={`You get a link to send to your friends on WhatsApp.${sleeps ? ` Up to ${sleeps} people.` : ""}`} primary delay={120}>
                  <CreateGroup slug={camp.slug} />
                </Choice>
                <Choice num={2} title="Join a friend's group" sub="Ask your friend to send you their group link on WhatsApp. Tap the link and it brings you here to join." delay={180}>
                  <Note icon={Link2}>
                    No link yet? Your friend finds it on their Roommates page under <strong className="font-semibold">Send on WhatsApp</strong>.
                  </Note>
                </Choice>
              </>
            )}
            <Choice
              num={me.any_room ? 1 : 3}
              title="I don't mind who I'm with"
              sub={`We'll put you in a room with others. You can still change your mind until ${deadline}.`}
              delay={240}
            >
              <AnyRoom slug={camp.slug} on={!!me.any_room} />
            </Choice>
          </>
        )}
      </div>
    );
  }

  const isOwner = group.owner_registration_id === me.id;
  const open = group.state === "open";
  const left = group.capacity - group.members.length;

  return (
    <div className="flex flex-col gap-6">
      <Intro
        slug={camp.slug}
        title={
          <>
            Your room of <span className="text-cyan-edge">{group.capacity}</span>
          </>
        }
      >
        {me.room_type_name} · {gender} ·{" "}
        {open ? `choose by ${deadline}. A coordinator gives your group a room after that.` : "the deadline has passed, so this group is final. A coordinator will give it a room."}
      </Intro>

      <section aria-label="Your group" className="cm-rise flex flex-col gap-[18px] rounded-2xl bg-white p-5 shadow-seline-hero" style={{ animationDelay: "60ms" }}>
        <ul className="grid grid-cols-4 gap-2" aria-label={`${group.members.length} of ${group.capacity} places taken`}>
          {Array.from({ length: group.capacity }, (_, i) => {
            const m = group.members[i];
            return (
              <li key={i} className="flex flex-col items-center gap-1.5 text-center text-[13px]">
                <span
                  className={cn(
                    "flex h-[60px] w-[60px] items-center justify-center rounded-full text-base font-medium",
                    m ? (m.registration_id === me.id ? "bg-cyan-signal text-ink-black" : "bg-soot text-white") : "cm-breathe border-2 border-dashed border-stone-muted",
                  )}
                >
                  {m ? initials(m.full_name) : <Plus className="h-5 w-5 text-ash-gray" strokeWidth={1.6} aria-hidden="true" />}
                </span>
                <span className={cn("max-w-full truncate", !m && "text-warm-gray")}>{m ? (m.registration_id === me.id ? "You" : m.full_name.split(" ")[0]) : "Free"}</span>
              </li>
            );
          })}
        </ul>
        {open ? (
          left > 0 ? (
            <>
              <p className="text-center text-base leading-normal">
                {left} {left === 1 ? "place" : "places"} left. <span className="text-warm-gray">Send this to {left} more {left === 1 ? "friend" : "friends"}.</span>
              </p>
              <ShareLink url={`${origin}/camps/${camp.slug}/join/${group.code}`} campName={camp.name} firstName={firstName} />
              <p className="text-center text-[13px] leading-normal text-warm-gray">
                Friends join by tapping your link. Only people in {me.room_type_name} ({gender}) can join.
              </p>
            </>
          ) : (
            <p className="flex items-center justify-center gap-2 text-center text-base">
              <Check className="h-[18px] w-[18px] text-st-paid" strokeWidth={2.4} aria-hidden="true" /> Your group is full.
            </p>
          )
        ) : (
          <p className="flex items-start gap-2 text-sm leading-relaxed">
            <Lock className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.7} aria-hidden="true" />
            Groups closed on {deadline}. A coordinator will give this group a room, and we&apos;ll text you.
          </p>
        )}
      </section>

      <section className="flex flex-col">
        <h2 className="mb-2 font-display text-xl tracking-[-0.017em]">In this group</h2>
        <ul className="flex flex-col">
          {group.members.map((m) => (
            <li key={m.registration_id} className="flex min-h-[60px] items-center justify-between gap-3 border-t border-stone-border">
              <span className="flex flex-col">
                <span className="text-base font-medium">
                  {m.full_name}
                  {m.registration_id === me.id ? " (you)" : ""}
                </span>
                <span className="text-[13px] text-warm-gray">
                  {m.fellowship}
                  {m.registration_id === group.owner_registration_id ? " · started the group" : ""}
                </span>
              </span>
              {isOwner && open && m.registration_id !== me.id && <RemoveMember slug={camp.slug} registrationId={m.registration_id} name={m.full_name} />}
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <section className="flex flex-col gap-2.5">
          <p className="text-sm leading-relaxed text-warm-gray">Changed your mind? You can leave until {deadline}.</p>
          <LeaveGroup slug={camp.slug} isOwner={isOwner} />
        </section>
      )}
    </div>
  );
}
