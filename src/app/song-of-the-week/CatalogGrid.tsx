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

const COVERS = [
  "linear-gradient(135deg, rgba(60, 194, 207, 0.18) 0%, rgba(60, 194, 207, 0.06) 100%)",
  "linear-gradient(135deg, rgba(60, 194, 207, 0.12) 0%, rgba(96, 165, 250, 0.12) 100%)",
  "linear-gradient(135deg, rgba(60, 194, 207, 0.15) 0%, rgba(242, 242, 242, 0.6) 100%)",
];

import { useEffect } from "react";
import { trackSongEvent } from "@/lib/analytics-client";

export default function CatalogGrid({ songs }: { songs: Song[] }) {
  const { currentTrack, isPlaying, playTrack } = useAudioPlayer();

  useEffect(() => {
    if (songs && songs.length > 0) {
      songs.forEach((s) => {
        trackSongEvent(s.id, "view");
      });
    }
  }, [songs]);

  if (songs.length === 0) {
    return (
      <div className="text-center py-16 bg-snow rounded-[10px] border border-hairline shadow-subtle flex flex-col items-center">
        <div className="w-12 h-12 rounded-full bg-fog flex items-center justify-center mb-3 text-graphite border border-hairline">
          <Music className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-ink-black text-sm">No hymns published</h3>
        <p className="text-xs text-ash-gray mt-1">Please ask your church admin to add weekly songs.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
      {songs.map((song, idx) => {
        const coverStyle = COVERS[idx % COVERS.length];
        const isThisTrackPlaying = currentTrack?.id === song.id && isPlaying;

        const handlePlayClick = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (song.audio_url) {
            playTrack({
              id: song.id,
              title: song.title,
              artist: song.artist,
              audioUrl: song.audio_url,
              coverImageUrl: song.cover_image_url,
              weekLabel: song.week_label,
            });
          }
        };

        return (
          <div
            key={song.id}
            className="group bg-snow rounded-[10px] p-[16px] border border-hairline shadow-subtle-4 hover:border-graphite hover:shadow-subtle-3 transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              {/* Preview Image Frame with Quick Play Overlay */}
              <div className="relative w-full aspect-square rounded-logo-cards overflow-hidden mb-4 bg-fog border border-hairline flex-shrink-0 flex items-center justify-center group/cover">
                {song.cover_image_url ? (
                  <img
                    src={song.cover_image_url}
                    alt={song.title}
                    className="object-cover w-full h-full transition-transform duration-300 group-hover/cover:scale-[1.02]"
                  />
                ) : (
                  <div
                    className="w-full h-full flex flex-col items-center justify-center text-ink-black p-4"
                    style={{ background: coverStyle }}
                  >
                    <Music className="w-6 h-6 text-slate-ink stroke-[1.5]" />
                  </div>
                )}

                <span className="absolute top-2 left-2 bg-snow/90 backdrop-blur-sm border border-hairline text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm text-slate-ink z-10">
                  {song.week_label}
                </span>

                {/* Direct Play Overlay Button */}
                {song.audio_url && (
                  <button
                    onClick={handlePlayClick}
                    className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition-opacity duration-200"
                    title={isThisTrackPlaying ? "Pause Song" : "Play Song"}
                  >
                    <div className="w-12 h-12 rounded-full bg-brand-blue text-white shadow-xl flex items-center justify-center scale-90 group-hover/cover:scale-100 transition-transform">
                      {isThisTrackPlaying ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current translate-x-0.5" />
                      )}
                    </div>
                  </button>
                )}
              </div>

              {/* Song Details */}
              <Link href={`/song-of-the-week/${song.id}`} className="block group/title">
                <h3 className="text-sm font-bold tracking-tight text-ink-black uppercase leading-tight group-hover/title:text-brand-blue transition-colors truncate">
                  {song.title}
                </h3>
                <p className="text-xs text-graphite truncate mt-1">
                  by {song.artist}
                </p>
              </Link>
            </div>

            <div className="mt-4 pt-3 border-t border-hairline/60 flex items-center justify-between text-[11px] text-ash-gray font-semibold">
              <span>
                {new Date(song.publish_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </span>
              <Link
                href={`/song-of-the-week/${song.id}`}
                className="flex items-center gap-0.5 hover:text-ink-black transition-colors"
              >
                View Lyrics <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
