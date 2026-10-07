"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check, ChevronDown, Loader2, Maximize2, Music, Pause, Play, Radio, ScrollText } from "lucide-react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { parseLyrics, toTrack, toTracks, type SongLike } from "@/lib/song-tracks";
import { EqualizerBars } from "@/components/player/EqualizerBars";
import type { ServiceWithSongs, SongStatus } from "@/lib/services-db";
import { formatServiceDate } from "../../ServicesSection";

const POLL_MS = 10_000;

/** A service's songs in order, following which one is live and which are sung. */
export default function ServicePlaylist({ service }: { service: ServiceWithSongs }) {
  const player = useAudioPlayer();
  const { currentTrack, status } = player;
  const [statuses, setStatuses] = useState<Record<string, SongStatus>>(() =>
    Object.fromEntries(service.songs.map((s) => [s.id, s.status])),
  );
  const [openLyrics, setOpenLyrics] = useState<string | null>(null);
  const liveRef = useRef<HTMLLIElement>(null);

  const href = `/song-of-the-week/services/${service.id}`;
  const songs: (SongLike & { section: string; status: SongStatus })[] = useMemo(
    () =>
      service.songs.map((s) => ({
        id: s.id,
        section: s.section,
        title: s.title,
        artist: s.artist,
        lyrics: s.lyrics,
        audio_url: s.audio_url,
        cover_image_url: service.cover_image_url,
        week_label: service.title,
        href,
        status: statuses[s.id] ?? s.status,
      })),
    [service, statuses, href],
  );
  const tracks = useMemo(() => toTracks(songs), [songs]);
  const liveIndex = songs.findIndex((s) => s.status === "live");
  const live = songs[liveIndex];
  const upNext = songs.find((s, i) => i > liveIndex && s.status === "upcoming");
  // Numbers restart in each section.
  const numberOf = (i: number) => i - songs.findIndex((s) => s.section === songs[i].section) + 1;
  const allSung = songs.length > 0 && songs.every((s) => s.status === "sung");

  // Follow along: poll the CDN-cached live feed while the page is on screen.
  useEffect(() => {
    if (allSung) return;
    let stopped = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/sotw/services/${service.id}/live`);
        if (!res.ok) return;
        const { songs: fresh } = (await res.json()) as { songs: { id: string; status: SongStatus }[] };
        if (!stopped) setStatuses(Object.fromEntries(fresh.map((s) => [s.id, s.status])));
      } catch {
        // Offline for a moment: keep showing the last known state.
      }
    };
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [service.id, allSung]);

  // Bring the live song into view when it changes.
  const liveId = live?.id;
  useEffect(() => {
    if (liveId) liveRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [liveId]);

  /** Opens the live song's lyrics and scrolls to it. */
  const jumpToLive = () => {
    if (!liveId) return;
    setOpenLyrics(liveId);
    liveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isCurrent = (id: string) => currentTrack?.id === id;
  const isPlayingSong = (id: string) => isCurrent(id) && (status === "playing" || status === "loading");
  const play = (song: SongLike) => {
    if (song.audio_url) player.playTrack(toTrack(song), tracks);
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] font-inter text-[#0c0a09] antialiased">
      <header className="sticky top-0 z-40 flex h-[64px] items-center border-b border-[#e8e6e5] bg-white px-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:px-6">
        <div className="mx-auto flex w-full max-w-[900px] items-center justify-between gap-4">
          <Link href="/song-of-the-week#services" className="flex items-center gap-2 text-xs text-[#78716c] hover:text-[#0c0a09]">
            <ArrowLeft className="h-4 w-4" /> Songs Portal
          </Link>
          <Image src="/logo.png" alt="The Airport City Church" width={92} height={30} className="object-contain" />
        </div>
      </header>

      {/* Now singing: stays under the top bar while scrolling */}
      {live && (
        <div className="sticky top-[64px] z-30 bg-[#ef4444] text-white shadow-[0_6px_20px_rgba(239,68,68,0.3)]" role="status" aria-live="polite">
          <div className="mx-auto flex max-w-[900px] items-center gap-3 px-4 py-2.5 sm:px-6">
            <button
              type="button"
              onClick={jumpToLive}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
                  Now singing{live.section ? ` · ${live.section} #${numberOf(liveIndex)}` : ` · #${liveIndex + 1}`}
                </span>
                <span key={live.id} className="block truncate font-roobert text-base leading-tight sm:text-lg">
                  {live.title}
                </span>
                {upNext && <span className="block truncate text-[11px] text-white/75">Up next: {upNext.title}</span>}
              </span>
            </button>
            <button
              type="button"
              onClick={jumpToLive}
              className="hidden shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30 sm:inline-flex"
            >
              <ScrollText className="h-3.5 w-3.5" /> Lyrics
            </button>
            {live.audio_url && (
              <button
                type="button"
                onClick={() => play(live)}
                aria-label={isPlayingSong(live.id) ? `Pause ${live.title}` : `Play ${live.title}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#ef4444]"
              >
                {isPlayingSong(live.id) ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-0.5 fill-current" />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Album header */}
      <section className="relative overflow-hidden bg-[#0c0a09] text-white">
        {service.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- decorative background
          <img src={service.cover_image_url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-black/80" />
        <div className="relative mx-auto flex max-w-[900px] flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:px-6 sm:py-12">
          <div className="aspect-square w-48 shrink-0 overflow-hidden rounded-xl bg-white/10 shadow-2xl sm:w-56">
            {service.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote cover art
              <img src={service.cover_image_url} alt={service.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music className="h-10 w-10 text-white/40" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#7cc4f7]">Live Service Playlist</p>
            <h1 className="mt-2 font-roobert text-3xl tracking-[-0.02em] sm:text-5xl">{service.title}</h1>
            <p className="mt-2 text-sm text-white/70">
              {formatServiceDate(service.service_date)} · {songs.length} {songs.length === 1 ? "song" : "songs"}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={tracks.length === 0}
                onClick={() => player.playAll(tracks)}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[#0c0a09] transition-transform active:scale-95 disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" /> Play all
              </button>
              {allSung && <span className="text-sm text-white/60">This service&apos;s worship has ended.</span>}
            </div>
          </div>
        </div>
      </section>

      {/* Order of songs */}
      <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <ol className="space-y-2">
          {songs.map((song, i) => {
            const newSection = Boolean(song.section) && song.section !== songs[i - 1]?.section;
            const number = numberOf(i);
            const isLive = song.status === "live";
            const isSung = song.status === "sung";
            const current = isCurrent(song.id);
            const playing = isPlayingSong(song.id);
            const lyricsOpen = openLyrics === song.id;
            const sections = lyricsOpen ? parseLyrics(song.lyrics) : [];
            return (
              <Fragment key={song.id}>
                {newSection && (
                  <li className={`px-1 pb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#78716c] ${i > 0 ? "pt-6" : ""}`}>
                    {song.section}
                  </li>
                )}
                <li
                  ref={isLive ? liveRef : undefined}
                  className={`scroll-mt-36 rounded-[12px] border bg-white transition-all ${
                    isLive
                      ? "border-[#ef4444] shadow-[0_8px_30px_rgba(239,68,68,0.15)] ring-2 ring-[#ef4444]/15"
                      : current
                        ? "border-[#3ba6f1]"
                        : "border-[#e8e6e5]"
                  }`}
                >
                  <div className={`flex items-center gap-3 p-3 sm:gap-4 sm:p-4 ${isSung ? "opacity-55" : ""}`}>
                    {/* Position and state */}
                    <div className="flex w-8 shrink-0 justify-center">
                      {isLive ? (
                        <Radio className="h-5 w-5 animate-pulse text-[#ef4444]" aria-label="Live" />
                      ) : isSung ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16a34a] text-white" aria-label="Sung">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="font-roobert text-sm text-[#a8a29e]">{number}</span>
                      )}
                    </div>

                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[#0c0a09]">
                      {service.cover_image_url && (
                        // eslint-disable-next-line @next/next/no-img-element -- remote cover art
                        <img src={service.cover_image_url} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={`flex items-center gap-1.5 truncate font-roobert text-[15px] tracking-[-0.01em] ${current ? "text-[#3398e1]" : ""} ${isSung ? "line-through decoration-[#a8a29e]/60" : ""}`}>
                        {playing && <EqualizerBars className="shrink-0 text-[#3ba6f1]" />}
                        <span className="truncate">{song.title}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-[#78716c]">
                        {isLive && <span className="rounded-full bg-[#ef4444] px-1.5 py-px text-[10px] font-semibold text-white">LIVE</span>}
                        {isSung && <span className="text-[#16a34a]">Sung</span>}
                        <span className="truncate">{song.artist}</span>
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {song.lyrics && (
                        <button
                          type="button"
                          onClick={() => setOpenLyrics(lyricsOpen ? null : song.id)}
                          aria-expanded={lyricsOpen}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-xs text-[#78716c] hover:bg-[#fafaf9] hover:text-[#0c0a09]"
                        >
                          Lyrics <ChevronDown className={`h-3.5 w-3.5 transition-transform ${lyricsOpen ? "rotate-180" : ""}`} />
                        </button>
                      )}
                      {song.audio_url && (
                        <button
                          type="button"
                          onClick={() => play(song)}
                          aria-label={playing ? `Pause ${song.title}` : `Play ${song.title}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3ba6f1] text-white shadow-sm transition-colors hover:bg-[#3398e1]"
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
                  </div>

                  {lyricsOpen && (
                    <div className="border-t border-[#e8e6e5] px-4 pb-5 pt-4 sm:px-16">
                      {song.audio_url && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!current) player.playTrack(toTrack(song), tracks);
                            player.openFullScreen();
                          }}
                          className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e8e6e5] px-3 py-1.5 text-xs text-[#0c0a09] hover:border-[#d6d3d1]"
                        >
                          <Maximize2 className="h-3.5 w-3.5" /> Sing along in full screen
                        </button>
                      )}
                      <div className="space-y-4 text-[15px] leading-relaxed text-[#292524]">
                        {sections.map((section, j) => (
                          <div key={j}>
                            {section.heading && (
                              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#3398e1]">{section.heading}</p>
                            )}
                            {section.lines.map((line, k) => (
                              <p key={k}>{line}</p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>

        {songs.length === 0 && (
          <p className="py-16 text-center text-sm text-[#a8a29e]">The songs for this service will appear here soon.</p>
        )}
      </main>
    </div>
  );
}
