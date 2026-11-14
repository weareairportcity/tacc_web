import { notFound, redirect } from "next/navigation";
import { registrationOpen } from "@/lib/camp/registrations";
import { listRoomTypes } from "@/lib/camp/rooms";
import { campAndAttendee } from "@/lib/camp/session";
import { CHURCHES, PFCC_GROUPS } from "@/lib/fellowships";
import { CampBackLink } from "@/components/camp/photos";
import { headlineClass } from "@/components/camp/ui";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { camp, me } = await campAndAttendee(slug);
  if (!camp) notFound();
  // No redirect when signed in: registering sets the session cookie, which
  // re-renders this page, and the form must stay put to show the new code.
  const signedIn = Boolean(me);
  if (!signedIn && !registrationOpen(camp)) redirect(`/camps/${camp.slug}`);

  return (
    <div className="flex flex-col gap-6">
      <CampBackLink href={`/camps/${camp.slug}`} camp={camp} />
      {/* The form shows the steps: about you, where you'll sleep, your code. */}
      <h1 className={headlineClass}>
        Save your <span className="text-cyan-edge">place</span>
      </h1>
      <RegisterForm
        slug={camp.slug}
        signedIn={signedIn}
        roomTypes={await listRoomTypes(camp.id)}
        fellowshipGroups={PFCC_GROUPS.map((g) => ({ pfcc: g.pfcc, names: g.fellowships.map((f) => f.name) }))}
        churches={[...CHURCHES]}
        dueOn={camp.payment_due_on}
      />
    </div>
  );
}
