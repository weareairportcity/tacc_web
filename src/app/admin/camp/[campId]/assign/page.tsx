import { redirect } from "next/navigation";

/** Assigning now lives on Rooms. */
export default async function AssignMoved({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<{ pool?: string }> }) {
  const [{ campId }, { pool }] = await Promise.all([params, searchParams]);
  redirect(`/admin/camp/${campId}/rooms?tab=assign${pool ? `&pool=${encodeURIComponent(pool)}` : ""}`);
}
