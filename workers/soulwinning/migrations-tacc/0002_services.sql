-- Live Services: a playlist of the songs for one service, in the order they
-- will be sung. During the service an admin marks which song is live and which
-- have been sung; the public playlist page follows along.

CREATE TABLE sotw_services (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  title TEXT NOT NULL,
  service_date TEXT NOT NULL,            -- YYYY-MM-DD
  cover_image_url TEXT,                  -- every song in the service uses it
  is_published INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX sotw_services_date_idx ON sotw_services (is_published, service_date DESC);

CREATE TABLE sotw_service_songs (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES sotw_services (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  lyrics TEXT NOT NULL DEFAULT '',
  audio_url TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'sung'))
);
CREATE INDEX sotw_service_songs_order_idx ON sotw_service_songs (service_id, position);
