-- Complaints: an attendee reports a problem in words, with an optional small
-- photo. Coordinators and the person's fellowship, group and PFCC leaders are
-- told; a coordinator marks it resolved and the person is thanked. No texts.
-- Undo with migrations-tacc/down/0036_camp_complaints.down.sql.
CREATE TABLE camp_complaints (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES camp_registrations (id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 3 AND 2000),
  -- A downsized photo in R2 (an unguessable address), or empty.
  photo_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at TEXT,
  -- A coordinator's email.
  resolved_by TEXT,
  resolution_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX camp_complaints_camp_idx ON camp_complaints (camp_id, status, created_at);
CREATE INDEX camp_complaints_person_idx ON camp_complaints (registration_id, created_at);
