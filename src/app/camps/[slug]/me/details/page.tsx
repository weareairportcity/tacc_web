import { notFound, redirect } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { getPrivateDetails } from "@/lib/camp/profile";
import { currentAttendee } from "@/lib/camp/session";
import { CampBackLink } from "@/components/camp/photos";
import { headlineClass } from "@/components/camp/ui";
import { DetailsForm } from "./DetailsForm";

export default async function DetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const me = await currentAttendee(camp.id);
  if (!me) redirect(`/camps/${camp.slug}`);
  const details = await getPrivateDetails(me.id);
  return (
    <div className="flex flex-col gap-6">
      <CampBackLink href={`/camps/${camp.slug}/me`} camp={camp} label="Your registration" />
      <h1 className={`cm-rise ${headlineClass}`}>
        Your <span className="text-cyan-edge">details</span>
      </h1>
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
      />
    </div>
  );
}
