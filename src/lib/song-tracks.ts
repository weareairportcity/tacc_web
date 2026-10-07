import type { AudioTrack } from "@/context/AudioPlayerContext";

/** The song fields the player needs (any page's song shape fits). */
export type SongLike = {
  id: string;
  title: string;
  artist: string;
  week_label?: string;
  audio_url?: string | null;
  cover_image_url?: string | null;
  lyrics?: string;
  href?: string;
};

export function toTrack(song: SongLike): AudioTrack {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    audioUrl: song.audio_url ?? "",
    coverImageUrl: song.cover_image_url ?? undefined,
    weekLabel: song.week_label,
    lyrics: song.lyrics,
    href: song.href,
  };
}

/** Only songs with audio can go in the queue. */
export const toTracks = (songs: SongLike[]) => songs.filter((s) => s.audio_url).map(toTrack);

export type LyricSection = { heading: string; lines: string[] };

const SECTION_WORDS = ["verse", "chorus", "bridge", "outro", "intro", "refrain", "pre-chorus", "tag", "ending", "end", "vamp"];

/**
 * Splits plain-text lyrics into sections. A section starts after a blank line;
 * a short first line like "Verse 1", "[Chorus]" or "Bridge:" becomes its heading.
 */
export function parseLyrics(text: string | undefined): LyricSection[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const first = lines[0] ?? "";
      const bracketed = /^\[.+\]$/.test(first);
      const named =
        first.length < 24 && SECTION_WORDS.some((w) => first.toLowerCase().replace(/[:\d\s]/g, "").startsWith(w));
      if (bracketed || named) {
        return { heading: first.replace(/^\[|\]$/g, "").replace(/:$/, "").trim(), lines: lines.slice(1) };
      }
      return { heading: "", lines };
    })
    .filter((s) => s.heading || s.lines.length);
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Share a song with the native sheet, or copy its link. Returns what happened. */
export async function shareSong(song: { id: string; title: string; artist: string }) {
  const url = `${window.location.origin}/song-of-the-week/${song.id}`;
  const data = { title: song.title, text: `${song.title} — ${song.artist} · Song of the Week`, url };
  try {
    if (navigator.share) {
      await navigator.share(data);
      return "shared" as const;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled" as const;
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied" as const;
  } catch {
    return "failed" as const;
  }
}
