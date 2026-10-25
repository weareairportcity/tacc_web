import { notFound, redirect } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { registrationOpen } from "@/lib/camp/registrations";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import { CHURCHES, PFCC_GROUPS } from "@/lib/fellowships";
import { CampBackLink } from "@/components/camp/photos";
import { headlineClass } from "@/components/camp/ui";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  // No redirect when signed in: registering sets the session cookie, which
  // re-renders this page, and the form must stay put to show the new code.
  const signedIn = Boolean(await currentAttendee(camp.id));
  if (!signedIn && !registrationOpen(camp)) redirect(`/camps/${camp.slug}`);

  return (
    <div className="flex flex-col gap-6">
      <CampBackLink href={`/camps/${camp.slug}`} camp={camp} />
      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-1 flex-1 rounded-full bg-soot" />
          <span className="h-1 flex-1 rounded-full bg-stone-border" />
        </div>
        <p className="text-[13px] text-warm-gray">Step 1 of 2 · Register. Then pay, now or later.</p>
        <h1 className={headlineClass}>
          Save your <span className="text-cyan-edge">place</span>
        </h1>
      </div>
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
