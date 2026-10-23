import { notFound, redirect } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
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
  return <Processing slug={camp.slug} reference={reference} />;
}
