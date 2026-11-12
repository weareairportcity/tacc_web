import { query } from "@/lib/cf";
import { toCsv } from "./csv";

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

// ─── Coordinators: every receipt for a camp ─────────────────────────────────

export type ReceiptFilters = {
  /** Name, payer or reference. */
  q: string;
  /** "momo" | "card" | "" */
  method: string;
  /** "self" (the attendee), "link" (someone via the pay link), "staff" (a coordinator or leader), or "". */
  who: string;
  /** YYYY-MM-DD, Ghana time, inclusive. */
  from: string;
  to: string;
};

export type ReceiptRow = {
  reference: string;
  paid_at: string;
  registration_id: string;
  full_name: string;
  room_type_name: string;
  fellowship: string;
  payer: string;
  who: "self" | "link" | "staff";
  method: string | null;
  amount_pesewas: number;
  fee_pesewas: number;
  charged_pesewas: number;
  /** Their price and what they've paid now, for "left to pay" on the receipt. */
  price_pesewas: number;
  paid_pesewas: number;
  transaction_id: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseReceiptFilters(raw: Record<string, string | string[] | undefined>): ReceiptFilters {
  const one = (k: string) => {
    const v = raw[k];
    return String(Array.isArray(v) ? v[0] : (v ?? "")).trim();
  };
  const method = one("method");
  const who = one("who");
  return {
    q: one("q").slice(0, 80),
    method: method === "momo" || method === "card" ? method : "",
    who: who === "self" || who === "link" || who === "staff" ? who : "",
    from: DAY.test(one("from")) ? one("from") : "",
    to: DAY.test(one("to")) ? one("to") : "",
  };
}

export const receiptQuery = (f: ReceiptFilters) => new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

/** Successful payments for a camp, newest first. Shares of a coordinator's payment count as their own receipts. */
export async function listReceipts(campId: string, f: ReceiptFilters): Promise<ReceiptRow[]> {
  const where = ["r.camp_id = ?", "p.status = 'success'"];
  const params: unknown[] = [campId];
  if (f.q) {
    where.push("(r.full_name LIKE ? OR p.payer_name LIKE ? OR p.reference LIKE ? OR b.paid_by LIKE ?)");
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    params.push(like, like, like.toUpperCase(), like);
  }
  if (f.method) {
    where.push("p.method = ?");
    params.push(f.method);
  }
  if (f.who === "staff") where.push("p.bulk_id IS NOT NULL");
  if (f.who === "link") where.push("p.bulk_id IS NULL AND COALESCE(p.payer_name, '') <> '' AND p.payer_name <> r.full_name");
  if (f.who === "self") where.push("p.bulk_id IS NULL AND (COALESCE(p.payer_name, '') = '' OR p.payer_name = r.full_name)");
  // Days are Ghana days; Ghana is on UTC all year.
  if (f.from) {
    where.push("substr(COALESCE(p.paid_at, p.created_at), 1, 10) >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("substr(COALESCE(p.paid_at, p.created_at), 1, 10) <= ?");
    params.push(f.to);
  }
  const rows = await query<{
    reference: string;
    paid_at: string;
    registration_id: string;
    full_name: string;
    room_type_name: string;
    fellowship: string;
    payer_name: string | null;
    paid_by: string | null;
    method: string | null;
    amount_pesewas: number;
    fee_pesewas: number;
    charged_pesewas: number;
    price_pesewas: number;
    paid_pesewas: number;
    transaction_id: string | null;
  }>(
    "app",
    `SELECT p.reference, COALESCE(p.paid_at, p.created_at) AS paid_at, p.registration_id, r.full_name, t.name AS room_type_name, r.fellowship,
            p.payer_name, b.paid_by, p.method, p.amount_pesewas, p.fee_pesewas, p.charged_pesewas, r.price_pesewas, r.paid_pesewas,
            COALESCE(json_extract(p.raw_json, '$."transaction-id"'), json_extract(b.raw_json, '$."transaction-id"')) AS transaction_id
     FROM camp_payments p
     JOIN camp_registrations r ON r.id = p.registration_id
     JOIN camp_room_types t ON t.id = r.room_type_id
     LEFT JOIN camp_bulk_payments b ON b.id = p.bulk_id
     WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(p.paid_at, p.created_at) DESC
     LIMIT 2000`,
    params,
  );
  return rows.map((x) => {
    const payer = (x.payer_name ?? "").trim();
    const who: ReceiptRow["who"] = x.paid_by ? "staff" : payer && payer !== x.full_name ? "link" : "self";
    return {
      reference: x.reference,
      paid_at: x.paid_at,
      registration_id: x.registration_id,
      full_name: x.full_name,
      room_type_name: x.room_type_name,
      fellowship: x.fellowship,
      payer: who === "staff" ? staffWords(x.paid_by!, payer) : who === "link" ? payer : x.full_name,
      who,
      method: x.method,
      amount_pesewas: x.amount_pesewas,
      fee_pesewas: x.fee_pesewas,
      charged_pesewas: x.charged_pesewas,
      price_pesewas: x.price_pesewas,
      paid_pesewas: x.paid_pesewas,
      transaction_id: x.transaction_id ? String(x.transaction_id) : null,
    };
  });
}

/** "Qadash leader", "kwame (Zion fund)": who paid for several people, in words. */
function staffWords(paidBy: string, note: string) {
  const leader = paidBy.match(/^leader:(?:fellowship|pfcc):(.+)$/);
  const who = leader ? `${leader[1]} leader` : paidBy.split("@")[0];
  return note && note !== paidBy ? `${who} (${note})` : who;
}

export const WHO_WORDS: Record<ReceiptRow["who"], string> = { self: "Themselves", link: "Pay link", staff: "Coordinator or leader" };
const METHOD_WORDS: Record<string, string> = { momo: "Mobile money", card: "Card" };
export const methodWords = (m: string | null) => (m ? (METHOD_WORDS[m] ?? m) : "");

export function receiptsCsv(rows: ReceiptRow[], origin: string) {
  const cedis = (p: number) => (p / 100).toFixed(2);
  return toCsv([
    ["Date (Ghana)", "Receipt no.", "Attendee", "Room type", "Fellowship", "Paid by", "Who paid", "Paid with", "Towards camp (GHS)", "Fee (GHS)", "Total paid (GHS)", "expressPay ref.", "Receipt link"],
    ...rows.map((r) => [
      r.paid_at.slice(0, 16).replace("T", " "),
      r.reference,
      r.full_name,
      r.room_type_name,
      r.fellowship,
      r.payer,
      WHO_WORDS[r.who],
      methodWords(r.method),
      cedis(r.amount_pesewas),
      cedis(r.fee_pesewas),
      cedis(r.charged_pesewas),
      r.transaction_id ?? "",
      `${origin}/camps/r/${r.reference}`,
    ]),
  ]);
}
