import { query } from "@/lib/cf";
import { checkId, getCamp } from "./camps";
import { askExpressPay } from "./payments";
import { addReports, CHECK_CHUNK, CHECK_DAYS, compare, emptyReport, type OurPayment, type Reconciliation } from "./reconciliation-shared";
import { CampError } from "./types";

export { addReports, CHECK_CHUNK, CHECK_DAYS, compare, emptyReport, type Reconciliation, type ReconciliationProblem } from "./reconciliation-shared";

/**
 * "Check all with expressPay": every camp payment from the last 30 days
 * against what expressPay says about it, one by one. expressPay has no way to
 * list transactions, but every camp payment starts in Commune with our
 * reference and expressPay's token, so asking about each one finds the cases
 * that matter: paid there but not credited here, credited here but not paid
 * there, and the wrong amount. Read-only on both sides; the 10-minute check
 * and the notice do the crediting.
 */

/**
 * The camp's expressPay payments from the last 30 days, oldest first. A
 * coordinator's payment for several people is one expressPay payment, so the
 * bulk row is checked, not its shares. Sample payments never went anywhere.
 */
export async function paymentsToCheck(campId: string, now = new Date()): Promise<string[]> {
  const camp = await getCamp(checkId(campId, "camp"));
  if (!camp) throw new CampError("Unknown camp.");
  const since = new Date(now.getTime() - CHECK_DAYS * 86_400_000).toISOString();
  const rows = await query<{ reference: string }>(
    "app",
    `SELECT reference FROM (
       SELECT p.reference, p.created_at FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
       WHERE r.camp_id = ?1 AND p.provider = 'expresspay' AND p.bulk_id IS NULL AND p.created_at >= ?2
       UNION ALL
       SELECT b.reference, b.created_at FROM camp_bulk_payments b WHERE b.camp_id = ?1 AND b.provider = 'expresspay' AND b.created_at >= ?2)
     ORDER BY created_at`,
    [camp.id, since],
  );
  return rows.map((r) => r.reference);
}

/** Checks up to CHECK_CHUNK of this camp's payments. References from another camp are ignored. */
export async function checkChunk(campId: string, references: string[]): Promise<Reconciliation> {
  const refs = [...new Set(references.map(String))].filter((r) => /^CAMP-[0-9A-Z-]{6,40}$/.test(r)).slice(0, CHECK_CHUNK);
  const report = emptyReport();
  if (!refs.length) return report;
  const ours = await query<OurPayment>(
    "app",
    `SELECT p.reference, r.full_name, p.charged_pesewas, p.status, p.flag
     FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
     WHERE r.camp_id = ?1 AND p.bulk_id IS NULL AND p.reference IN (SELECT value FROM json_each(?2))
     UNION ALL
     SELECT b.reference, (SELECT COUNT(*) FROM camp_payments s WHERE s.bulk_id = b.id) || ' people, paid by ' || b.paid_by,
       b.charged_pesewas, b.status, b.flag
     FROM camp_bulk_payments b WHERE b.camp_id = ?1 AND b.reference IN (SELECT value FROM json_each(?2))`,
    [checkId(campId, "camp"), JSON.stringify(refs)],
  );
  if (!ours.length) return report;
  const answers = new Map((await askExpressPay(ours.map((p) => p.reference))).map((a) => [a.reference, a]));
  for (const p of ours) compare(p, answers.get(p.reference), report);
  return report;
}

/** The whole check in one go (tests, scripts). The Money page runs it a chunk at a time to show progress. */
export async function checkWithExpressPay(campId: string, now = new Date()): Promise<Reconciliation> {
  const refs = await paymentsToCheck(campId, now);
  let report = emptyReport();
  for (let i = 0; i < refs.length; i += CHECK_CHUNK) report = addReports(report, await checkChunk(campId, refs.slice(i, i + CHECK_CHUNK)));
  return report;
}
