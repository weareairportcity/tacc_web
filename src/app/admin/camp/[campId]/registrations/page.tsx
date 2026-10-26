import { redirect } from "next/navigation";

/** People is one page for coordinators and leaders now. Filters carry over. */
export default async function RegistrationsMoved({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ campId }, query] = await Promise.all([params, searchParams]);
  const text = new URLSearchParams(query).toString();
  redirect(`/admin/camp/${campId}/people${text ? `?${text}` : ""}`);
}
