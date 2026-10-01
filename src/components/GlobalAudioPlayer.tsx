"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ListMusic,
  Loader2,
  Maximize2,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { formatTime } from "@/lib/song-tracks";
import { NowPlaying } from "./player/NowPlaying";
import { QueuePanel } from "./player/QueuePanel";

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest("input, textarea, select, [contenteditable=true]"));
};

/**
 * The player bar pinned to the bottom of every page once a song is playing.
 * Tap the cover (or the expand button) for the full-screen player.
 *
 * Keyboard: Space play/pause · ←/→ 5 seconds · Shift+←/→ previous/next ·
 * F full screen · Q queue · M mute.
 */
export default function GlobalAudioPlayer() {
  const player = useAudioPlayer();
  const {
    currentTrack,
    status,
    error,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    isFullScreen,
    upNext,
  } = player;
  const [isMinimized, setIsMinimized] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => {
    if (!currentTrack) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const onButton = (e.target as HTMLElement | null)?.closest("button, a");
      switch (e.key) {
        case " ":
          if (onButton) return; // the focused button handles Space itself
          e.preventDefault();
          player.togglePlayPause();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) player.playNextTrack();
          else player.seekBy(5);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) player.playPreviousTrack();
          else player.seekBy(-5);
          break;
        case "f":
        case "F":
          if (isFullScreen) player.closeFullScreen();
          else player.openFullScreen();
          break;
        case "q":
        case "Q":
          setShowQueue((v) => !v);
          break;
        case "m":
        case "M":
          player.toggleMute();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentTrack, isFullScreen, player]);

  if (!currentTrack) return null;

  const isPlaying = status === "playing" || status === "loading";
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const playButton = (size: "sm" | "md") => (
    <button
      type="button"
      onClick={player.togglePlayPause}
      aria-label={status === "error" ? "Try again" : isPlaying ? "Pause" : "Play"}
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#3ba6f1] text-white shadow-sm transition-all hover:bg-[#3398e1] active:scale-95 ${
        size === "md" ? "h-10 w-10 sm:h-11 sm:w-11" : "h-8 w-8"
      }`}
    >
      {status === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isPlaying ? (
        <Pause className="h-4 w-4 fill-current" />
      ) : (
        <Play className="h-4 w-4 translate-x-0.5 fill-current" />
      )}
    </button>
  );

  return (
    <>
      {/* Keeps the bar from covering the end of the page. */}
      <div aria-hidden className={isMinimized ? "h-16" : "h-28"} />

      <NowPlaying />

      {!isFullScreen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-6">
          <div className="pointer-events-auto relative mx-auto max-w-[1200px]">
            {/* Queue pop-up */}
            {showQueue && (
              <div className="absolute bottom-full right-0 mb-2 max-h-[60vh] w-full overflow-hidden rounded-2xl border border-[#2c2825] bg-[#1c1917]/95 p-4 text-white shadow-[0_12px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:w-[380px]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-roobert text-base">Queue</h2>
                  <button
                    type="button"
                    onClick={() => setShowQueue(false)}
                    aria-label="Close queue"
                    className="rounded-md p-1 text-white/60 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[calc(60vh-4rem)] overflow-y-auto">
                  <QueuePanel tone="dark" />
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-[16px] border border-[#2c2825] bg-[#1c1917] text-white shadow-[0_12px_45px_rgba(0,0,0,0.3)]">
              {/* Progress / seek */}
              <div className="group relative h-1 w-full cursor-pointer bg-[#2c2825]">
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={Math.min(currentTime, duration || 0)}
                  onChange={(e) => player.seek(parseFloat(e.target.value))}
                  aria-label="Seek"
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                />
                <div className="relative h-full bg-[#3ba6f1]" style={{ width: `${pct}%` }}>
                  <div className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-md transition-opacity group-hover:opacity-100" />
                </div>
              </div>

              {isMinimized ? (
                <div className="flex items-center justify-between gap-3 p-2 sm:p-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    {playButton("sm")}
                    <span className="truncate font-roobert text-xs">
                      {currentTrack.title} <span className="text-[#a8a29e]">— {currentTrack.artist}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMinimized(false)}
                    aria-label="Expand player"
                    className="rounded-lg p-1.5 text-[#a8a29e] hover:text-white"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 p-3 sm:gap-6 sm:p-4">
                  {/* Track */}
                  <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-initial sm:basis-[30%]">
                    <button
                      type="button"
                      onClick={player.openFullScreen}
                      aria-label="Open full screen player"
                      className="group relative h-11 w-11 shrink-0 overflow-hidden rounded-[8px] border border-[#3a3531] bg-[#2c2825] sm:h-12 sm:w-12"
                    >
                      {currentTrack.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote cover art
                        <img src={currentTrack.coverImageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[#3ba6f1]">
                          <Music className="h-5 w-5" />
                        </span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                        <Maximize2 className="h-4 w-4" />
                      </span>
                    </button>
                    <div className="min-w-0">
                      {currentTrack.weekLabel && (
                        <span className="rounded-full bg-[#3ba6f1]/15 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-[#3ba6f1]">
                          {currentTrack.weekLabel}
                        </span>
                      )}
                      <Link
                        href={`/song-of-the-week/${currentTrack.id}`}
                        className="mt-0.5 block truncate font-roobert text-xs tracking-tight hover:text-[#3ba6f1] sm:text-sm"
                      >
                        {currentTrack.title}
                      </Link>
                      {status === "error" && error ? (
                        <p className="flex items-center gap-1 truncate text-[11px] text-[#fca5a5]">
                          <AlertCircle className="h-3 w-3 shrink-0" /> Couldn&apos;t play. Tap play to retry.
                        </p>
                      ) : (
                        <p className="truncate text-[11px] text-[#a8a29e]">{currentTrack.artist}</p>
                      )}
                    </div>
                  </div>

                  {/* Transport */}
                  <div className="flex items-center gap-1 sm:gap-3">
                    <BarToggle
                      label={isShuffle ? "Shuffle on" : "Shuffle off"}
                      active={isShuffle}
                      onClick={player.toggleShuffle}
                      className="hidden sm:flex"
                    >
                      <Shuffle className="h-4 w-4" />
                    </BarToggle>
                    <button
                      type="button"
                      onClick={player.playPreviousTrack}
                      aria-label="Previous"
                      className="hidden p-1.5 text-[#a8a29e] transition-colors hover:text-white min-[380px]:block"
                    >
                      <SkipBack className="h-[18px] w-[18px] fill-current" />
                    </button>
                    {playButton("md")}
                    <button
                      type="button"
                      onClick={player.playNextTrack}
                      aria-label="Next"
                      className="p-1.5 text-[#a8a29e] transition-colors hover:text-white"
                    >
                      <SkipForward className="h-[18px] w-[18px] fill-current" />
                    </button>
                    <BarToggle
                      label={repeatMode === "single" ? "Repeat this song" : repeatMode === "all" ? "Repeat all" : "Repeat off"}
                      active={repeatMode !== "off"}
                      onClick={player.toggleRepeatMode}
                      className="hidden sm:flex"
                    >
                      {repeatMode === "single" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                    </BarToggle>
                    <span className="ml-1 hidden min-w-[78px] text-center font-mono text-[11px] text-[#a8a29e] md:block">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  {/* Extras */}
                  <div className="flex items-center justify-end gap-1 sm:basis-[30%] sm:gap-2">
                    <div className="hidden items-center gap-2 rounded-full border border-[#3a3531] bg-[#2c2825] px-3 py-1.5 lg:flex">
                      <button
                        type="button"
                        onClick={player.toggleMute}
                        aria-label={isMuted ? "Unmute" : "Mute"}
                        className="text-[#a8a29e] hover:text-white"
                      >
                        {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => player.setVolume(parseFloat(e.target.value))}
                        aria-label="Volume"
                        className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-[#3a3531] accent-[#3ba6f1]"
                      />
                    </div>
                    <BarToggle label="Queue" active={showQueue} onClick={() => setShowQueue((v) => !v)}>
                      <ListMusic className="h-4 w-4" />
                      {upNext.length > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#3ba6f1] px-1 text-[9px] font-medium text-white">
                          {upNext.length}
                        </span>
                      )}
                    </BarToggle>
                    <BarToggle label="Full screen" active={false} onClick={player.openFullScreen} className="hidden sm:flex">
                      <Maximize2 className="h-4 w-4" />
                    </BarToggle>
                    <button
                      type="button"
                      onClick={() => setIsMinimized(true)}
                      aria-label="Minimise player"
                      className="hidden rounded-lg p-1.5 text-[#a8a29e] transition-colors hover:text-white sm:block"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={player.closePlayer}
                      aria-label="Close player"
                      className="rounded-lg p-1.5 text-[#a8a29e] transition-colors hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BarToggle({
  label,
  active,
  onClick,
  className = "",
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`relative items-center justify-center rounded-full p-1.5 transition-colors ${
        active ? "bg-[#3ba6f1]/15 text-[#3ba6f1]" : "text-[#a8a29e] hover:text-white"
      } ${className.includes("hidden") ? className : `flex ${className}`}`}
    >
      {children}
    </button>
  );
}
