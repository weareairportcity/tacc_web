import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { registrationOpen } from "@/lib/camp/registrations";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import { Card, buttonClass, formatDate } from "@/components/camp/ui";
import { SignIn } from "./SignIn";

export default async function CampLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  if (await currentAttendee(camp.id)) redirect(`/camps/${camp.slug}/me`);

  const roomTypes = await listRoomTypes(camp.id);
  const open = registrationOpen(camp);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{camp.name}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-4 w-4" />
            {formatDate(camp.starts_on)} – {formatDate(camp.ends_on)}
          </span>
          {camp.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {camp.venue}
            </span>
          )}
        </div>
      </div>

      <Card title="Rooms and prices">
        <ul className="divide-y divide-slate-100 text-sm">
          {roomTypes.map((t) => (
            <li key={t.id} className="flex justify-between gap-3 py-2">
              <span>
                {t.name} <span className="text-slate-500">· {t.capacity} per room</span>
              </span>
              <span className="font-medium">{formatCedis(t.price_pesewas)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-500">
          Pay in full or in parts by {formatDate(camp.payment_due_on)}. A small Paystack fee is added to each payment.
        </p>
      </Card>

      {open ? (
        <Link href={`/camps/${camp.slug}/register`} className={`${buttonClass} w-full py-3 text-base`}>
          Register
        </Link>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {camp.status === "open" && camp.registration_opens_on > new Date().toISOString().slice(0, 10)
            ? `Registration opens on ${formatDate(camp.registration_opens_on)}.`
            : "Registration is closed."}
        </p>
      )}

      <Card title="Already registered?">
        <SignIn slug={camp.slug} />
      </Card>
    </div>
  );
}
