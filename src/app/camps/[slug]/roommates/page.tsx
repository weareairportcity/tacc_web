import { notFound, redirect } from "next/navigation";
import { Crown, Lock, LockOpen, Mail, UserPlus } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { getGroupFor, listReceivedInvites, listSentInvites } from "@/lib/camp/groups";
import { campOrigin } from "@/lib/camp/origin";
import { currentAttendee } from "@/lib/camp/session";
import { CampBackLink } from "@/components/camp/photos";
import { Card, formatDate, headlineClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import {
  AnyRoom,
  CreateGroup,
  InviteSearch,
  LeaveGroup,
  LockToggle,
  ReceivedInviteActions,
  RemoveMember,
  SentInviteCancel,
  ShareLink,
} from "./RoommateControls";

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export default async function RoommatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}`);
  if (me.status !== "fully_paid") redirect(`/camps/${camp.slug}/me`);

  const group = await getGroupFor(me.id);
  const isOwner = group?.owner_registration_id === me.id;
  const [received, sent, origin] = await Promise.all([
    group ? [] : listReceivedInvites(me),
    group && isOwner && group.state === "open" ? listSentInvites(group.id) : [],
    campOrigin(),
  ]);
  const deadline = formatDate(camp.roommate_deadline_on);
  const gender = me.gender === "male" ? "men" : "women";

  return (
    <div className="flex flex-col gap-6">
      <CampBackLink href={`/camps/${camp.slug}/me`} camp={camp} label="Your registration" />
      <div className="flex flex-col gap-3">
        <h1 className={`cm-rise ${headlineClass}`}>
          {group ? (
            <>
              Your room of <span className="text-cyan-edge">{group.capacity}</span>
            </>
          ) : (
            <>
              Choose your <span className="text-cyan-edge">roommates</span>
            </>
          )}
        </h1>
        <p className="text-[15px] text-warm-gray">
          {me.room_type_name} · {gender} · by {deadline}
        </p>
      </div>

      {!group ? (
        <>
          {received.length > 0 && (
            <Card lifted title={received.length === 1 ? "You're invited" : `${received.length} invites`}>
              <ul className="flex flex-col text-sm">
                {received.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-border py-3 first:border-t-0 first:pt-0">
                    <span className="flex items-center gap-2.5">
                      <Mail className="h-4 w-4 flex-none" strokeWidth={1.6} aria-hidden="true" />
                      <span>
                        <span className="font-medium">{i.owner_name}</span>
                        <span className="text-warm-gray">
                          {" "}
                          · {i.member_count} of {i.capacity} places taken
                        </span>
                      </span>
                    </span>
                    <ReceivedInviteActions slug={camp.slug} inviteId={i.id} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {!me.any_room && (
            <Card lifted={received.length === 0} title="Start a group">
              <p className="text-sm text-warm-gray">You&apos;ll get a link to send friends.</p>
              <CreateGroup slug={camp.slug} />
            </Card>
          )}
          <Card>
            <AnyRoom slug={camp.slug} on={!!me.any_room} />
            {me.any_room ? <p className="-mt-2 text-sm text-warm-gray">A coordinator will place you.</p> : null}
          </Card>
          <p className="text-sm text-warm-gray">Got a link from a friend? Open it to join their group.</p>
        </>
      ) : (
        <>
          <section className="cm-rise flex flex-col gap-5 rounded-2xl bg-white p-6 shadow-seline-hero" style={{ animationDelay: "60ms" }}>
            <ul className="grid grid-cols-4 gap-3" aria-label={`${group.members.length} of ${group.capacity} places taken`}>
              {Array.from({ length: group.capacity }, (_, i) => {
                const m = group.members[i];
                return (
                  <li key={i} className="flex flex-col items-center gap-1.5 text-center">
                    <span
                      className={cn(
                        "relative flex h-14 w-14 items-center justify-center rounded-full text-sm font-medium",
                        m ? (m.registration_id === me.id ? "bg-cyan-signal text-ink-black" : "bg-soot text-white") : "cm-breathe border-2 border-dashed border-stone-muted",
                      )}
                    >
                      {m ? initials(m.full_name) : <UserPlus className="h-5 w-5 text-ash-gray" strokeWidth={1.5} aria-hidden="true" />}
                      {m?.registration_id === group.owner_registration_id && (
                        <Crown className="absolute -top-1.5 right-0 h-4 w-4 fill-white text-ink-black" strokeWidth={1.6} aria-label="Owner" />
                      )}
                    </span>
                    <span className="max-w-full truncate text-[12px] text-warm-gray">
                      {m ? (m.registration_id === me.id ? "You" : m.full_name.split(" ")[0]) : "Free"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {group.state === "open" ? (
              <ShareLink url={`${origin}/camps/${camp.slug}/join/${group.code}`} campName={camp.name} />
            ) : (
              <p className="flex items-start gap-2 text-sm leading-relaxed">
                <Lock className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.7} aria-hidden="true" />
                {group.state === "locked"
                  ? "Locked: nobody can join or leave until the owner unlocks it."
                  : "The deadline has passed, so this group is final. A coordinator will give it a room."}
              </p>
            )}
            {group.state === "open" && (
              <p className="flex items-center gap-2 text-sm text-warm-gray">
                <LockOpen className="h-4 w-4 flex-none text-ink-black" strokeWidth={1.7} aria-hidden="true" />
                <span>
                  <span className="font-medium text-ink-black">Open</span> · {group.capacity - group.members.length} free{" "}
                  {group.capacity - group.members.length === 1 ? "place" : "places"} · lock it when it&apos;s complete
                </span>
              </p>
            )}
          </section>

          <section className="flex flex-col">
            <h2 className="mb-1.5 font-display text-xl">Members</h2>
            <ul className="flex flex-col text-sm">
              {group.members.map((m) => (
                <li key={m.registration_id} className="flex items-center justify-between gap-3 border-t border-stone-border py-3">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-medium">{m.full_name}</span>
                    <span className="text-warm-gray">{m.fellowship}</span>
                    {m.registration_id === group.owner_registration_id && (
                      <span className="inline-flex items-center gap-1 text-[12px]">
                        <Crown className="h-3 w-3" aria-hidden="true" /> Owner
                      </span>
                    )}
                    {m.registration_id === me.id && <span className="text-[12px] text-warm-gray">You</span>}
                  </span>
                  {isOwner && group.state === "open" && m.registration_id !== me.id && (
                    <RemoveMember slug={camp.slug} registrationId={m.registration_id} name={m.full_name} />
                  )}
                </li>
              ))}
            </ul>
          </section>

          {isOwner && group.state === "open" && group.members.length < group.capacity && (
            <Card title="Invite by name">
              <InviteSearch slug={camp.slug} />
              {sent.length > 0 && (
                <div className="flex flex-col">
                  <p className="mb-1 text-sm font-medium">Waiting for a reply</p>
                  <ul className="flex flex-col text-sm">
                    {sent.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-3 border-t border-stone-border py-2.5">
                        <span>
                          <span className="font-medium">{i.full_name}</span>
                          <span className="text-warm-gray"> · {i.fellowship}</span>
                        </span>
                        <SentInviteCancel slug={camp.slug} inviteId={i.id} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {group.state !== "final" && (
            <div className="flex flex-wrap items-center gap-3">
              {isOwner && <LockToggle slug={camp.slug} locked={group.state === "locked"} />}
              {group.state === "open" && <LeaveGroup slug={camp.slug} isOwner={isOwner} />}
            </div>
          )}
          {isOwner && group.state !== "final" && (
            <p className="text-[13px] text-warm-gray">You can unlock it until the end of {deadline}.</p>
          )}
        </>
      )}
    </div>
  );
}
