import { post, query } from "@/lib/cf";
import { checkId, getCamp } from "./camps";
import { CampError, type PaymentStatus } from "./types";

/**
 * The pilot's acceptance check: every camp payment the app knows about
 * against Paystack's own transaction list, one by one. "Reconciles exactly"
 * means `problems` is empty. Read-only on both sides.
 */

type PaystackTx = { reference: string; amount: number; currency: string; status: string; paid_at: string | null };

type OurPayment = {
  reference: string;
  full_name: string;
  amount_pesewas: number;
  charged_pesewas: number;
  status: PaymentStatus;
  flag: string | null;
};

export type ReconciliationProblem = {
  reference: string;
  full_name: string | null;
  ours: string;
  paystack: string;
  issue: string;
};

export type Reconciliation = {
  checked: number;
  matched: number;
  /** Paid on Paystack after the balance was covered: known, waiting for a refund. */
  awaitingRefund: number;
  problems: ReconciliationProblem[];
  /** False if Paystack had more pages than we read; widen the check before trusting it. */
  complete: boolean;
};

const describe = (tx: PaystackTx | undefined) => (tx ? `${tx.status}, ${tx.currency} ${(tx.amount / 100).toFixed(2)}` : "not found");

export async function reconcileWithPaystack(campId: string, now = new Date()): Promise<Reconciliation> {
  const camp = await getCamp(checkId(campId, "camp"));
  if (!camp) throw new CampError("Unknown camp.");

  const [ours, { transactions, complete }] = await Promise.all([
    query<OurPayment>(
      "app",
      `SELECT * FROM (
         SELECT p.reference, r.full_name, p.amount_pesewas, p.charged_pesewas, p.status, p.flag, p.created_at
         FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
         -- Sample payments (test camps) never went through Paystack, so there's nothing to check them against.
         -- A coordinator's payment for several people is one Paystack transaction: compare the bulk row, not its shares.
         WHERE r.camp_id = ?1 AND p.provider <> 'sample' AND p.bulk_id IS NULL
         UNION ALL
         SELECT b.reference, (SELECT COUNT(*) FROM camp_payments s WHERE s.bulk_id = b.id) || ' people, paid by ' || b.paid_by,
           b.amount_pesewas, b.charged_pesewas, b.status, b.flag, b.created_at
         FROM camp_bulk_payments b WHERE b.camp_id = ?1)
       ORDER BY created_at`,
      [camp.id],
    ),
    post<{ transactions: PaystackTx[]; complete: boolean }>("/v1/admin/camp/paystack-transactions", {
      // A day either side, for time zones and late payments.
      from: new Date(Date.parse(camp.created_at) - 86_400_000).toISOString(),
      to: new Date(now.getTime() + 86_400_000).toISOString(),
    }),
  ]);

  const paystack = new Map(transactions.map((t) => [t.reference, t]));
  const problems: ReconciliationProblem[] = [];
  let matched = 0;
  let awaitingRefund = 0;

  for (const p of ours) {
    const tx = paystack.get(p.reference);
    paystack.delete(p.reference);
    const paidThere = tx?.status === "success";
    const rightAmount = tx?.amount === p.charged_pesewas && tx?.currency === "GHS";
    const problem = (issue: string) =>
      problems.push({
        reference: p.reference,
        full_name: p.full_name,
        ours: `${p.status}${p.flag ? ` (${p.flag.replace("_", " ")})` : ""}, GHS ${(p.charged_pesewas / 100).toFixed(2)}`,
        paystack: describe(tx),
        issue,
      });

    if (p.status === "success") {
      if (!paidThere) problem("Credited here but not paid on Paystack.");
      else if (!rightAmount) problem("Credited here, but Paystack's amount differs.");
      else matched++;
    } else if (paidThere) {
      if (p.flag === "over_balance") awaitingRefund++;
      else if (p.flag === "amount_mismatch") problem("Paid on Paystack with the wrong amount: refund it.");
      else problem("Paid on Paystack but not credited here.");
    } else {
      matched++;
    }
  }

  // Camp references Paystack has that no camp here does.
  if (paystack.size) {
    const known = new Set(
      (
        await query<{ reference: string }>(
          "app",
          `SELECT reference FROM camp_payments WHERE reference IN (SELECT value FROM json_each(?1))
           UNION SELECT reference FROM camp_bulk_payments WHERE reference IN (SELECT value FROM json_each(?1))`,
          [JSON.stringify([...paystack.keys()])],
        )
      ).map((r) => r.reference),
    );
    for (const tx of paystack.values()) {
      if (known.has(tx.reference) || tx.status !== "success") continue;
      problems.push({ reference: tx.reference, full_name: null, ours: "not found", paystack: describe(tx), issue: "Paid on Paystack but unknown here." });
    }
  }

  // Shares of a paid bulk checkout that no longer fitted a balance: known, waiting for a refund.
  const [shares] = await query<{ n: number }>(
    "app",
    `SELECT COUNT(*) AS n FROM camp_payments p JOIN camp_bulk_payments b ON b.id = p.bulk_id
     WHERE b.camp_id = ? AND b.status = 'success' AND p.flag = 'over_balance'`,
    [camp.id],
  );
  awaitingRefund += shares?.n ?? 0;

  return { checked: ours.length, matched, awaitingRefund, problems, complete };
}
