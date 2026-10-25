import { notFound, redirect } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { daysUntil } from "@/lib/camp/registrations";
import { currentAttendee } from "@/lib/camp/session";
import { Processing } from "./Processing";

/**
 * Where Paystack sends the attendee back. It never marks anything paid: it
 * asks the Worker, which only trusts Paystack's verify endpoint.
 */
export default async function PaidPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string }>;
}) {
  const { slug } = await params;
  const { reference } = await searchParams;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  if (!(await currentAttendee(camp.id))) redirect(`/camps/${camp.slug}`);
  if (!reference || !/^CAMP-[0-9A-F]{16}$/.test(reference)) redirect(`/camps/${camp.slug}/me`);
  const images = {
    name: camp.name,
    venue: camp.venue,
    logo_url: camp.logo_url,
    banner_url: camp.banner_url,
    banner_credit: camp.banner_credit,
    venue_photo_url: camp.venue_photo_url,
    venue_photo_credit: camp.venue_photo_credit,
  };
  return <Processing slug={camp.slug} reference={reference} camp={images} daysToCamp={daysUntil(camp.starts_on)} />;
}
