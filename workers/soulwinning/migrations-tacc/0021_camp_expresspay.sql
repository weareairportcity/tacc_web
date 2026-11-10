-- Commune moves from Paystack to expressPay (Nov 2026). Old Paystack rows stay
-- as history (provider = 'paystack'); new ones are written with 'expresspay'.
-- Undo with migrations-tacc/down/0021_camp_expresspay.down.sql.

-- camps.fee_bps is now the fee for expressPay's own checkout page (card, or
-- MoMo picked there). momo_fee_bps is for MoMo started from Commune itself
-- (expressPay's Direct API), where we know the method before charging.
ALTER TABLE camps ADD COLUMN momo_fee_bps INTEGER NOT NULL DEFAULT 195 CHECK (momo_fee_bps BETWEEN 0 AND 2000);
UPDATE camps SET momo_fee_bps = fee_bps;

-- expressPay's token for a checkout: its query endpoint needs it, not our reference.
ALTER TABLE camp_payments ADD COLUMN provider_token TEXT;
-- 'momo' when the person paid by MoMo from Commune; NULL for expressPay's page.
ALTER TABLE camp_payments ADD COLUMN method TEXT;

ALTER TABLE camp_bulk_payments ADD COLUMN provider TEXT NOT NULL DEFAULT 'paystack';
ALTER TABLE camp_bulk_payments ADD COLUMN provider_token TEXT;

-- "Check all with expressPay" reads a camp's payments from the last 30 days.
CREATE INDEX camp_payments_created_idx ON camp_payments (created_at);
