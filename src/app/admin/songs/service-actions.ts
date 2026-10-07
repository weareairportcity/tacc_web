"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { batch, query } from "@/lib/cf";
import { requireSongsAdmin } from "@/lib/code-session";
import {
  SERVICES_TAG,
  SERVICE_COLUMNS,
  SERVICE_SONG_COLUMNS,
  isServiceId,
  type Service,
  type ServiceSong,
  type ServiceWithSongs,
  type SongStatus,
} from "@/lib/services-db";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: SongStatus[] = ["upcoming", "live", "sung"];

function refreshPublicPages() {
  revalidateTag(SERVICES_TAG, "max");
  revalidatePath("/song-of-the-week");
  revalidatePath("/song-of-the-week/services/[id]", "page");
}

function requireId(id: string) {
  if (!isServiceId(id)) throw new Error("Invalid id");
}

async function songsOf(serviceId: string) {
  return query<ServiceSong>(
    "app",
    `SELECT ${SERVICE_SONG_COLUMNS} FROM sotw_service_songs WHERE service_id = ? ORDER BY position`,
    [serviceId],
  );
}

/** Every service (drafts too) with its songs in order. */
export async function fetchServicesAdmin(): Promise<ServiceWithSongs[]> {
  await requireSongsAdmin();
  const [services, songs] = await Promise.all([
    query<Omit<Service, "is_published"> & { is_published: number }>(
      "app",
      `SELECT ${SERVICE_COLUMNS} FROM sotw_services ORDER BY service_date DESC, created_at DESC`,
    ),
    query<ServiceSong>("app", `SELECT ${SERVICE_SONG_COLUMNS} FROM sotw_service_songs ORDER BY service_id, position`),
  ]);
  return services.map((s) => ({
    ...s,
    is_published: s.is_published === 1,
    songs: songs.filter((song) => song.service_id === s.id),
  }));
}

// ─── Services ────────────────────────────────────────────────────────────────

export async function saveServiceAdmin(service: Omit<Service, "id"> & { id?: string }) {
  await requireSongsAdmin();
  if (!service.title?.trim() || !DATE.test(service.service_date ?? "")) {
    throw new Error("Please give the service a name and a date.");
  }
  const id = service.id && isServiceId(service.id) ? service.id : crypto.randomUUID();
  await query(
    "app",
    `INSERT INTO sotw_services (id, title, service_date, cover_image_url, is_published) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET title = excluded.title, service_date = excluded.service_date,
       cover_image_url = excluded.cover_image_url, is_published = excluded.is_published`,
    [id, service.title.trim(), service.service_date, service.cover_image_url || null, service.is_published ? 1 : 0],
  );
  refreshPublicPages();
  return id;
}

export async function deleteServiceAdmin(id: string) {
  await requireSongsAdmin();
  requireId(id);
  await batch("app", [
    { sql: "DELETE FROM sotw_service_songs WHERE service_id = ?", params: [id] },
    { sql: "DELETE FROM sotw_services WHERE id = ?", params: [id] },
  ]);
  refreshPublicPages();
}

// ─── Songs in a service ──────────────────────────────────────────────────────

export type ServiceSongInput = {
  id?: string;
  service_id: string;
  title: string;
  artist: string;
  lyrics: string;
  audio_url: string;
  source_url?: string;
};

/** Adds a song at the end of the service, or updates one in place. */
export async function saveServiceSongAdmin(song: ServiceSongInput) {
  await requireSongsAdmin();
  requireId(song.service_id);
  if (!song.title?.trim()) throw new Error("Please give the song a title.");
  const values = [song.title.trim(), song.artist?.trim() ?? "", song.lyrics ?? "", song.audio_url || null, song.source_url || null];
  if (song.id && isServiceId(song.id)) {
    await query(
      "app",
      `UPDATE sotw_service_songs SET title = ?, artist = ?, lyrics = ?, audio_url = ?, source_url = ?
       WHERE id = ? AND service_id = ?`,
      [...values, song.id, song.service_id],
    );
  } else {
    await query(
      "app",
      `INSERT INTO sotw_service_songs (id, service_id, position, title, artist, lyrics, audio_url, source_url)
       SELECT ?, ?, coalesce(max(position), 0) + 1, ?, ?, ?, ?, ? FROM sotw_service_songs WHERE service_id = ?`,
      [crypto.randomUUID(), song.service_id, ...values, song.service_id],
    );
  }
  refreshPublicPages();
  return songsOf(song.service_id);
}

export async function deleteServiceSongAdmin(serviceId: string, id: string) {
  await requireSongsAdmin();
  requireId(serviceId);
  requireId(id);
  await query("app", "DELETE FROM sotw_service_songs WHERE id = ? AND service_id = ?", [id, serviceId]);
  refreshPublicPages();
  return songsOf(serviceId);
}

/** Swaps a song with the one above (-1) or below (+1) it. */
export async function moveServiceSongAdmin(serviceId: string, id: string, direction: -1 | 1) {
  await requireSongsAdmin();
  requireId(serviceId);
  const songs = await songsOf(serviceId);
  const i = songs.findIndex((s) => s.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= songs.length) return songs;
  await batch("app", [
    { sql: "UPDATE sotw_service_songs SET position = ? WHERE id = ?", params: [songs[j].position, songs[i].id] },
    { sql: "UPDATE sotw_service_songs SET position = ? WHERE id = ?", params: [songs[i].position, songs[j].id] },
  ]);
  refreshPublicPages();
  return songsOf(serviceId);
}

// ─── During the service ──────────────────────────────────────────────────────

/** Marks one song. Only one song is live at a time: going live marks the old one sung. */
export async function setServiceSongStatus(serviceId: string, id: string, status: SongStatus) {
  await requireSongsAdmin();
  requireId(serviceId);
  requireId(id);
  if (!STATUSES.includes(status)) throw new Error("Invalid status");
  await batch("app", [
    ...(status === "live"
      ? [{ sql: "UPDATE sotw_service_songs SET status = 'sung' WHERE service_id = ? AND status = 'live'", params: [serviceId] }]
      : []),
    { sql: "UPDATE sotw_service_songs SET status = ? WHERE id = ? AND service_id = ?", params: [status, id, serviceId] },
  ]);
  refreshPublicPages();
  return songsOf(serviceId);
}

/** The live song is sung; the first song not yet sung goes live. */
export async function nextServiceSong(serviceId: string) {
  await requireSongsAdmin();
  requireId(serviceId);
  await batch("app", [
    { sql: "UPDATE sotw_service_songs SET status = 'sung' WHERE service_id = ? AND status = 'live'", params: [serviceId] },
    {
      sql: `UPDATE sotw_service_songs SET status = 'live' WHERE id = (
              SELECT id FROM sotw_service_songs WHERE service_id = ? AND status = 'upcoming' ORDER BY position LIMIT 1)`,
      params: [serviceId],
    },
  ]);
  refreshPublicPages();
  return songsOf(serviceId);
}

export async function resetServiceStatuses(serviceId: string) {
  await requireSongsAdmin();
  requireId(serviceId);
  await query("app", "UPDATE sotw_service_songs SET status = 'upcoming' WHERE service_id = ?", [serviceId]);
  refreshPublicPages();
  return songsOf(serviceId);
}
