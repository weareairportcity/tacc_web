import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServiceById, getServices } from "@/lib/services-db";
import ServicePlaylist from "./ServicePlaylist";

// Static, refreshed at most every minute (and straight away when an admin saves).
// Live and sung marks between refreshes come from the polled live feed.
export const revalidate = 60;

export async function generateStaticParams() {
  return (await getServices(true)).map((service) => ({ id: service.id }));
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const service = await getServiceById((await params).id);
  if (!service) return {};
  return {
    title: `${service.title} — Live Service Playlist`,
    openGraph: service.cover_image_url ? { images: [service.cover_image_url] } : undefined,
  };
}

export default async function ServicePage({ params }: Props) {
  const service = await getServiceById((await params).id);
  if (!service || !service.is_published) redirect("/song-of-the-week#services");
  return <ServicePlaylist service={service} />;
}
