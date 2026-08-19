"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, X, Music, ChevronDown } from "lucide-react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";

export default function GlobalAudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    togglePlayPause,
    seek,
    setVolume,
    toggleMute,
    closePlayer,
  } = useAudioPlayer();

  const [isMinimized, setIsMinimized] = useState(false);

  if (!currentTrack) return null;

  const formatTime = (time: number) => {
    if (isNaN(time) || time < 0) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(parseFloat(e.target.value));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  const skipSeconds = (secs: number) => {
    seek(Math.min(Math.max(currentTime + secs, 0), duration));
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-3 sm:px-6 pb-3 pt-0 pointer-events-none transition-all duration-300">
      <div className="max-w-[1200px] mx-auto pointer-events-auto">
        
        {/* Seline Soot Dark Player Bar */}
        <div className="bg-[#1c1917] text-white border border-[#2c2825] rounded-[16px] shadow-[0_12px_45px_rgba(0,0,0,0.3)] overflow-hidden transition-all duration-300">
          
          {/* Top Progress Bar */}
          <div className="relative w-full h-1 bg-[#2c2825] group cursor-pointer">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeekChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div
              className="h-full bg-[#3ba6f1] transition-all duration-100 relative"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Main Controls Row */}
          {!isMinimized && (
            <div className="p-3 sm:p-4 flex items-center justify-between gap-3 sm:gap-6">
              
              {/* Song Meta (Left) */}
              <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-initial">
                <Link
                  href={`/song-of-the-week/${currentTrack.id}`}
                  className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-[8px] overflow-hidden bg-[#2c2825] border border-[#3a3531] flex-shrink-0 group hover:opacity-90 transition-opacity"
                >
                  {currentTrack.coverImageUrl ? (
                    <img
                      src={currentTrack.coverImageUrl}
                      alt={currentTrack.title}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#2c2825] text-[#3ba6f1]">
                      <Music className="w-5 h-5" />
                    </div>
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {currentTrack.weekLabel && (
                      <span className="text-[9px] font-medium tracking-wide text-[#3ba6f1] bg-[#3ba6f1]/15 px-1.5 py-0.5 rounded-full">
                        {currentTrack.weekLabel}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/song-of-the-week/${currentTrack.id}`}
                    className="font-roobert font-normal text-xs sm:text-sm text-white truncate block hover:text-[#3ba6f1] transition-colors tracking-tight mt-0.5"
                  >
                    {currentTrack.title}
                  </Link>
                  <p className="text-[11px] text-[#a8a29e] truncate font-normal">
                    {currentTrack.artist}
                  </p>
                </div>
              </div>

              {/* Playback Controls (Center) */}
              <div className="flex items-center gap-2 sm:gap-4">
                <button
                  onClick={() => skipSeconds(-10)}
                  className="p-1.5 text-[#a8a29e] hover:text-white transition-colors hidden sm:block"
                  title="Rewind 10s"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  onClick={togglePlayPause}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#3ba6f1] text-white hover:bg-[#3398e1] active:scale-95 flex items-center justify-center shadow-sm transition-all"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current translate-x-0.5" />
                  )}
                </button>

                <button
                  onClick={() => skipSeconds(10)}
                  className="p-1.5 text-[#a8a29e] hover:text-white transition-colors hidden sm:block"
                  title="Forward 10s"
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                <div className="text-[11px] font-mono text-[#a8a29e] min-w-[70px] text-center hidden md:block">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>

              {/* Volume & Actions (Right) */}
              <div className="flex items-center gap-3">
                <div className="hidden lg:flex items-center gap-2 bg-[#2c2825] px-3 py-1.5 rounded-full border border-[#3a3531]">
                  <button
                    onClick={toggleMute}
                    className="text-[#a8a29e] hover:text-white transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 h-1 bg-[#3a3531] rounded-full appearance-none cursor-pointer accent-[#3ba6f1]"
                  />
                </div>

                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1.5 text-[#a8a29e] hover:text-white rounded-lg transition-colors"
                  title="Minimize"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>

                <button
                  onClick={closePlayer}
                  className="p-1.5 text-[#a8a29e] hover:text-red-400 rounded-lg transition-colors"
                  title="Close Player"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}

          {/* Minimized View */}
          {isMinimized && (
            <div className="p-2 sm:p-2.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={togglePlayPause}
                  className="w-8 h-8 rounded-full bg-[#3ba6f1] text-white flex items-center justify-center shrink-0"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />}
                </button>
                <span className="text-xs font-roobert font-normal text-white truncate">
                  {currentTrack.title} — <span className="text-[#a8a29e]">{currentTrack.artist}</span>
                </span>
              </div>

              <button
                onClick={() => setIsMinimized(false)}
                className="text-xs text-[#3ba6f1] hover:underline"
              >
                Expand
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
