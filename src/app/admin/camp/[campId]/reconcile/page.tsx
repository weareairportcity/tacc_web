import { redirect } from "next/navigation";

/** The Paystack check now lives on Money. */
export default async function ReconcileMoved({ params }: { params: Promise<{ campId: string }> }) {
  redirect(`/admin/camp/${(await params).campId}/money`);
}
