import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { registrationOpen } from "@/lib/camp/registrations";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import { CHURCHES, PFCC_GROUPS } from "@/lib/fellowships";
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
    <div className="space-y-4">
      <Link href={`/camps/${camp.slug}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> {camp.name}
      </Link>
      <h1 className="text-2xl font-bold">Register</h1>
      <RegisterForm
        slug={camp.slug}
        signedIn={signedIn}
        roomTypes={await listRoomTypes(camp.id)}
        fellowshipGroups={PFCC_GROUPS.map((g) => ({ pfcc: g.pfcc, names: g.fellowships.map((f) => f.name) }))}
        churches={[...CHURCHES]}
      />
    </div>
  );
}
