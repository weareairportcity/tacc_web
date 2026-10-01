"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Maximize2, Music, Pause, Play, ScrollText, Search, Shuffle, X } from "lucide-react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { toTrack, toTracks } from "@/lib/song-tracks";
import { EqualizerBars } from "@/components/player/EqualizerBars";
import { SongMenu, useNotice } from "@/components/player/SongMenu";

type Song = {
  id: string;
  week_label: string;
  publish_date: string;
  title: string;
  artist: string;
  lyrics?: string;
  audio_url?: string;
  cover_image_url?: string;
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The song catalog: this week's song up top, then search, play all and the grid. */
export default function CatalogGrid({ songs }: { songs: Song[] }) {
  const player = useAudioPlayer();
  const { currentTrack, status } = player;
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useNotice();

  const tracks = useMemo(() => toTracks(songs), [songs]);
  const featured = songs[0];

  // ⌘K / Ctrl+K or "/" jumps to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select");
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) =>
      [s.title, s.artist, s.week_label, s.lyrics].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [songs, query]);

  const isCurrent = (id: string) => currentTrack?.id === id;
  const isPlayingSong = (id: string) => isCurrent(id) && (status === "playing" || status === "loading");

  const play = (song: Song) => {
    if (!song.audio_url) return;
    player.playTrack(toTrack(song), tracks);
  };

  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-[10px] border border-[#e8e6e5] bg-white py-16 text-center shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#e8e6e5] bg-[#fafaf9] text-[#78716c]">
          <Music className="h-5 w-5" />
        </div>
        <h3 className="font-roobert text-base text-[#0c0a09]">No songs published yet</h3>
        <p className="mt-1 text-xs text-[#a8a29e]">Check back soon for this week&apos;s song.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* This week's song */}
      {featured && (
        <section
          aria-label="This week's song"
          className="relative overflow-hidden rounded-[20px] border border-[#e8e6e5] bg-[#0c0a09] text-white shadow-[0_12px_45px_rgba(17,12,46,0.12)]"
        >
          {featured.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- decorative background
            <img
              src={featured.cover_image_url}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/30" />
          <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
            <div className="aspect-square w-40 shrink-0 overflow-hidden rounded-xl bg-white/10 shadow-2xl sm:w-48">
              {featured.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote cover art
                <img src={featured.cover_image_url} alt={featured.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Music className="h-10 w-10 text-white/40" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#7cc4f7]">
                This week · {featured.week_label}
              </p>
              <h3 className="mt-2 font-roobert text-3xl tracking-[-0.02em] sm:text-4xl">{featured.title}</h3>
              <p className="mt-1 text-white/70">{featured.artist}</p>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={!featured.audio_url}
                  onClick={() => play(featured)}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[#0c0a09] transition-transform active:scale-95 disabled:opacity-50"
                >
                  {isCurrent(featured.id) && status === "loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isPlayingSong(featured.id) ? (
                    <Pause className="h-4 w-4 fill-current" />
                  ) : (
                    <Play className="h-4 w-4 fill-current" />
                  )}
                  {isPlayingSong(featured.id) ? "Pause" : "Play"}
                </button>
                <button
                  type="button"
                  disabled={!featured.audio_url}
                  onClick={() => {
                    if (!isCurrent(featured.id)) play(featured);
                    player.openFullScreen();
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-sm backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-50"
                >
                  <Maximize2 className="h-4 w-4" /> Sing along
                </button>
                <Link
                  href={`/song-of-the-week/${featured.id}`}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2.5 text-sm text-white/80 hover:text-white"
                >
                  <ScrollText className="h-4 w-4" /> Lyrics
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex flex-1 items-center gap-2 rounded-full border border-[#e8e6e5] bg-white px-4 py-2.5 transition-colors focus-within:border-[#3ba6f1] sm:max-w-md">
          <Search className="h-4 w-4 shrink-0 text-[#a8a29e]" />
          <span className="sr-only">Search songs</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, artist or a line of lyrics"
            className="w-full bg-transparent text-sm text-[#0c0a09] outline-none placeholder:text-[#a8a29e] [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="text-[#a8a29e] hover:text-[#0c0a09]">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-[#e8e6e5] px-1.5 py-0.5 font-sans text-[10px] text-[#a8a29e] sm:block">⌘K</kbd>
          )}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={tracks.length === 0}
            onClick={() => player.playAll(toTracks(results))}
            className="inline-flex items-center gap-2 rounded-full border border-[#3398e1] bg-[#3ba6f1] px-4 py-2.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-[#3398e1] disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5 fill-current" /> Play all
          </button>
          <button
            type="button"
            disabled={tracks.length === 0}
            onClick={() => player.playAll(toTracks(results), { shuffle: true })}
            className="inline-flex items-center gap-2 rounded-full border border-[#e8e6e5] bg-white px-4 py-2.5 text-xs font-medium text-[#0c0a09] transition-colors hover:border-[#d6d3d1] disabled:opacity-50"
          >
            <Shuffle className="h-3.5 w-3.5" /> Shuffle
          </button>
        </div>
      </div>

      {query && (
        <p className="-mt-6 text-xs text-[#78716c]">
          {results.length === 0
            ? `No songs match “${query}”.`
            : `${results.length} ${results.length === 1 ? "song" : "songs"} match “${query}”.`}
        </p>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5">
        {results.map((song) => {
          const current = isCurrent(song.id);
          const playing = isPlayingSong(song.id);
          return (
            <div
              key={song.id}
              className={`group flex flex-col justify-between rounded-[10px] border bg-white p-[14px] shadow-[0_4px_16px_rgba(0,0,0,0.05)] transition-all duration-200 ${
                current ? "border-[#3ba6f1] ring-2 ring-[#3ba6f1]/15" : "border-[#e8e6e5] hover:border-[#d6d3d1]"
              }`}
            >
              <div>
                <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-[8px] border border-[#e8e6e5] bg-[#fafaf9]">
                  {song.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote cover art
                    <img
                      src={song.cover_image_url}
                      alt={song.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Music className="h-6 w-6 text-[#a8a29e]" />
                    </div>
                  )}
                  <span className="absolute left-2 top-2 z-10 rounded-full border border-[#e8e6e5] bg-white/90 px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#78716c] backdrop-blur-sm">
                    {song.week_label}
                  </span>
                  {song.audio_url && (
                    <button
                      type="button"
                      onClick={() => play(song)}
                      aria-label={playing ? `Pause ${song.title}` : `Play ${song.title}`}
                      // Always visible on touch screens; on hover elsewhere (or while it's the current song).
                      className={`absolute bottom-2 right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#3ba6f1] text-white shadow-lg transition-all duration-200 hover:bg-[#3398e1] [@media(hover:hover)]:translate-y-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100 ${
                        current ? "[@media(hover:hover)]:translate-y-0 [@media(hover:hover)]:opacity-100" : ""
                      }`}
                    >
                      {current && status === "loading" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : playing ? (
                        <Pause className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="h-4 w-4 translate-x-0.5 fill-current" />
                      )}
                    </button>
                  )}
                </div>
                <Link href={`/song-of-the-week/${song.id}`} className="group/title block">
                  <h3
                    className={`flex items-center gap-1.5 truncate font-roobert text-sm leading-snug tracking-[-0.017em] transition-colors group-hover/title:text-[#3398e1] ${
                      current ? "text-[#3398e1]" : "text-[#0c0a09]"
                    }`}
                  >
                    {playing && <EqualizerBars className="shrink-0 text-[#3ba6f1]" />}
                    <span className="truncate">{song.title}</span>
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-[#78716c]">{song.artist}</p>
                </Link>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[#e8e6e5] pt-1.5 text-[11px] text-[#a8a29e]">
                <span>{formatDate(song.publish_date)}</span>
                <SongMenu song={song} onNotice={setNotice} />
              </div>
            </div>
          );
        })}
      </div>

      {notice}
    </div>
  );
}
