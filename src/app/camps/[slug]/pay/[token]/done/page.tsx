import { notFound } from "next/navigation";
import { getCampBySlug } from "@/lib/camp/camps";
import { getRegistration } from "@/lib/camp/registrations";
import { readToken } from "@/lib/camp/tokens";
import { LinkPaid } from "./LinkPaid";

/** Where Paystack sends someone back after paying through a pay link. */
export default async function LinkDone({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const [{ slug, token }, q] = await Promise.all([params, searchParams]);
  const camp = await getCampBySlug(slug);
  const id = readToken("pay", token);
  const reg = camp && id ? await getRegistration(id) : null;
  if (!camp || !reg || reg.camp_id !== camp.id) notFound();
  return <LinkPaid slug={camp.slug} token={token} reference={String(q.reference ?? q.trxref ?? "")} first={reg.full_name.split(" ")[0]} />;
}
