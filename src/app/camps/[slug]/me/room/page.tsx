import { notFound, redirect } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { listMyRequests } from "@/lib/camp/requests";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import { CampBackLink } from "@/components/camp/photos";
import { headlineClass } from "@/components/camp/ui";
import { ChangeRoomForm } from "./ChangeRoomForm";

/** Asking to move to another room type. A coordinator approves; the price follows. */
export default async function ChangeRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}`);
  if (me.status === "cancelled") redirect(`/camps/${camp.slug}/me`);
  const [types, requests] = await Promise.all([listRoomTypes(camp.id), listMyRequests(me)]);
  const waiting = requests.find((r) => r.kind === "room_change" && r.status === "pending");
  return (
    <div className="flex flex-col gap-6">
      <CampBackLink href={`/camps/${camp.slug}/me`} camp={camp} label="Your registration" />
      <h1 className={`cm-rise ${headlineClass}`}>
        Change your <span className="text-cyan-edge">room</span>
      </h1>
      <ChangeRoomForm
        slug={camp.slug}
        current={me.room_type_id}
        paid={me.paid_pesewas}
        gender={me.gender}
        types={types}
        waiting={waiting ? { id: waiting.id, to: waiting.to_room_type_name ?? "" } : null}
      />
    </div>
  );
}
