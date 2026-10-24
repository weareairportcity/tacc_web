import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Crown } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { formatGroupCode } from "@/lib/camp/codes";
import { getGroupFor, listReceivedInvites, listSentInvites } from "@/lib/camp/groups";
import { currentAttendee } from "@/lib/camp/session";
import { GROUP_STATE_LABELS } from "@/lib/camp/types";
import { Card, formatDate } from "@/components/camp/ui";
import {
  CreateGroup,
  InviteSearch,
  JoinGroup,
  LeaveGroup,
  LockToggle,
  ReceivedInviteActions,
  RemoveMember,
  SentInviteCancel,
} from "./RoommateControls";

const STATE_STYLES = {
  open: "bg-emerald-50 text-emerald-700",
  locked: "bg-amber-50 text-amber-700",
  final: "bg-slate-100 text-slate-600",
} as const;

export default async function RoommatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}`);
  if (me.status !== "fully_paid") redirect(`/camps/${camp.slug}/me`);

  const group = await getGroupFor(me.id);
  const isOwner = group?.owner_registration_id === me.id;
  const [received, sent] = await Promise.all([
    group ? [] : listReceivedInvites(me),
    group && isOwner && group.state === "open" ? listSentInvites(group.id) : [],
  ]);
  const deadline = formatDate(camp.roommate_deadline_on);
  const gender = me.gender === "male" ? "men" : "women";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/camps/${camp.slug}/me`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Your registration
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Roommates</h1>
        <p className="mt-1 text-sm text-slate-600">
          Rooms are single-gender, so your group is {gender} who booked {me.room_type_name}. Groups can change until
          the end of {deadline}; then a coordinator assigns rooms.
        </p>
      </div>

      {!group ? (
        <>
          {received.length > 0 && (
            <Card title="Invites">
              <ul className="divide-y divide-slate-100 text-sm">
                {received.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span>
                      <span className="font-medium">{i.owner_name}</span>
                      <span className="text-slate-500">
                        {" "}
                        invited you · {i.member_count} of {i.capacity} places taken
                      </span>
                    </span>
                    <ReceivedInviteActions slug={camp.slug} inviteId={i.id} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Join a group">
            <JoinGroup slug={camp.slug} />
          </Card>
          <Card title="Start a group">
            <p className="mb-3 text-sm text-slate-600">
              You&apos;ll get a code to share with friends who booked {me.room_type_name}. You can also invite them by
              name.
            </p>
            <CreateGroup slug={camp.slug} />
          </Card>
          <p className="text-sm text-slate-500">
            No group by the deadline? That&apos;s fine: a coordinator will place you with others.
          </p>
        </>
      ) : (
        <>
          <Card
            title="Your group"
            action={
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLES[group.state]}`}>
                {GROUP_STATE_LABELS[group.state]}
              </span>
            }
          >
            <div className="space-y-4">
              {group.state === "open" && (
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-sm text-slate-500">Group code</p>
                  <p className="mt-1 font-mono text-3xl font-bold tracking-widest">{formatGroupCode(group.code)}</p>
                  <p className="mt-1 text-xs text-slate-500">Share it with friends who can join.</p>
                </div>
              )}
              <p className="text-sm text-slate-600">
                {group.members.length} of {group.capacity} places taken
                {group.state === "locked" && " · Locked: nobody can join or leave until the owner unlocks it."}
                {group.state === "final" && " · The deadline has passed, so this group is final."}
              </p>
              <ul className="divide-y divide-slate-100 text-sm">
                {group.members.map((m) => (
                  <li key={m.registration_id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{m.full_name}</span>
                      <span className="text-slate-500">{m.fellowship}</span>
                      {m.registration_id === group.owner_registration_id && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                          <Crown className="h-3 w-3" /> Owner
                        </span>
                      )}
                      {m.registration_id === me.id && <span className="text-xs text-slate-400">You</span>}
                    </span>
                    {isOwner && group.state === "open" && m.registration_id !== me.id && (
                      <RemoveMember slug={camp.slug} registrationId={m.registration_id} name={m.full_name} />
                    )}
                  </li>
                ))}
              </ul>
              {group.state !== "final" && (
                <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                  {isOwner && <LockToggle slug={camp.slug} locked={group.state === "locked"} />}
                  {group.state === "open" && <LeaveGroup slug={camp.slug} isOwner={isOwner} />}
                </div>
              )}
              {isOwner && group.state !== "final" && (
                <p className="text-xs text-slate-500">
                  {group.state === "locked"
                    ? `You can unlock it until the end of ${deadline}.`
                    : `Lock the group when it's complete. You can unlock it until the end of ${deadline}.`}
                </p>
              )}
            </div>
          </Card>

          {isOwner && group.state === "open" && group.members.length < group.capacity && (
            <Card title="Invite by name">
              <div className="space-y-4">
                <InviteSearch slug={camp.slug} />
                {sent.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium text-slate-700">Waiting for a reply</p>
                    <ul className="divide-y divide-slate-100 text-sm">
                      {sent.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                          <span>
                            <span className="font-medium">{i.full_name}</span>
                            <span className="text-slate-500"> · {i.fellowship}</span>
                          </span>
                          <SentInviteCancel slug={camp.slug} inviteId={i.id} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
