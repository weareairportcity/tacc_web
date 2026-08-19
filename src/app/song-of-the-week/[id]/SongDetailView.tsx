"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { 
  Music, Play, Pause, Volume2, VolumeX, ArrowLeft, ExternalLink,
  Repeat, Repeat1, Shuffle, SkipBack, SkipForward 
} from "lucide-react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { trackSongEvent } from "@/lib/analytics-client";

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

export default function SongDetailView({ song, otherSongs }: SongDetailViewProps) {
  const {
    currentTrack,
    isPlaying: isGlobalPlaying,
    currentTime: globalCurrentTime,
    duration: globalDuration,
    volume: globalVolume,
    isMuted: isGlobalMuted,
    repeatMode,
    isShuffle,
    playTrack,
    seek,
    setVolume,
    toggleMute,
    toggleRepeatMode,
    toggleShuffle,
    playNextTrack,
    playPreviousTrack,
    setPlaylist,
  } = useAudioPlayer();

  const allSongsList = [song, ...otherSongs];

  useEffect(() => {
    if (song?.id) {
      trackSongEvent(song.id, "view");
    }

    // Populate context playlist with current song and all other weekly songs in order
    const formattedPlaylist = allSongsList
      .filter((s) => s.audio_url)
      .map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        audioUrl: s.audio_url || "",
        coverImageUrl: s.cover_image_url,
        weekLabel: s.week_label,
      }));

    setPlaylist(formattedPlaylist);
  }, [song?.id]);

  const isCurrentSong = currentTrack?.id === song.id;
  const isPlaying = isCurrentSong && isGlobalPlaying;
  const currentTime = isCurrentSong ? globalCurrentTime : 0;
  const duration = isCurrentSong ? globalDuration : 0;
  const volume = globalVolume;
  const isMuted = isGlobalMuted;

  const handlePlayClick = () => {
    if (song.audio_url) {
      const formattedPlaylist = allSongsList
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
    const secs = Math.floor(time % 60);
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
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
      } else if (lines[0] && (lines[0].endsWith(":") || lines[0].length < 20) && (lines[0].toLowerCase().includes("verse") || lines[0].toLowerCase().includes("chorus") || lines[0].toLowerCase().includes("bridge") || lines[0].toLowerCase().includes("outro") || lines[0].toLowerCase().includes("refrain") || lines[0].toLowerCase().includes("pre-chorus"))) {
        heading = lines[0].replace(":", "").trim();
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
    <div className="min-h-screen bg-[#fafaf9] font-inter text-[#0c0a09] antialiased flex flex-col relative selection:bg-[#c1e1f7] selection:text-[#0c0a09]">
      
      {/* Seline Minimal Top Nav Header */}
      <header className="sticky top-0 z-40 bg-[#ffffff] border-b border-[#e8e6e5] shadow-[0_1px_2px_rgba(0,0,0,0.05)] px-4 sm:px-6 h-[64px] flex items-center justify-between">
        <div className="max-w-[1200px] mx-auto w-full flex items-center justify-between gap-4">
          <Link href="/song-of-the-week" className="flex items-center gap-3">
            <Image 
              src="/logo.png" 
              alt="Airport City Church Logo" 
              width={105} 
              height={34} 
              className="object-contain" 
            />
            <span className="h-4 w-[1px] bg-[#e8e6e5]" />
            <span className="text-xs font-medium text-[#78716c] font-roobert tracking-tight">Hymns & Lyrics</span>
          </Link>

          <div className="flex items-center gap-4 text-xs font-normal">
            <Link href="/song-of-the-week" className="text-[#78716c] hover:text-[#0c0a09] transition-colors flex items-center gap-1.5 py-1 px-3 rounded-full hover:bg-[#fafaf9] border border-transparent hover:border-[#e8e6e5]">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Catalog
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-10 md:py-14 flex flex-col gap-10">
        
        {/* Seline Editorial Headline Block */}
        <div className="border-b border-[#e8e6e5] pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[#78716c] tracking-normal mb-2">
              <span className="text-[#3398e1] font-medium bg-[#c1e1f7]/50 px-2 py-0.5 rounded-full text-[11px]">{song.week_label}</span>
              <span className="h-3 w-[1px] bg-[#e8e6e5]" />
              <span>Published {formattedPublishDate}</span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-roobert font-normal tracking-[-0.025em] text-[#0c0a09] leading-tight">
              {song.title}
            </h1>
          </div>
          
          {song.audio_url && (
            <a 
              href={song.audio_url}
              download
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#3ba6f1] text-white border border-[#3398e1] rounded-full text-xs font-medium hover:bg-[#3398e1] shadow-sm transition-all"
            >
              <span>Download MP3</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-90" />
            </a>
          )}
        </div>

        {/* 2-Column Seline Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* LEFT COLUMN: Floating Studio Cover Art & Audio Player Card */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-[88px]">
            
            {/* Seline Floating Hero Preview Frame */}
            <div className="bg-[#ffffff] rounded-[16px] p-2 border border-[#e8e6e5] shadow-[0_12px_45px_rgba(17,12,46,0.12)]">
              <div className="relative w-full aspect-square rounded-[12px] overflow-hidden bg-[#fafaf9] border border-[#e8e6e5] flex items-center justify-center">
                {song.cover_image_url ? (
                  <img 
                    src={song.cover_image_url} 
                    alt={song.title} 
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 text-[#78716c] bg-[#fafaf9]">
                    <Music className="w-12 h-12 text-[#a8a29e] stroke-[1.5]" />
                  </div>
                )}
              </div>
            </div>

            {/* Seline Audio Player Card */}
            <div className="bg-[#ffffff] rounded-[10px] p-5 border border-[#e8e6e5] shadow-[0_4px_16px_rgba(0,0,0,0.05)] space-y-5">
              <div>
                <h2 className="text-xl font-roobert font-normal tracking-[-0.021em] text-[#0c0a09] leading-snug">
                  {song.title}
                </h2>
                <p className="text-xs text-[#78716c] font-normal mt-1">
                  Artiste: <span className="text-[#0c0a09]">{song.artist}</span>
                </p>
              </div>

              {/* Audio Controls */}
              {song.audio_url ? (
                <div className="space-y-4">
                  
                  {/* Timeline Scrubber */}
                  <div className="space-y-1.5">
                    <input 
                      type="range"
                      min={0}
                      max={duration || 100}
                      value={currentTime}
                      onChange={handleSeek}
                      className="w-full h-1 bg-[#e8e6e5] rounded-full appearance-none cursor-pointer accent-[#3ba6f1] focus:outline-none"
                      style={{
                        background: `linear-gradient(to right, #3ba6f1 0%, #3ba6f1 ${(currentTime / (duration || 1)) * 100}%, #e8e6e5 ${(currentTime / (duration || 1)) * 100}%, #e8e6e5 100%)`
                      }}
                    />
                    <div className="flex justify-between text-[11px] font-normal text-[#a8a29e]">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Extended Controls: Shuffle, Prev, Play, Next, Repeat */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    
                    {/* Shuffle Toggle */}
                    <button
                      onClick={toggleShuffle}
                      className={`p-2 rounded-full transition-colors ${
                        isShuffle 
                          ? "text-[#3ba6f1] bg-[#c1e1f7]/40" 
                          : "text-[#78716c] hover:text-[#0c0a09] hover:bg-[#fafaf9]"
                      }`}
                      title={isShuffle ? "Shuffle On" : "Shuffle Off"}
                    >
                      <Shuffle className="w-4 h-4" />
                    </button>

                    {/* Previous Track */}
                    <button
                      onClick={playPreviousTrack}
                      className="p-2 text-[#78716c] hover:text-[#0c0a09] hover:bg-[#fafaf9] rounded-full transition-colors"
                      title="Previous Track"
                    >
                      <SkipBack className="w-4.5 h-4.5 fill-current" />
                    </button>

                    {/* Primary Play/Pause Button */}
                    <button 
                      onClick={handlePlayClick}
                      className="w-11 h-11 rounded-full bg-[#3ba6f1] text-white border border-[#3398e1] hover:bg-[#3398e1] active:scale-95 shadow-sm flex items-center justify-center transition-all"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current stroke-[1.5]" />
                      ) : (
                        <Play className="w-4 h-4 fill-current stroke-[1.5] translate-x-0.5" />
                      )}
                    </button>

                    {/* Next Track */}
                    <button
                      onClick={playNextTrack}
                      className="p-2 text-[#78716c] hover:text-[#0c0a09] hover:bg-[#fafaf9] rounded-full transition-colors"
                      title="Next Track"
                    >
                      <SkipForward className="w-4.5 h-4.5 fill-current" />
                    </button>

                    {/* Repeat Mode Toggle (Single [Default], All, Off) */}
                    <button
                      onClick={toggleRepeatMode}
                      className={`p-2 rounded-full transition-colors ${
                        repeatMode !== "off" 
                          ? "text-[#3ba6f1] bg-[#c1e1f7]/40" 
                          : "text-[#78716c] hover:text-[#0c0a09] hover:bg-[#fafaf9]"
                      }`}
                      title={
                        repeatMode === "single" 
                          ? "Repeat Single (Active)" 
                          : repeatMode === "all" 
                          ? "Repeat All Weeks (Active)" 
                          : "Repeat Off"
                      }
                    >
                      {repeatMode === "single" ? (
                        <Repeat1 className="w-4 h-4" />
                      ) : (
                        <Repeat className="w-4 h-4" />
                      )}
                    </button>

                  </div>

                  {/* Volume Control */}
                  <div className="flex items-center gap-2 bg-[#fafaf9] border border-[#e8e6e5] px-3 py-1.5 rounded-full w-full mt-2">
                    <button onClick={toggleMute} className="text-[#78716c] hover:text-[#0c0a09] transition-colors">
                      {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <input 
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-full h-1 bg-[#e8e6e5] rounded-full appearance-none cursor-pointer accent-[#3ba6f1] focus:outline-none"
                      style={{
                        background: `linear-gradient(to right, #3ba6f1 0%, #3ba6f1 ${(isMuted ? 0 : volume) * 100}%, #e8e6e5 ${(isMuted ? 0 : volume) * 100}%, #e8e6e5 100%)`
                      }}
                    />
                  </div>

                </div>
              ) : (
                <div className="p-3 bg-[#fafaf9] rounded-[8px] border border-[#e8e6e5] text-xs text-[#78716c] flex items-center gap-2">
                  <Music className="w-4 h-4 text-[#a8a29e]" />
                  <span>No audio track attached.</span>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN: Seline Pure White Lyrics Card */}
          <div className="lg:col-span-7 bg-[#ffffff] rounded-[10px] p-6 sm:p-10 border border-[#e8e6e5] shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-[#e8e6e5] pb-4 mb-8">
              <h2 className="text-xl font-roobert font-normal tracking-[-0.021em] text-[#0c0a09]">
                Official Lyrics
              </h2>
              <span className="text-xs text-[#78716c] font-normal">SOTW Edition</span>
            </div>

            {lyricSections.length === 0 ? (
              <p className="text-[#78716c] text-sm italic">Lyrics not available.</p>
            ) : (
              <div className="space-y-7">
                {lyricSections.map((section, idx) => (
                  <div key={idx} className="space-y-2">
                    {section.heading && (
                      <h3 className="text-[11px] font-medium uppercase tracking-wider text-[#3398e1]">
                        {section.heading}
                      </h3>
                    )}
                    <div className="space-y-1.5">
                      {section.lines.map((line, lidx) => (
                        <p key={lidx} className="text-sm sm:text-[15px] text-[#0c0a09] leading-[1.64] font-normal">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Explore More Hymns */}
        {otherSongs.length > 0 && (
          <div className="border-t border-[#e8e6e5] pt-10 mt-4">
            <h3 className="text-lg font-roobert font-normal tracking-[-0.017em] text-[#0c0a09] mb-5">
              Explore More Hymns
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {otherSongs.map((otherSong) => (
                <Link 
                  key={otherSong.id} 
                  href={`/song-of-the-week/${otherSong.id}`}
                  className="group flex gap-3 bg-[#ffffff] rounded-[10px] p-3 border border-[#e8e6e5] shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:border-[#d6d3d1] transition-all duration-200"
                >
                  <div className="relative w-12 h-12 rounded-[6px] overflow-hidden bg-[#fafaf9] border border-[#e8e6e5] flex-shrink-0 flex items-center justify-center">
                    {otherSong.cover_image_url ? (
                      <img 
                        src={otherSong.cover_image_url} 
                        alt={otherSong.title} 
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <Music className="w-4 h-4 text-[#a8a29e]" />
                    )}
                  </div>
                  
                  <div className="min-w-0 flex-grow flex flex-col justify-center">
                    <span className="text-[10px] font-normal text-[#3398e1] uppercase tracking-wide block">
                      {otherSong.week_label}
                    </span>
                    <h4 className="text-xs font-medium text-[#0c0a09] font-roobert group-hover:text-[#3398e1] transition-colors truncate mt-0.5">
                      {otherSong.title}
                    </h4>
                    <p className="text-[11px] text-[#78716c] truncate mt-0.5">
                      {otherSong.artist}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* Seline Minimal Footer */}
      <footer className="bg-[#ffffff] text-[#78716c] border-t border-[#e8e6e5] py-8 px-6 mt-16">
        <div className="max-w-[1200px] mx-auto w-full flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-normal">
          <div className="flex flex-col items-center md:items-start gap-1">
            <Image 
              src="/logo.png" 
              alt="TACC Logo" 
              width={90} 
              height={26} 
              className="object-contain opacity-80" 
            />
            <p className="text-[11px] text-[#a8a29e]">© {new Date().getFullYear()} The Airport City Church</p>
          </div>
          <div className="flex gap-4 text-xs text-[#78716c]">
            <Link href="/" className="hover:text-[#0c0a09] transition-colors">Home</Link>
            <Link href="/timewithpastor" className="hover:text-[#0c0a09] transition-colors">Bookings</Link>
            <Link href="/song-of-the-week" className="hover:text-[#0c0a09] transition-colors">Songs Portal</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
