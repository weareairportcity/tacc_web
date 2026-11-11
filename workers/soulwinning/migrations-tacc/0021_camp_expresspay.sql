-- Commune moves from Paystack to expressPay (Nov 2026). Old Paystack rows stay
-- as history (provider = 'paystack'); new ones are written with 'expresspay'.
-- Undo with migrations-tacc/down/0021_camp_expresspay.down.sql.

-- The payer says MoMo or card before going to expressPay, and pays that fee:
-- camps.fee_bps for card (2.5% covers international cards; local are 1.95%),
-- momo_fee_bps for MoMo (1.5%). expressPay's rates, Nov 2026.
ALTER TABLE camps ADD COLUMN momo_fee_bps INTEGER NOT NULL DEFAULT 150 CHECK (momo_fee_bps BETWEEN 0 AND 2000);
UPDATE camps SET fee_bps = MAX(fee_bps, 250);

-- expressPay's token for a checkout: its query endpoint needs it, not our reference.
ALTER TABLE camp_payments ADD COLUMN provider_token TEXT;
-- 'momo' or 'card': how the payer said they'd pay (sets the fee). NULL on old rows.
ALTER TABLE camp_payments ADD COLUMN method TEXT;

ALTER TABLE camp_bulk_payments ADD COLUMN provider TEXT NOT NULL DEFAULT 'paystack';
ALTER TABLE camp_bulk_payments ADD COLUMN provider_token TEXT;

-- "Check all with expressPay" reads a camp's payments from the last 30 days.
CREATE INDEX camp_payments_created_idx ON camp_payments (created_at);
