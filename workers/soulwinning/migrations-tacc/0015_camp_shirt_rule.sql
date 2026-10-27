-- T-shirts only for people who've paid in full, unless a coordinator turns
-- it off in Settings. On (1) by default. Undo with
-- migrations-tacc/down/0015_camp_shirt_rule.down.sql.
ALTER TABLE camps ADD COLUMN shirt_paid_only INTEGER NOT NULL DEFAULT 1;
