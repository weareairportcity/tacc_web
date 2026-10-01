"use server";

import { headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { query } from "@/lib/cf";
import { SONGS_TAG, seedIfEmpty } from "@/lib/songs-db";
import { requireSongsAdmin, songsAdmin } from "@/lib/code-session";
import type { RawAnalyticsEvent } from "./AnalyticsDashboard";

const ID = /^[0-9a-f-]{36}$/i;

// ─── Sign-in ─────────────────────────────────────────────────────────────────

const attempts = new Map<string, { count: number; resetAt: number }>();

export type UnlockState = { error: string | null };

export async function unlockSongsAdmin(_prev: UnlockState, form: FormData): Promise<UnlockState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= 5) {
    return { error: "Too many wrong tries. Please wait 10 minutes and try again." };
  }
  if (!songsAdmin.isCode(String(form.get("code") ?? ""))) {
    const fresh = !entry || entry.resetAt <= now;
    attempts.set(ip, { count: fresh ? 1 : entry.count + 1, resetAt: fresh ? now + 600_000 : entry.resetAt });
    await new Promise((r) => setTimeout(r, 800));
    return { error: "That code is not right. Please check it and try again." };
  }
  attempts.delete(ip);
  await songsAdmin.start();
  revalidatePath("/admin/songs");
  return { error: null };
}

export async function lockSongsAdmin() {
  await songsAdmin.end();
  revalidatePath("/admin/songs");
}

// ─── Songs ───────────────────────────────────────────────────────────────────

export type AdminSong = {
  id: string;
  created_at?: string;
  week_label: string;
  publish_date: string;
  title: string;
  artist: string;
  lyrics: string;
  audio_url: string;
  cover_image_url: string;
  is_published: boolean;
};

function refreshPublicPages() {
  revalidateTag(SONGS_TAG, "max");
  revalidatePath("/song-of-the-week");
  revalidatePath("/song-of-the-week/[id]", "page");
}

/** Every song plus the raw analytics events the dashboard charts. */
export async function fetchSongsAdmin(): Promise<{ songs: AdminSong[]; events: RawAnalyticsEvent[] }> {
  await requireSongsAdmin();
  await seedIfEmpty();
  const [songs, events] = await Promise.all([
    query<Omit<AdminSong, "is_published"> & { is_published: number }>(
      "app",
      `SELECT id, created_at, week_label, publish_date, title, artist, lyrics,
              coalesce(audio_url, '') AS audio_url, coalesce(cover_image_url, '') AS cover_image_url, is_published
       FROM sotw_songs ORDER BY publish_date DESC, created_at DESC`,
    ),
    query<RawAnalyticsEvent>(
      "app",
      "SELECT CAST(id AS TEXT) AS id, created_at, song_id, event_type, visitor_id FROM sotw_events ORDER BY id",
    ),
  ]);
  return { songs: songs.map((s) => ({ ...s, is_published: s.is_published === 1 })), events };
}

export async function saveSongAdmin(song: Omit<AdminSong, "id" | "created_at"> & { id?: string }) {
  await requireSongsAdmin();
  const required = [song.week_label, song.title, song.artist, song.lyrics, song.publish_date];
  if (required.some((v) => typeof v !== "string" || !v.trim())) {
    throw new Error("Please fill in all required fields (Week, Title, Artist, Lyrics).");
  }
  const id = song.id && ID.test(song.id) ? song.id : crypto.randomUUID();
  await query(
    "app",
    `INSERT INTO sotw_songs (id, week_label, publish_date, title, artist, lyrics, audio_url, cover_image_url, is_published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       week_label = excluded.week_label, publish_date = excluded.publish_date, title = excluded.title,
       artist = excluded.artist, lyrics = excluded.lyrics, audio_url = excluded.audio_url,
       cover_image_url = excluded.cover_image_url, is_published = excluded.is_published`,
    [
      id,
      song.week_label.trim(),
      song.publish_date,
      song.title.trim(),
      song.artist.trim(),
      song.lyrics,
      song.audio_url || null,
      song.cover_image_url || null,
      song.is_published ? 1 : 0,
    ],
  );
  refreshPublicPages();
  return id;
}

export async function deleteSongAdmin(id: string) {
  await requireSongsAdmin();
  if (!ID.test(id)) throw new Error("Invalid song");
  await query("app", "DELETE FROM sotw_songs WHERE id = ?", [id]);
  refreshPublicPages();
}

export async function setSongPublished(id: string, published: boolean) {
  await requireSongsAdmin();
  if (!ID.test(id)) throw new Error("Invalid song");
  await query("app", "UPDATE sotw_songs SET is_published = ? WHERE id = ?", [published ? 1 : 0, id]);
  refreshPublicPages();
}
