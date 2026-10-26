-- After camp: a thank-you text with a feedback link, and the answers.
-- camp_feedback has no registration id on purpose: answers are anonymous.
-- camp_feedback_invites says who was texted and who has answered (so nobody
-- is texted twice or answers twice) without saying which answer is theirs.
-- Undo with migrations-tacc/down/0014_camp_feedback.down.sql.

CREATE TABLE camp_feedback (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL REFERENCES camps(id),
  -- The day only, so an answer can't be matched to an invite by its time.
  created_on TEXT NOT NULL DEFAULT (date('now')),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  best TEXT NOT NULL DEFAULT '',
  change TEXT NOT NULL DEFAULT ''
);
CREATE INDEX camp_feedback_camp_idx ON camp_feedback (camp_id);

CREATE TABLE camp_feedback_invites (
  camp_id TEXT NOT NULL REFERENCES camps(id),
  registration_id TEXT NOT NULL REFERENCES camp_registrations(id),
  texted_at TEXT,
  texted_by TEXT,
  answered INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (camp_id, registration_id)
);
