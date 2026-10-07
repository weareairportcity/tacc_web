import { query } from "./cf";

/**
 * Live Services on Cloudflare D1 (database "tacc"): a service's songs in the
 * order they will be sung, each upcoming, live or sung. Public pages read here
 * on the server; the admin writes through app/admin/songs/service-actions.ts.
 */

export type SongStatus = "upcoming" | "live" | "sung";

export type ServiceSong = {
  id: string;
  service_id: string;
  position: number;
  title: string;
  artist: string;
  lyrics: string;
  audio_url: string | null;
  source_url: string | null;
  status: SongStatus;
};

export type Service = {
  id: string;
  title: string;
  service_date: string;
  cover_image_url: string | null;
  is_published: boolean;
};

export type ServiceWithSongs = Service & { songs: ServiceSong[] };

type ServiceRow = Omit<Service, "is_published"> & { is_published: number };

const toService = (row: ServiceRow): Service => ({ ...row, is_published: row.is_published === 1 });

// Public reads are cached for a minute; admin changes revalidate the tag.
export const SERVICES_TAG = "services";
const PUBLIC_CACHE = { revalidate: 60, tags: [SERVICES_TAG] };

export const SERVICE_COLUMNS = "id, title, service_date, cover_image_url, is_published";
export const SERVICE_SONG_COLUMNS =
  "id, service_id, position, title, artist, lyrics, audio_url, source_url, status";

export const isServiceId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** Services with their songs, latest first. Admin sees drafts; the public only published. */
export async function getServices(onlyPublished = false): Promise<ServiceWithSongs[]> {
  try {
    const [services, songs] = await Promise.all([
      query<ServiceRow>(
        "app",
        `SELECT ${SERVICE_COLUMNS} FROM sotw_services ${onlyPublished ? "WHERE is_published = 1" : ""}
         ORDER BY service_date DESC, created_at DESC`,
        [],
        PUBLIC_CACHE,
      ),
      query<ServiceSong>(
        "app",
        `SELECT ${SERVICE_SONG_COLUMNS} FROM sotw_service_songs
         ${onlyPublished ? "WHERE service_id IN (SELECT id FROM sotw_services WHERE is_published = 1)" : ""}
         ORDER BY service_id, position`,
        [],
        PUBLIC_CACHE,
      ),
    ]);
    return services.map((s) => ({ ...toService(s), songs: songs.filter((song) => song.service_id === s.id) }));
  } catch (error) {
    console.error("Error fetching services:", error);
    return [];
  }
}

export async function getServiceById(id: string): Promise<ServiceWithSongs | null> {
  if (!isServiceId(id)) return null;
  try {
    const [[service], songs] = await Promise.all([
      query<ServiceRow>("app", `SELECT ${SERVICE_COLUMNS} FROM sotw_services WHERE id = ?`, [id], PUBLIC_CACHE),
      query<ServiceSong>(
        "app",
        `SELECT ${SERVICE_SONG_COLUMNS} FROM sotw_service_songs WHERE service_id = ? ORDER BY position`,
        [id],
        PUBLIC_CACHE,
      ),
    ]);
    return service ? { ...toService(service), songs } : null;
  } catch (error) {
    console.error("Error fetching service:", error);
    return null;
  }
}

/** Just the statuses, uncached: the live feed the playlist page polls. */
export async function getServiceStatuses(id: string) {
  return query<{ id: string; status: SongStatus }>(
    "app",
    `SELECT s.id, s.status FROM sotw_service_songs s
     JOIN sotw_services v ON v.id = s.service_id AND v.is_published = 1
     WHERE s.service_id = ? ORDER BY s.position`,
    [id],
  );
}
