-- After a full payment, attendees can rate the checkout (1–5 stars, optional
-- comment when they pick 1 or 2). One row per registration. Separate from
-- after-camp camp_feedback, which is anonymous and opens on the last day.
-- Undo with migrations-tacc/down/0024_camp_pay_experience.down.sql.

CREATE TABLE camp_pay_experience (
  registration_id TEXT PRIMARY KEY REFERENCES camp_registrations (id) ON DELETE CASCADE,
  camp_id TEXT NOT NULL REFERENCES camps (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT ''
);
CREATE INDEX camp_pay_experience_camp_idx ON camp_pay_experience (camp_id, created_at);
