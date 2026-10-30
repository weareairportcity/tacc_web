-- A phone number for "Need help? Call or WhatsApp a coordinator" on every
-- attendee page. Empty hides the buttons. Undo with
-- migrations-tacc/down/0019_camp_help_phone.down.sql.
ALTER TABLE camps ADD COLUMN help_phone TEXT NOT NULL DEFAULT '';
