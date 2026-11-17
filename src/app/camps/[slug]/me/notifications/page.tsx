import { notFound, redirect } from "next/navigation";
import { listInbox } from "@/lib/camp/inbox";
import { campAndAttendee } from "@/lib/camp/session";
import { Intro } from "@/components/camp/subpage";
import { InboxList } from "@/components/camp/inbox/InboxList";
import { MarkRead } from "@/components/camp/inbox/MarkRead";
import { markInboxReadAction } from "../../actions";

/** An attendee's notifications: every app notification sent to them, to open again later. */
export default async function MyNotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { camp, me } = await campAndAttendee(slug);
  if (!camp) notFound();
  if (!me) redirect(`/camps/${camp.slug}`);
  const items = await listInbox(`attendee:${me.id}`);
  const unread = items.filter((i) => !i.read_at).length;
  return (
    <div className="flex flex-col gap-6">
      <Intro
        slug={camp.slug}
        title={
          <>
            Your <span className="text-cyan-edge">notifications</span>
          </>
        }
      >
        Everything Commune has sent to your phone, newest first. Tap one to open it.
      </Intro>
      <InboxList items={items} />
      <MarkRead action={markInboxReadAction.bind(null, camp.slug)} unread={unread} />
    </div>
  );
}
