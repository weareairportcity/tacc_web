import { query } from "@/lib/cf";

/**
 * A receipt for one successful payment, found by its reference. The
 * reference (CAMP- and 16 random hex characters) is the key: anyone with the
 * link can see the receipt, as with a paper one, and nothing else.
 */

export type Receipt = {
  reference: string;
  amount_pesewas: number;
  fee_pesewas: number;
  charged_pesewas: number;
  paid_at: string;
  payer_name: string | null;
  bulk: boolean;
  /** "momo" or "card", as chosen before paying; null on older payments. */
  method: string | null;
  full_name: string;
  room_type_name: string;
  price_pesewas: number;
  paid_pesewas: number;
  camp_name: string;
  camp_slug: string;
  starts_on: string;
  ends_on: string;
  transaction_id: string | null;
};

/** A payment: CAMP-<16 hex>, or a share of a coordinator's payment, CAMP-B<16 hex>-<n>. */
const REFERENCE = /^CAMP-(B[0-9A-F]{16}-\d{1,3}|[0-9A-F]{16})$/;

export async function getReceipt(reference: string): Promise<Receipt | null> {
  const ref = String(reference ?? "").toUpperCase();
  if (!REFERENCE.test(ref)) return null;
  const [row] = await query<Omit<Receipt, "bulk" | "transaction_id"> & { bulk_id: string | null; raw_json: string | null }>(
    "app",
    `SELECT p.reference, p.amount_pesewas, p.fee_pesewas, p.charged_pesewas, COALESCE(p.paid_at, p.created_at) AS paid_at, p.payer_name, p.method,
            p.bulk_id, p.raw_json, r.full_name, t.name AS room_type_name, r.price_pesewas, r.paid_pesewas,
            c.name AS camp_name, c.slug AS camp_slug, c.starts_on, c.ends_on
     FROM camp_payments p
     JOIN camp_registrations r ON r.id = p.registration_id
     JOIN camps c ON c.id = r.camp_id
     JOIN camp_room_types t ON t.id = r.room_type_id
     WHERE p.reference = ? AND p.status = 'success'`,
    [ref],
  );
  if (!row) return null;
  let transaction: string | null = null;
  try {
    const raw = JSON.parse(row.raw_json ?? "{}");
    transaction = String(raw["transaction-id"] ?? raw.transaction_id ?? "") || null;
  } catch {}
  const { bulk_id, raw_json: _raw, ...rest } = row;
  void _raw;
  return { ...rest, bulk: Boolean(bulk_id), transaction_id: transaction };
}
