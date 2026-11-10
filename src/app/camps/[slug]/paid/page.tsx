import { notFound, redirect } from "next/navigation";
import { daysUntil } from "@/lib/camp/registrations";
import { campAndAttendee } from "@/lib/camp/session";
import { Processing } from "./Processing";

/**
 * Where expressPay sends the attendee back (?order-id=…&token=…), and where
 * MoMo from Commune lands (?reference=…). It never marks anything paid: it
 * asks the Worker, which only trusts expressPay's query endpoint.
 */
export default async function PaidPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string; "order-id"?: string }>;
}) {
  const { slug } = await params;
  const q = await searchParams;
  const reference = q.reference ?? q["order-id"];
  const { camp, me } = await campAndAttendee(slug);
  if (!camp) notFound();
  if (!me) redirect(`/camps/${camp.slug}`);
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
