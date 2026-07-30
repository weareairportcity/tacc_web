"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Music, Play, Pause, Volume2, VolumeX, ArrowLeft, ExternalLink } from "lucide-react";

type Song = {
  id: string;
  created_at?: string;
  week_label: string;
  publish_date: string;
  title: string;
  artist: string;
  lyrics: string;
  audio_url?: string;
  cover_image_url?: string;
  is_published: boolean;
};

type SongDetailViewProps = {
  song: Song;
  otherSongs: Song[];
};

// Fallback covers matching the brand blue
const COVERS = [
  "linear-gradient(135deg, rgba(60, 194, 207, 0.18) 0%, rgba(60, 194, 207, 0.06) 100%)",
  "linear-gradient(135deg, rgba(60, 194, 207, 0.12) 0%, rgba(96, 165, 250, 0.12) 100%)",
  "linear-gradient(135deg, rgba(60, 194, 207, 0.15) 0%, rgba(242, 242, 242, 0.6) 100%)",
];

import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { trackSongEvent } from "@/lib/analytics-client";

export default function SongDetailView({ song, otherSongs }: SongDetailViewProps) {
  const {
    currentTrack,
    isPlaying: isGlobalPlaying,
    currentTime: globalCurrentTime,
    duration: globalDuration,
    volume: globalVolume,
    isMuted: isGlobalMuted,
    playTrack,
    togglePlayPause,
    seek,
    setVolume,
    toggleMute,
  } = useAudioPlayer();

  useEffect(() => {
    if (song?.id) {
      trackSongEvent(song.id, "view");
    }
  }, [song?.id]);

  const isCurrentSong = currentTrack?.id === song.id;
  const isPlaying = isCurrentSong && isGlobalPlaying;
  const currentTime = isCurrentSong ? globalCurrentTime : 0;
  const duration = isCurrentSong ? globalDuration : 0;
  const volume = globalVolume;
  const isMuted = isGlobalMuted;

  const handlePlayClick = () => {
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

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isCurrentSong) {
      seek(parseFloat(e.target.value));
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Parse lyrics text into headings and body text segments
  const parseLyrics = (lyricsText: string) => {
    if (!lyricsText) return [];
    
    const blocks = lyricsText.split(/\n\s*\n/);
    
    return blocks.map((block) => {
      const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
      let heading = "";
      let bodyLines = [...lines];

      if (lines[0] && (lines[0].startsWith("[") && lines[0].endsWith("]"))) {
        heading = lines[0].substring(1, lines[0].length - 1);
        bodyLines = lines.slice(1);
      } else if (lines[0] && (lines[0].endsWith(":") && lines[0].length < 20)) {
        heading = lines[0].substring(0, lines[0].length - 1);
        bodyLines = lines.slice(1);
      }

      return {
        heading,
        lines: bodyLines,
      };
    });
  };

  const lyricSections = parseLyrics(song.lyrics);
  const formattedPublishDate = new Date(song.publish_date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });

  return (
    <div className="min-h-screen bg-paper font-euclid-circular-a text-ink-black antialiased flex flex-col relative selection:bg-brand-blue selection:text-white">
      


      {/* Sticky Header Nav */}
      <header className="sticky top-0 z-40 bg-snow rounded-b-[10px] border-b border-hairline shadow-subtle px-4 sm:px-6 h-[64px] flex items-center justify-between">
        <div className="max-w-[1200px] mx-auto w-full flex items-center justify-between gap-4">
          <Link href="/song-of-the-week" className="flex items-center gap-2">
            <Image 
              src="/logo.png" 
              alt="Airport City Church Logo" 
              width={100} 
              height={32} 
              className="object-contain" 
            />
          </Link>
          <div className="flex items-center gap-6 text-xs sm:text-sm font-semibold">
            <Link href="/song-of-the-week" className="hover:text-brand-blue transition-colors flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Catalog
            </Link>
          </div>
        </div>
      </header>

      {/* Main Details Panel */}
      <main className="flex-grow max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-12 md:py-16 flex flex-col gap-10">
        
        {/* Editorial Heading Section */}
        <div className="border-b border-hairline pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ash-gray">
              <span className="text-brand-blue">{song.week_label}</span>
              <span className="h-3 w-[1px] bg-hairline" />
              <span>Published {formattedPublishDate}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-[-1.08px] text-ink-black uppercase mt-1">
              {song.title}
            </h1>
          </div>
          
          {song.audio_url && (
            <a 
              href={song.audio_url}
              download
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-snow border border-hairline rounded-buttons text-xs font-bold hover:border-graphite shadow-subtle transition-all"
            >
              <span>Download MP3</span>
              <ExternalLink className="w-3 h-3 text-graphite" />
            </a>
          )}
        </div>

        {/* Responsive Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* LEFT Column: Cover Art and Interactive Custom Audio Player */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-[88px]">
            
            {/* Cover Frame (10px card radius, 16px image radius) */}
            <div className="bg-snow rounded-cards p-4 border border-hairline shadow-subtle-4">
              <div className="relative w-full aspect-square rounded-logo-cards overflow-hidden bg-fog border border-hairline flex items-center justify-center shadow-sm">
                {song.cover_image_url ? (
                  <img 
                    src={song.cover_image_url} 
                    alt={song.title} 
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div 
                    className="w-full h-full flex flex-col items-center justify-center p-4 text-ink-black"
                    style={{ background: COVERS[parseInt(song.id.replace(/\D/g, "") || "0") % COVERS.length] }}
                  >
                    <Music className="w-12 h-12 text-slate-ink stroke-[1.5]" />
                  </div>
                )}
              </div>
            </div>

            {/* Song Meta Information */}
            <div className="bg-snow rounded-cards p-5 border border-hairline shadow-subtle-4 space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-[-0.48px] text-ink-black uppercase leading-tight">
                  {song.title}
                </h2>
                <p className="text-xs text-graphite font-semibold mt-1">
                  Artiste: {song.artist}
                </p>
              </div>

              {/* Audio Controls */}
              {song.audio_url ? (
                <div className="space-y-4">
                  
                  {/* Seeker Input Timeline */}
                  <div className="space-y-2">
                    <input 
                      type="range"
                      min={0}
                      max={duration || 100}
                      value={currentTime}
                      onChange={handleSeek}
                      className="w-full h-1 bg-fog rounded-full appearance-none cursor-pointer accent-brand-blue focus:outline-none"
                      style={{
                        background: `linear-gradient(to right, #3cc2cf 0%, #3cc2cf ${(currentTime / (duration || 1)) * 100}%, #dee0e3 ${(currentTime / (duration || 1)) * 100}%, #dee0e3 100%)`
                      }}
                    />
                    <div className="flex justify-between text-[11px] font-bold text-ash-gray">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Play circle and Volume scrubber */}
                  <div className="flex items-center justify-between gap-4 pt-1">
                    {/* Brand Blue brand action circle */}
                    <button 
                      onClick={handlePlayClick}
                      className="w-12 h-12 rounded-full bg-brand-blue text-white border border-brand-blue hover:opacity-90 active:scale-95 shadow-subtle flex items-center justify-center transition-all"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-current stroke-[1.5]" />
                      ) : (
                        <Play className="w-5 h-5 fill-current stroke-[1.5] translate-x-0.5" />
                      )}
                    </button>

                    {/* Mute and volume slider in Snow Card */}
                    <div className="flex items-center gap-2 bg-fog border border-hairline px-3 py-1.5 rounded-[10px] flex-grow max-w-[180px]">
                      <button onClick={toggleMute} className="text-graphite hover:text-ink-black transition-colors">
                        {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                      <input 
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-full h-1 bg-hairline rounded-full appearance-none cursor-pointer accent-brand-blue focus:outline-none"
                        style={{
                          background: `linear-gradient(to right, #3cc2cf 0%, #3cc2cf ${(isMuted ? 0 : volume) * 100}%, #dee0e3 ${(isMuted ? 0 : volume) * 100}%, #dee0e3 100%)`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-fog rounded-cards border border-hairline text-xs text-graphite flex items-center gap-2">
                  <Music className="w-4 h-4 text-ash-gray" />
                  <span>No audio file linked. Read the official lyrics below.</span>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT Column: Lyrics Container */}
          <div className="lg:col-span-7 bg-snow rounded-cards p-6 sm:p-10 border border-hairline shadow-subtle-4">
            <h2 className="text-lg sm:text-xl font-bold tracking-[-0.32px] text-ink-black uppercase border-b border-hairline pb-3 mb-6">
              Lyrics
            </h2>

            {lyricSections.length === 0 ? (
              <p className="text-graphite text-sm italic">Lyrics not available.</p>
            ) : (
              <div className="space-y-6">
                {lyricSections.map((section, idx) => {
                  // Highlights lyrics sections in Brand Blue
                  const headingColor = "text-brand-blue";
                  
                  return (
                    <div key={idx} className="space-y-2.5">
                      {section.heading && (
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider ${headingColor}`}>
                          {section.heading}
                        </h3>
                      )}
                      <div className="space-y-1">
                        {section.lines.map((line, lidx) => (
                          <p key={lidx} className="text-sm sm:text-base tracking-[-0.11px] text-ink-black leading-relaxed font-medium">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Listen to More Row */}
        {otherSongs.length > 0 && (
          <div className="border-t border-hairline pt-12 mt-4">
            <h3 className="text-base sm:text-lg font-bold tracking-[-0.32px] text-ink-black uppercase mb-6">
              Explore More Hymns
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {otherSongs.map((otherSong, oidx) => (
                <Link 
                  key={otherSong.id} 
                  href={`/song-of-the-week/${otherSong.id}`}
                  className="group flex gap-3 bg-snow rounded-[10px] p-3 border border-hairline shadow-subtle hover:border-graphite hover:shadow-subtle-3 transition-all duration-200"
                >
                  {/* Small Cover Frame */}
                  <div className="relative w-12 h-12 rounded-[8px] overflow-hidden bg-fog border border-hairline flex items-center justify-center flex-shrink-0">
                    {otherSong.cover_image_url ? (
                      <img 
                        src={otherSong.cover_image_url} 
                        alt={otherSong.title} 
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div 
                        className="w-full h-full flex items-center justify-center text-ink-black"
                        style={{ background: COVERS[oidx % COVERS.length] }}
                      >
                        <Music className="w-4 h-4 text-slate-ink" />
                      </div>
                    )}
                  </div>
                  
                  {/* Details */}
                  <div className="min-w-0 flex-grow flex flex-col justify-center">
                    <span className="text-[9px] font-bold text-brand-blue uppercase tracking-wider block">
                      {otherSong.week_label}
                    </span>
                    <h4 className="text-xs font-bold text-ink-black uppercase group-hover:text-brand-blue transition-colors truncate mt-0.5">
                      {otherSong.title}
                    </h4>
                    <p className="text-[10px] text-graphite truncate mt-0.5">
                      by {otherSong.artist}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-obsidian text-ash-gray border-t border-hairline py-10 px-6 mt-16">
        <div className="max-w-[1200px] mx-auto w-full flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col items-center md:items-start gap-1.5">
            <Image 
              src="/logo.png" 
              alt="TACC Logo" 
              width={90} 
              height={26} 
              className="object-contain brightness-0 invert" 
            />
            <p className="text-[9px] text-ash-gray">© {new Date().getFullYear()} The Airport City Church. All rights reserved.</p>
          </div>
          <div className="flex gap-4 text-[11px] text-ash-gray font-semibold">
            <Link href="/" className="hover:text-snow transition-colors">Home</Link>
            <Link href="/timewithpastor" className="hover:text-snow transition-colors">Bookings</Link>
            <Link href="/song-of-the-week" className="hover:text-snow transition-colors">Songs Portal</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
