"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ListEnd, ListPlus, MoreHorizontal, ScrollText, Share2 } from "lucide-react";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import { shareSong, toTrack, type SongLike } from "@/lib/song-tracks";

/** The "…" menu on a song: play next, add to queue, share, open lyrics. */
export function SongMenu({
  song,
  onNotice,
  align = "right",
  className = "",
}: {
  song: SongLike;
  onNotice: (message: string) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const { playNext, addToQueue } = useAudioPlayer();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const hasAudio = Boolean(song.audio_url);
  const item =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-[#0c0a09] hover:bg-[#fafaf9] disabled:opacity-40";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={`More options for ${song.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[#78716c] transition-colors hover:bg-[#f2f2f2] hover:text-[#0c0a09]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute bottom-full z-30 mb-1 w-48 rounded-lg border border-[#e8e6e5] bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.12)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!hasAudio}
            className={item}
            onClick={() => {
              playNext(toTrack(song));
              onNotice(`“${song.title}” will play next`);
              setOpen(false);
            }}
          >
            <ListPlus className="h-4 w-4 text-[#78716c]" /> Play next
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasAudio}
            className={item}
            onClick={() => {
              onNotice(
                addToQueue(toTrack(song))
                  ? `Added “${song.title}” to the queue`
                  : `“${song.title}” is already in your queue`,
              );
              setOpen(false);
            }}
          >
            <ListEnd className="h-4 w-4 text-[#78716c]" /> Add to queue
          </button>
          <Link role="menuitem" href={`/song-of-the-week/${song.id}`} className={item} onClick={() => setOpen(false)}>
            <ScrollText className="h-4 w-4 text-[#78716c]" /> Lyrics
          </Link>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={async () => {
              setOpen(false);
              const result = await shareSong(song);
              if (result === "copied") onNotice("Link copied");
              if (result === "failed") onNotice("Couldn't share this song");
            }}
          >
            <Share2 className="h-4 w-4 text-[#78716c]" /> Share
          </button>
        </div>
      )}
    </div>
  );
}

/** A short-lived message at the bottom of the screen. */
export function useNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2400);
    return () => clearTimeout(t);
  }, [notice]);
  const node = notice ? (
    <div
      role="status"
      className="fixed bottom-32 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-[#0c0a09] px-4 py-2 text-sm text-white shadow-lg"
    >
      {notice}
    </div>
  ) : null;
  return [node, setNotice] as const;
}
