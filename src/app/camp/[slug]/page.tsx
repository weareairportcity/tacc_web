import { getCampBySlug } from "../../camp/actions";
import { CampSearchPortal } from "../../camp/CampSearchPortal";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CampSlugPage({ params }: Props) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  return <CampSearchPortal camp={camp} />;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  return {
    title: camp ? `${camp.name} — Room Portal` : "Camp Portal",
    description: camp ? `Find your room assignment for ${camp.name}` : "Camp room assignment portal",
  };
}
