import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { listInbox } from "@/lib/camp/inbox";
import { teamOwner } from "@/lib/camp/team-app";
import { headlineClass } from "@/components/camp/ui";
import { InboxList } from "@/components/camp/inbox/InboxList";
import { MarkRead } from "@/components/camp/inbox/MarkRead";
import { markInboxReadAction } from "../../actions";
import { NoAccess, pageStaff } from "../../access";

/** Notifications, for coordinators and leaders: every app notification sent to them, to open again later. */
export default async function NotificationsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator", "leader", "pastor", "medical");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const items = await listInbox(teamOwner(staff));
  const unread = items.filter((i) => !i.read_at).length;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className={`${headlineClass} text-[34px]`}>Notifications</h1>
        <p className="text-[15px] text-warm-gray">
          Everything sent to your phone{staff.role === "leader" || staff.role === "medical" ? " (and anyone sharing your code)" : ""}, newest first. Tap one to open it.
        </p>
      </header>
      <InboxList items={items} />
      <MarkRead action={markInboxReadAction} unread={unread} />
    </div>
  );
}
