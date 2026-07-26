import { getSongById, getSongs } from "@/lib/songs-db";
import { notFound } from "next/navigation";
import SongDetailView from "./SongDetailView";

export const revalidate = 0; // Fetch fresh data on load

type Props = {
  params: Promise<{ id: string }> | { id: string };
};

export default async function SongDetailPage({ params }: Props) {
  // Await the params if it is a Promise (Next.js 15+ structure)
  const resolvedParams = await params;
  const { id } = resolvedParams;

  const song = await getSongById(id);

  if (!song || !song.is_published) {
    notFound();
  }

  // Get all published songs for the carousel
  const allSongs = await getSongs(true);
  
  // Filter out the current song from the "Listen to more" carousel
  const otherSongs = allSongs.filter((s) => s.id !== id).slice(0, 3);

  return <SongDetailView song={song} otherSongs={otherSongs} />;
}
