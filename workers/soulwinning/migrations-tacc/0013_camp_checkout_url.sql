-- Paystack's checkout link for a payment, kept while it's pending, so someone
-- who closed the checkout can go back to it ("Resume payment") instead of
-- waiting for it to time out.
ALTER TABLE camp_payments ADD COLUMN checkout_url TEXT;
ALTER TABLE camp_bulk_payments ADD COLUMN checkout_url TEXT;
