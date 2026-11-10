import { redirect } from "next/navigation";

/** The payments check lives on Money. */
export default async function ReconcileMoved({ params }: { params: Promise<{ campId: string }> }) {
  redirect(`/admin/camp/${(await params).campId}/money`);
}
