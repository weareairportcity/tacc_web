"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  Disc3,
  ListMusic,
  Loader2,
  Maximize,
  Minimize,
  Minus,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Type,
  Volume2,
  VolumeX,
} from "lucide-react";
import { PLAYBACK_RATES, useAudioPlayer } from "@/context/AudioPlayerContext";
import { formatTime, parseLyrics, shareSong } from "@/lib/song-tracks";
import { QueuePanel } from "./QueuePanel";

type View = "lyrics" | "cover";

const SIZES = ["text-xl sm:text-2xl", "text-2xl sm:text-3xl", "text-3xl sm:text-4xl", "text-4xl sm:text-5xl"];
const PREFS_KEY = "tacc_nowplaying_prefs";

function readPrefs(): { view?: View; size?: number } {
  if (typeof window === "undefined") return {};
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { view?: View; size?: number };
    return {
      view: prefs.view === "cover" || prefs.view === "lyrics" ? prefs.view : undefined,
      size: typeof prefs.size === "number" ? Math.min(SIZES.length - 1, Math.max(0, prefs.size)) : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Full-screen player. Lyrics view gently follows the song (plain lyrics have
 * no timestamps, so it scrolls by how far through the song we are) and stops
 * following the moment someone scrolls themselves. Cover view is just the art.
 * "Present" uses the browser's real full screen, for putting lyrics on a
 * projector during worship.
 */
export function NowPlaying() {
  const player = useAudioPlayer();
  const {
    currentTrack: track,
    isFullScreen,
    closeFullScreen,
    status,
    error,
    currentTime,
    duration,
    isShuffle,
    repeatMode,
    volume,
    isMuted,
    playbackRate,
  } = player;

  const [prefs] = useState(readPrefs);
  const [view, setView] = useState<View>(prefs.view ?? "lyrics");
  const [size, setSize] = useState(prefs.size ?? 1);
  const [showQueue, setShowQueue] = useState(false);
  // Following the song is per song: scrolling away stops it for this song only.
  const [unfollowedId, setUnfollowedId] = useState<string | null>(null);
  const follow = unfollowedId !== track?.id;
  const setFollow = (on: boolean) => setUnfollowedId(on ? null : (track?.id ?? null));
  const [presenting, setPresenting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const programmaticScroll = useRef(false);

  const sections = useMemo(() => parseLyrics(track?.lyrics), [track?.lyrics]);
  // Each section's first line number across the whole song, for the highlight.
  const sectionStarts = useMemo(
    () => sections.reduce<number[]>((starts, s, i) => [...starts, i === 0 ? 0 : starts[i - 1] + sections[i - 1].lines.length], []),
    [sections],
  );
  const totalLines = sections.reduce((n, s) => n + s.lines.length, 0);
  const progress = duration > 0 ? currentTime / duration : 0;

  // Remember view and text size between visits.
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ view, size }));
    } catch {
      // ignore
    }
  }, [view, size]);

  // No lyrics to show? Fall back to the cover.
  const effectiveView: View = view === "lyrics" && sections.length === 0 ? "cover" : view;

  // Lock the page behind, and close on Escape.
  useEffect(() => {
    if (!isFullScreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) closeFullScreen();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isFullScreen, closeFullScreen]);

  useEffect(() => {
    const onChange = () => setPresenting(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Start each song at the top.
  useEffect(() => {
    lyricsRef.current?.scrollTo({ top: 0 });
  }, [track?.id]);

  // Follow the song through the lyrics.
  useEffect(() => {
    const el = lyricsRef.current;
    if (!el || !follow || effectiveView !== "lyrics" || duration <= 0) return;
    const target = progress * (el.scrollHeight - el.clientHeight);
    if (Math.abs(el.scrollTop - target) < 4) return;
    programmaticScroll.current = true;
    el.scrollTo({ top: target, behavior: "smooth" });
    const t = setTimeout(() => (programmaticScroll.current = false), 700);
    return () => clearTimeout(t);
  }, [progress, follow, effectiveView, duration]);

  if (!isFullScreen || !track) return null;

  const isPlaying = status === "playing" || status === "loading";
  // Roughly which line we're on, for a gentle highlight.
  const activeLine = Math.floor(progress * totalLines);

  async function togglePresent() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      flash("Full screen isn't available in this browser.");
    }
  }

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }

  async function onShare() {
    if (!track) return;
    const result = await shareSong(track);
    if (result === "copied") flash("Link copied");
    if (result === "failed") flash("Couldn't share this song");
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing: ${track.title}`}
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0c0a09] text-white"
    >
      {/* Blurred cover art behind everything */}
      {track.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- decorative background
        <img
          src={track.coverImageUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-3xl"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-black/85" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
        <button
          type="button"
          onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : closeFullScreen())}
          aria-label="Close full screen player"
          className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronDown className="h-6 w-6" />
        </button>

        <div className="flex items-center rounded-full bg-white/10 p-1 text-xs backdrop-blur">
          {(["lyrics", "cover"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              disabled={v === "lyrics" && sections.length === 0}
              className={`rounded-full px-3.5 py-1.5 capitalize transition-colors disabled:opacity-40 ${
                effectiveView === v ? "bg-white text-[#0c0a09]" : "text-white/75 hover:text-white"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {effectiveView === "lyrics" && (
            <div className="hidden items-center rounded-full bg-white/10 sm:flex">
              <HeaderButton label="Smaller text" onClick={() => setSize((s) => Math.max(0, s - 1))}>
                <Minus className="h-4 w-4" />
              </HeaderButton>
              <Type className="h-4 w-4 text-white/60" />
              <HeaderButton label="Larger text" onClick={() => setSize((s) => Math.min(SIZES.length - 1, s + 1))}>
                <Plus className="h-4 w-4" />
              </HeaderButton>
            </div>
          )}
          <HeaderButton label={presenting ? "Exit presentation" : "Present (full screen)"} onClick={togglePresent}>
            {presenting ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </HeaderButton>
          <HeaderButton
            label="Queue"
            active={showQueue}
            onClick={() => setShowQueue((v) => !v)}
          >
            <ListMusic className="h-5 w-5" />
          </HeaderButton>
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col items-center gap-6 px-5 pb-4 pt-6 sm:px-10 lg:flex-row lg:items-stretch lg:gap-12">
          {/* Cover + title (always on desktop; on phones only in Cover view) */}
          <div
            className={`flex shrink-0 flex-col items-center justify-center lg:w-[40%] ${
              effectiveView === "lyrics" ? "hidden lg:flex" : "flex flex-1"
            }`}
          >
            <div
              className={`aspect-square w-full overflow-hidden rounded-2xl bg-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.55)] transition-transform duration-500 ${
                effectiveView === "cover" ? "max-w-[min(78vw,520px)]" : "max-w-[380px]"
              } ${isPlaying ? "scale-100" : "scale-[0.96]"}`}
            >
              {track.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote cover art
                <img src={track.coverImageUrl} alt={track.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Disc3 className="h-16 w-16 text-white/40" />
                </div>
              )}
            </div>
            <TrackTitle track={track} className="mt-6 w-full max-w-[520px] text-center lg:text-left" />
          </div>

          {/* Lyrics */}
          {effectiveView === "lyrics" && (
            <div className="relative flex min-h-0 w-full flex-1 flex-col lg:max-w-[760px]">
              <TrackTitle track={track} className="mb-4 lg:hidden" />
              <div
                ref={lyricsRef}
                onScroll={() => {
                  if (!programmaticScroll.current) setFollow(false);
                }}
                onWheel={() => setFollow(false)}
                onTouchMove={() => setFollow(false)}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[30vh] pr-2 [mask-image:linear-gradient(to_bottom,transparent,black_6%,black_80%,transparent)]"
              >
                <div className="pt-6">
                  {sections.map((section, si) => (
                    <section key={si} className="mb-8">
                      {section.heading && (
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-[#3ba6f1]">
                          {section.heading}
                        </p>
                      )}
                      {section.lines.map((line, li) => {
                        const n = sectionStarts[si] + li;
                        const near = follow && duration > 0 && Math.abs(n - activeLine) <= 1;
                        return (
                          <p
                            key={li}
                            className={`${SIZES[size]} font-roobert font-medium leading-snug tracking-[-0.01em] transition-colors duration-500 ${
                              near ? "text-white" : "text-white/55"
                            }`}
                          >
                            {line}
                          </p>
                        );
                      })}
                    </section>
                  ))}
                </div>
              </div>
              {!follow && duration > 0 && (
                <button
                  type="button"
                  onClick={() => setFollow(true)}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-medium text-[#0c0a09] shadow-lg"
                >
                  Follow the song
                </button>
              )}
            </div>
          )}
        </div>

        {/* Queue drawer */}
        {showQueue && (
          <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[70%] rounded-t-2xl border-t border-white/10 bg-[#1c1917]/95 p-5 backdrop-blur-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[380px] sm:rounded-none sm:border-l sm:border-t-0">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-roobert text-lg">Queue</h2>
              <button
                type="button"
                onClick={() => setShowQueue(false)}
                className="text-xs text-white/60 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="h-[calc(100%-2.5rem)] overflow-y-auto">
              <QueuePanel tone="dark" />
            </div>
          </aside>
        )}
      </div>

      {/* Controls */}
      <footer className="relative z-10 px-5 pb-6 pt-2 sm:px-10 sm:pb-8">
        {status === "error" && error && (
          <p className="mx-auto mb-3 flex max-w-xl items-center justify-center gap-2 text-center text-sm text-[#fca5a5]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        <div className="mx-auto max-w-3xl">
          <Scrubber />
          {/* Phones: transport on its own row, volume/speed/share under it. */}
          <div className="mt-4 grid grid-cols-2 items-center gap-y-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={isMuted ? "Unmute" : "Mute"}
                onClick={player.toggleMute}
                className="rounded-full p-2 text-white/70 hover:text-white"
              >
                {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => player.setVolume(parseFloat(e.target.value))}
                aria-label="Volume"
                className="hidden w-24 accent-white sm:block"
              />
            </div>

            <div className="order-first col-span-2 flex items-center justify-center gap-3 sm:order-none sm:col-span-1 sm:gap-4">
              <ToggleButton label={isShuffle ? "Shuffle on" : "Shuffle off"} active={isShuffle} onClick={player.toggleShuffle}>
                <Shuffle className="h-5 w-5" />
              </ToggleButton>
              <button
                type="button"
                aria-label="Previous"
                onClick={player.playPreviousTrack}
                className="rounded-full p-2 text-white/85 hover:text-white"
              >
                <SkipBack className="h-6 w-6 fill-current" />
              </button>
              <button
                type="button"
                aria-label={isPlaying ? "Pause" : "Play"}
                onClick={player.togglePlayPause}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#0c0a09] shadow-xl transition-transform active:scale-95"
              >
                {status === "loading" ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-7 w-7 fill-current" />
                ) : (
                  <Play className="h-7 w-7 translate-x-0.5 fill-current" />
                )}
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={player.playNextTrack}
                className="rounded-full p-2 text-white/85 hover:text-white"
              >
                <SkipForward className="h-6 w-6 fill-current" />
              </button>
              <ToggleButton
                label={repeatMode === "single" ? "Repeat this song" : repeatMode === "all" ? "Repeat all" : "Repeat off"}
                active={repeatMode !== "off"}
                onClick={player.toggleRepeatMode}
              >
                {repeatMode === "single" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
              </ToggleButton>
            </div>

            <div className="flex items-center justify-end gap-1">
              <label className="sr-only" htmlFor="np-speed">
                Playback speed
              </label>
              <select
                id="np-speed"
                value={playbackRate}
                onChange={(e) => player.setPlaybackRate(parseFloat(e.target.value))}
                className="rounded-full bg-white/10 px-2.5 py-1.5 text-xs text-white outline-none"
                title="Playback speed"
              >
                {PLAYBACK_RATES.map((r) => (
                  <option key={r} value={r} className="text-black">
                    {r}×
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Share song"
                onClick={onShare}
                className="rounded-full p-2 text-white/70 hover:text-white"
              >
                <Share2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </footer>

      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm text-[#0c0a09] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function TrackTitle({
  track,
  className = "",
}: {
  track: { id: string; title: string; artist: string; weekLabel?: string };
  className?: string;
}) {
  return (
    <div className={className}>
      {track.weekLabel && (
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#3ba6f1]">{track.weekLabel}</p>
      )}
      <Link
        href={`/song-of-the-week/${track.id}`}
        className="block truncate font-roobert text-2xl tracking-[-0.02em] hover:underline sm:text-3xl"
      >
        {track.title}
      </Link>
      <p className="mt-1 truncate text-sm text-white/65 sm:text-base">{track.artist}</p>
    </div>
  );
}

function Scrubber() {
  const { currentTime, duration, seek } = useAudioPlayer();
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  return (
    <div>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        onChange={(e) => seek(parseFloat(e.target.value))}
        aria-label="Seek"
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
        style={{ background: `linear-gradient(to right, #fff ${pct}%, rgba(255,255,255,0.2) ${pct}%)` }}
      />
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-white/60">
        <span>{formatTime(currentTime)}</span>
        <span>{duration > 0 ? `-${formatTime(duration - currentTime)}` : "0:00"}</span>
      </div>
    </div>
  );
}

function HeaderButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-full p-2 transition-colors ${
        active ? "bg-white text-[#0c0a09]" : "text-white/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`relative rounded-full p-2 transition-colors ${active ? "text-[#3ba6f1]" : "text-white/60 hover:text-white"}`}
    >
      {children}
      {active && <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#3ba6f1]" />}
    </button>
  );
}
