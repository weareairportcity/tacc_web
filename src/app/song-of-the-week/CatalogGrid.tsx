"use client";

import Link from "next/link";
import { Music, Play, Pause, ExternalLink } from "lucide-react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";

type Song = {
  id: string;
  week_label: string;
  publish_date: string;
  title: string;
  artist: string;
  audio_url?: string;
  cover_image_url?: string;
};

export default function CatalogGrid({ songs }: { songs: Song[] }) {
  const { currentTrack, isPlaying, playTrack } = useAudioPlayer();

  if (songs.length === 0) {
    return (
      <div className="text-center py-16 bg-[#ffffff] rounded-[10px] border border-[#e8e6e5] shadow-[0_4px_16px_rgba(0,0,0,0.05)] flex flex-col items-center">
        <div className="w-12 h-12 rounded-full bg-[#fafaf9] flex items-center justify-center mb-3 text-[#78716c] border border-[#e8e6e5]">
          <Music className="w-5 h-5" />
        </div>
        <h3 className="font-roobert font-normal text-[#0c0a09] text-base">No hymns published yet</h3>
        <p className="text-xs text-[#a8a29e] mt-1 font-normal">Check back soon for weekly song releases.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
      {songs.map((song) => {
        const isThisTrackPlaying = currentTrack?.id === song.id && isPlaying;

        const handlePlayClick = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (song.audio_url) {
            const formattedPlaylist = songs
              .filter((s) => s.audio_url)
              .map((s) => ({
                id: s.id,
                title: s.title,
                artist: s.artist,
                audioUrl: s.audio_url || "",
                coverImageUrl: s.cover_image_url,
                weekLabel: s.week_label,
              }));

            playTrack(
              {
                id: song.id,
                title: song.title,
                artist: song.artist,
                audioUrl: song.audio_url,
                coverImageUrl: song.cover_image_url,
                weekLabel: song.week_label,
              },
              formattedPlaylist
            );
          }
        };

        return (
          <div
            key={song.id}
            className="group bg-[#ffffff] rounded-[10px] p-[14px] border border-[#e8e6e5] shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:border-[#d6d3d1] transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              {/* Seline Studio Album Frame with Quick Play Overlay */}
              <div className="relative w-full aspect-square rounded-[8px] overflow-hidden mb-3 bg-[#fafaf9] border border-[#e8e6e5] flex-shrink-0 flex items-center justify-center group/cover">
                {song.cover_image_url ? (
                  <img
                    src={song.cover_image_url}
                    alt={song.title}
                    className="object-cover w-full h-full transition-transform duration-300 group-hover/cover:scale-[1.02]"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[#78716c] p-4">
                    <Music className="w-6 h-6 text-[#a8a29e] stroke-[1.5]" />
                  </div>
                )}

                <span className="absolute top-2 left-2 bg-[#ffffff]/90 backdrop-blur-sm border border-[#e8e6e5] text-[10px] font-medium tracking-wide px-2 py-0.5 rounded-full shadow-xs text-[#78716c] z-10">
                  {song.week_label}
                </span>

                {/* Direct Play Overlay Button */}
                {song.audio_url && (
                  <button
                    onClick={handlePlayClick}
                    className="absolute inset-0 bg-[#0c0a09]/30 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition-opacity duration-200"
                    title={isThisTrackPlaying ? "Pause Song" : "Play Song"}
                  >
                    <div className="w-11 h-11 rounded-full bg-[#3ba6f1] text-white shadow-lg flex items-center justify-center scale-95 group-hover/cover:scale-100 transition-transform">
                      {isThisTrackPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current translate-x-0.5" />
                      )}
                    </div>
                  </button>
                )}
              </div>

              {/* Song Details */}
              <Link href={`/song-of-the-week/${song.id}`} className="block group/title">
                <h3 className="text-sm font-roobert font-normal tracking-[-0.017em] text-[#0c0a09] leading-snug group-hover/title:text-[#3398e1] transition-colors truncate">
                  {song.title}
                </h3>
                <p className="text-xs text-[#78716c] truncate mt-0.5 font-normal">
                  {song.artist}
                </p>
              </Link>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#e8e6e5] flex items-center justify-between text-[11px] text-[#a8a29e] font-normal">
              <span>
                {new Date(song.publish_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </span>
              <Link
                href={`/song-of-the-week/${song.id}`}
                className="flex items-center gap-1 hover:text-[#0c0a09] transition-colors text-[#3398e1]"
              >
                Lyrics <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
