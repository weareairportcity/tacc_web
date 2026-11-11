-- Some camps have no camp T-shirt (Nov 2026). shirts_on = 0 hides the size
-- question when registering, on their details, and the T-shirt scanning.
-- Undo with migrations-tacc/down/0023_camp_shirts_switch.down.sql.
ALTER TABLE camps ADD COLUMN shirts_on INTEGER NOT NULL DEFAULT 1 CHECK (shirts_on IN (0, 1));
