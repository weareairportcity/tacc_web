import { redirect } from "next/navigation";

/** A person opens in a side panel over People. */
export default async function PersonMoved({ params }: { params: Promise<{ campId: string; registrationId: string }> }) {
  const { campId, registrationId } = await params;
  redirect(`/admin/camp/${campId}/people?person=${registrationId}`);
}
