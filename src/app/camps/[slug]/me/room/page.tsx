import { notFound, redirect } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { listMyRequests } from "@/lib/camp/requests";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import { Intro } from "@/components/camp/subpage";
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
      <Intro
        slug={camp.slug}
        title={
          <>
            Change your <span className="text-cyan-edge">room</span>
          </>
        }
      >
        Pick the room you&apos;d like instead. A coordinator checks there&apos;s space and says yes or no.
      </Intro>
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
