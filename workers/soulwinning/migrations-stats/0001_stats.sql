-- Commune's usage counts, kept in their own database (tacc_stats) so they can
-- never fill the camp database. Totals, not people: a visit has no name,
-- phone, sign-in or address on it, only what screen, device and place.
-- Visits and errors are deleted after 90 days; daily totals are kept.

-- One row per visit (from opening Commune until the phone puts it away),
-- sent by the page in one go when the visit ends (POST /v1/c/v).
CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  day TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
  area TEXT NOT NULL,            -- attendee | leader | coordinator
  camp TEXT NOT NULL DEFAULT '', -- slug or id from the address
  dur_ms INTEGER NOT NULL,
  flow TEXT NOT NULL,            -- JSON: the screens in order, e.g. ["/:camp","/:camp/me"]
  taps TEXT NOT NULL DEFAULT '{}', -- JSON: {"Pay all now": 2}
  errors INTEGER NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  network TEXT NOT NULL DEFAULT '', -- e.g. MTN Ghana (from the internet address)
  conn TEXT NOT NULL DEFAULT '',    -- 4g, 3g, wifi (Android Chrome only)
  lang TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',  -- phone | tablet | computer
  os TEXT NOT NULL DEFAULT '',
  os_version TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  src TEXT NOT NULL DEFAULT '',     -- ?src= on the link, or where they came from
  ttfb_ms INTEGER,
  load_ms INTEGER,
  lcp_ms INTEGER,
  nav_ms INTEGER,                   -- average time to change screen
  tap_ms INTEGER                    -- average time for a button's action
);
CREATE INDEX visits_day_idx ON visits (day);

CREATE TABLE errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  day TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
  area TEXT NOT NULL,
  screen TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT ''
);
CREATE INDEX errors_day_idx ON errors (day);

-- Totals per day, added up once the day is over: dim is what's counted
-- (country, screen, tap, flow…), key the value, n how many, ms a total time.
CREATE TABLE daily (
  day TEXT NOT NULL,
  area TEXT NOT NULL,
  dim TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL,
  ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, area, dim, key)
) WITHOUT ROWID;

-- Small settings: how far the totals are added up, and "paused" when the
-- free daily limits are close.
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
