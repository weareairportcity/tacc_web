import { getSongById, getSongs } from "@/lib/songs-db";
import { notFound } from "next/navigation";
import SongDetailView from "./SongDetailView";

// Static, refreshed at most every minute (and straight away when an admin saves).
export const revalidate = 60;

// Published songs are built ahead of time; new ones are built on first visit.
export async function generateStaticParams() {
  return (await getSongs(true)).map((song) => ({ id: song.id }));
}

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
