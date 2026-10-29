import { notFound, redirect } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { getMyRoom } from "@/lib/camp/assignments";
import { getGroupFor } from "@/lib/camp/groups";
import { getPrivateDetails } from "@/lib/camp/profile";
import { todayInGhana } from "@/lib/camp/registrations";
import { currentAttendee } from "@/lib/camp/session";
import { Intro } from "@/components/camp/subpage";
import { DetailsForm } from "./DetailsForm";

export default async function DetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}`);
  const [details, group, room] = await Promise.all([getPrivateDetails(me.id), getGroupFor(me.id), getMyRoom(me.id)]);
  return (
    <div className="flex flex-col gap-6">
      <Intro
        slug={camp.slug}
        title={
          <>
            Your <span className="text-cyan-edge">details</span>
          </>
        }
      >
        Check these are right. Change anything, then press Save at the bottom.
      </Intro>
      <DetailsForm
        slug={camp.slug}
        phone={me.phone}
        initial={{
          full_name: me.full_name,
          email: me.email,
          shirt_size: me.shirt_size,
          emergency_name: details.emergency_name,
          emergency_phone: details.emergency_phone ? `0${details.emergency_phone.slice(3)}` : "",
          health_notes: details.health_notes,
        }}
        cancelled={me.status === "cancelled"}
        gender={{
          now: me.gender,
          inGroup: !!group,
          room: room?.label ?? null,
          // After the roommate deadline rooms are being finalised, so a coordinator changes it.
          canChange: me.status !== "cancelled" && todayInGhana() <= camp.roommate_deadline_on,
        }}
      />
    </div>
  );
}
