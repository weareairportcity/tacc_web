-- Church app data on Cloudflare D1 (database "tacc"), separate from the soul
-- winning campaign database. Starts with Song of the Week, moved off Supabase.

CREATE TABLE sotw_songs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  week_label TEXT NOT NULL,
  publish_date TEXT NOT NULL,            -- YYYY-MM-DD
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  lyrics TEXT NOT NULL,
  audio_url TEXT,
  cover_image_url TEXT,
  source_url TEXT,
  is_published INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX sotw_songs_publish_idx ON sotw_songs (is_published, publish_date DESC);

-- Page views, plays and repeats. Written straight from the browser to the
-- Worker, so a play costs no Vercel function.
CREATE TABLE sotw_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  song_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'play', 'repeat')),
  visitor_id TEXT NOT NULL
);
CREATE INDEX sotw_events_song_idx ON sotw_events (song_id, event_type);
CREATE INDEX sotw_events_created_idx ON sotw_events (created_at);
