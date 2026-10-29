import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftRight, Clock, Link2Off, Lock, Users, type LucideIcon } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { getGroupByCode, getGroupFor } from "@/lib/camp/groups";
import { formatCedis } from "@/lib/camp/money";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import { CampBackLink } from "@/components/camp/photos";
import { formatDay, headlineClass, primaryButtonClass, secondaryButtonClass, titleClass } from "@/components/camp/ui";
import { JoinButton, RememberJoin } from "./JoinButton";

const first = (name: string) => name.split(" ")[0];
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/**
 * A friend's group link. Every way it can't be used gets the whole screen:
 * what's wrong and the button that fixes it. Someone who hasn't registered
 * (or paid) yet has the link remembered, so their home offers it once they've
 * paid in full.
 */
export default async function JoinPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const [me, group] = await Promise.all([currentAttendee(camp.id), getGroupByCode(camp.id, code)]);
  const owner = group?.members.find((m) => m.registration_id === group.owner_registration_id) ?? group?.members[0];
  const ownerName = owner ? first(owner.full_name) : "Your friend";
  const home = `/camps/${camp.slug}${me ? "/me" : ""}`;
  const roommates = `/camps/${camp.slug}/roommates`;
  const here = `/camps/${camp.slug}/join/${code}`;
  const deadline = formatDay(camp.roommate_deadline_on);

  if (!group) {
    return (
      <Problem camp={camp} back={home} icon={Link2Off} title="This link doesn't work" primary={{ href: home, label: "Back to home" }}>
        It may be copied wrong, or the group no longer exists. Ask your friend to send it again.
      </Problem>
    );
  }

  const placesLine = `${group.room_type_name} · ${group.members.length} of ${group.capacity} places taken`;

  if (group.state === "final") {
    return (
      <Problem camp={camp} back={home} icon={Clock} title="The roommate deadline has passed" primary={{ href: home, label: "Back to home" }}>
        Groups closed on {deadline}. A coordinator is placing everyone in rooms now.{me ? " We'll text you yours." : ""}
      </Problem>
    );
  }

  if (!me) {
    return (
      <div className="flex flex-col gap-6">
        <RememberJoin slug={camp.slug} code={code} />
        <CampBackLink href={`/camps/${camp.slug}`} camp={camp} />
        <section aria-labelledby="invite" className="cm-rise flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-seline-hero sm:p-6">
          <span className="flex items-center gap-3">
            <Faces names={group.members.map((m) => m.full_name)} />
            <span className="flex flex-col">
              <span id="invite" className="text-lg font-semibold">
                {ownerName} wants you in their room
              </span>
              <span className="text-sm text-warm-gray">{placesLine}</span>
            </span>
          </span>
          <p className="text-[15px] leading-relaxed">
            First you need to register for {camp.name}. <strong className="font-semibold">We&apos;ll remember {ownerName}&apos;s link</strong>, so you can join
            their group as soon as you&apos;ve paid.
          </p>
          <ol aria-label="What happens" className="grid grid-cols-3 gap-1.5 text-center text-[13px]">
            {[
              ["Register", `choose ${group.room_type_name}`],
              ["Pay in full", "MoMo or card"],
              [`Join ${ownerName}`, "one tap"],
            ].map(([title, sub], i) => (
              <li key={title} className="flex flex-col items-center gap-1.5">
                <span
                  className={
                    i === 0
                      ? "flex h-[30px] w-[30px] items-center justify-center rounded-full bg-cyan-signal font-semibold"
                      : "flex h-[30px] w-[30px] items-center justify-center rounded-full border border-stone-border font-semibold"
                  }
                >
                  {i + 1}
                </span>
                <span className="font-medium">{title}</span>
                <span className="text-warm-gray">{sub}</span>
              </li>
            ))}
          </ol>
          <Link href={`/camps/${camp.slug}/register`} className={`${primaryButtonClass} h-14 w-full text-[17px]`}>
            Register now
          </Link>
          <Link href={`/camps/${camp.slug}/sign-in?next=${encodeURIComponent(here)}`} className={`${secondaryButtonClass} h-12 w-full text-[15px]`}>
            I&apos;ve already registered, sign in
          </Link>
        </section>
      </div>
    );
  }

  const mine = await getGroupFor(me.id);
  if (mine && mine.id === group.id) redirect(roommates);

  if (me.status === "cancelled") {
    return (
      <Problem camp={camp} back={home} icon={Lock} title="Your registration is cancelled" primary={{ href: home, label: "Back to home" }}>
        Only people coming to camp can join a group.
      </Problem>
    );
  }
  if (me.status !== "fully_paid") {
    return (
      <>
        <RememberJoin slug={camp.slug} code={code} />
        <Problem camp={camp} back={home} icon={Lock} title="You can join once you've paid in full" primary={{ href: home, label: `Pay ${formatCedis(me.price_pesewas - me.paid_pesewas)}` }}>
          {formatCedis(me.price_pesewas - me.paid_pesewas)} left to pay. We&apos;ll remember {ownerName}&apos;s link: once you&apos;ve paid, your home page asks if you
          want to join.
        </Problem>
      </>
    );
  }
  if (group.gender !== me.gender) {
    return (
      <Problem
        camp={camp}
        back={home}
        icon={Users}
        title={`This group is for ${group.gender === "male" ? "men" : "women"}`}
        primary={{ href: roommates, label: "Choose roommates another way" }}
        secondary={{ href: home, label: "Back to home" }}
      >
        {ownerName}&apos;s link is for a {group.gender === "male" ? "men's" : "women's"} {group.room_type_name} group, and you&apos;re registered as{" "}
        {me.gender === "male" ? "a man" : "a woman"}. Rooms are for men or women only.
      </Problem>
    );
  }
  if (group.room_type_id !== me.room_type_id) {
    const types = await listRoomTypes(camp.id);
    const theirs = types.find((t) => t.id === group.room_type_id);
    const diff = theirs ? theirs.price_pesewas - me.price_pesewas : 0;
    return (
      <Problem
        camp={camp}
        back={home}
        icon={ArrowLeftRight}
        title={`This group is in ${group.room_type_name}`}
        primary={{ href: `/camps/${camp.slug}/me/room`, label: `Ask to move to ${group.room_type_name}` }}
        secondary={{ href: roommates, label: "Choose roommates another way" }}
      >
        You booked {me.room_type_name}. To join {ownerName} you&apos;d need to move to {group.room_type_name}
        {diff > 0 ? ` (${formatCedis(diff)} more)` : diff < 0 ? ` (${formatCedis(-diff)} less)` : ""}. A coordinator approves moves.
      </Problem>
    );
  }
  if (group.members.length >= group.capacity) {
    return (
      <Problem
        camp={camp}
        back={home}
        icon={Users}
        title={`${ownerName}'s group is full`}
        primary={{ href: roommates, label: "Start my own group" }}
        secondary={{ href: home, label: "Back to home" }}
      >
        All {group.capacity} places are taken. Ask {ownerName} if anyone is leaving, or start your own group.
      </Problem>
    );
  }
  if (mine) {
    return (
      <Problem
        camp={camp}
        back={home}
        icon={Users}
        title="You're already in a group"
        primary={{ href: roommates, label: "Go to my group" }}
        secondary={{ href: home, label: "Back to home" }}
      >
        To join {ownerName} instead, leave your group on the Roommates page first, then tap this link again.
      </Problem>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <CampBackLink href={home} camp={camp} label="Back to home" />
      <div className="flex flex-col gap-2.5">
        <h1 className={`cm-rise ${headlineClass}`}>
          Join <span className="text-cyan-edge">{ownerName}&apos;s</span> group?
        </h1>
        <p className="text-base leading-relaxed text-warm-gray">You&apos;ll share a {group.room_type_name} room with the people in this group.</p>
      </div>
      <section aria-label={`${ownerName}'s group`} className="cm-rise flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-seline-hero" style={{ animationDelay: "60ms" }}>
        <Faces names={group.members.map((m) => m.full_name)} open={group.capacity - group.members.length} />
        <dl className="grid grid-cols-2 gap-3 text-[13px]">
          {[
            ["In the group", group.members.map((m) => first(m.full_name)).join(", ")],
            ["Places left", `${group.capacity - group.members.length} of ${group.capacity}`],
            ["Room type", group.room_type_name],
            ["Choose by", deadline],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-warm-gray">{k}</dt>
              <dd className="mt-0.5 text-base font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <JoinButton slug={camp.slug} code={code} label={`Join ${ownerName}'s group`} />
        <Link href={roommates} className={`${secondaryButtonClass} h-12 w-full text-[15px]`}>
          Not now
        </Link>
      </section>
    </div>
  );
}

/** Up to four initials in overlapping circles, then a dashed circle per open place. */
function Faces({ names, open = 0 }: { names: string[]; open?: number }) {
  return (
    <span className="flex items-center" aria-hidden="true">
      {names.slice(0, 4).map((n, i) => (
        <span key={i} className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white bg-soot text-[15px] font-medium text-white ${i ? "-ml-3" : ""}`}>
          {initials(n)}
        </span>
      ))}
      {open > 0 && <span className="ml-1.5 flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-stone-muted bg-white text-lg text-ash-gray">+</span>}
    </span>
  );
}

type Action = { href: string; label: string };

/** A link that can't be used: the whole screen says why, with the button that fixes it. Never the sign-in box. */
function Problem({
  camp,
  back,
  icon: Icon,
  title,
  children,
  primary,
  secondary,
}: {
  camp: Parameters<typeof CampBackLink>[0]["camp"];
  back: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  primary: Action;
  secondary?: Action;
}) {
  return (
    <div className="flex flex-col gap-6">
      <CampBackLink href={back} camp={camp} label="Back to home" />
      <section role="alert" className="cm-rise flex flex-col items-center gap-3 rounded-2xl border border-stone-border bg-white px-5 py-6 text-center shadow-seline-card">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-rail">
          <Icon className="h-[26px] w-[26px]" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h1 className={`${titleClass} text-[22px] leading-tight`}>{title}</h1>
        <p className="text-[15px] leading-relaxed text-warm-gray">{children}</p>
        <Link href={primary.href} className={`${primaryButtonClass} mt-1 h-[52px] w-full`}>
          {primary.label}
        </Link>
        {secondary && (
          <Link href={secondary.href} className={`${secondaryButtonClass} h-12 w-full text-[15px]`}>
            {secondary.label}
          </Link>
        )}
      </section>
    </div>
  );
}
