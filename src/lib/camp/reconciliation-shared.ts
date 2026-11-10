import type { ProviderAnswer } from "./payments";
import type { PaymentStatus } from "./types";

/**
 * The pure part of "Check all with expressPay" (src/lib/camp/reconciliation.ts):
 * comparing one payment with expressPay's answer, and adding chunks up. Kept
 * apart so the Money page's client component can sum the chunks it runs.
 */

export const CHECK_DAYS = 30;
/** References per call to the Worker (it allows 40). */
export const CHECK_CHUNK = 25;

export type OurPayment = {
  reference: string;
  full_name: string;
  charged_pesewas: number;
  status: PaymentStatus;
  flag: string | null;
};

export type ReconciliationProblem = {
  reference: string;
  full_name: string;
  ours: string;
  expresspay: string;
  issue: string;
};

export type Reconciliation = {
  checked: number;
  matched: number;
  /** Paid after the balance was covered: known, waiting for a refund. */
  awaitingRefund: number;
  /** MoMo still waiting for approval on a phone. */
  waiting: number;
  /** expressPay didn't answer for these; check again. */
  unanswered: number;
  problems: ReconciliationProblem[];
};

export const emptyReport = (): Reconciliation => ({ checked: 0, matched: 0, awaitingRefund: 0, waiting: 0, unanswered: 0, problems: [] });

export function addReports(a: Reconciliation, b: Reconciliation): Reconciliation {
  return {
    checked: a.checked + b.checked,
    matched: a.matched + b.matched,
    awaitingRefund: a.awaitingRefund + b.awaitingRefund,
    waiting: a.waiting + b.waiting,
    unanswered: a.unanswered + b.unanswered,
    problems: [...a.problems, ...b.problems],
  };
}

const cedis = (pesewas: number) => `GHS ${(pesewas / 100).toFixed(2)}`;

const OUTCOME_WORDS: Record<ProviderAnswer["outcome"], string> = {
  approved: "approved",
  declined: "declined",
  waiting: "waiting for MoMo approval",
  unknown: "not paid",
  no_token: "never started",
  no_answer: "no answer",
};

const describe = (a: ProviderAnswer) =>
  a.outcome === "approved" || a.outcome === "declined" || a.outcome === "waiting"
    ? `${OUTCOME_WORDS[a.outcome]}${a.amount_pesewas !== null ? `, ${a.currency ?? "GHS"} ${(a.amount_pesewas / 100).toFixed(2)}` : ""}`
    : OUTCOME_WORDS[a.outcome];

/** One payment against expressPay's answer. Pure, so it's easy to test. */
export function compare(p: OurPayment, a: ProviderAnswer | undefined, into: Reconciliation) {
  into.checked++;
  const problem = (issue: string) =>
    into.problems.push({
      reference: p.reference,
      full_name: p.full_name,
      ours: `${p.status}${p.flag ? ` (${p.flag.replace(/_/g, " ")})` : ""}, ${cedis(p.charged_pesewas)}`,
      expresspay: a ? describe(a) : "not asked",
      issue,
    });
  if (!a || a.outcome === "no_answer") {
    into.unanswered++;
    return;
  }
  const paidThere = a.outcome === "approved";
  const rightAmount = paidThere && a.amount_pesewas === p.charged_pesewas && (a.currency ?? "GHS") === "GHS";

  if (p.status === "success") {
    if (!paidThere) problem("Credited here but not paid on expressPay.");
    else if (!rightAmount) problem("Credited here, but expressPay's amount is different.");
    else into.matched++;
  } else if (paidThere) {
    if (p.flag === "over_balance" && rightAmount) into.awaitingRefund++;
    else if (p.flag === "amount_mismatch" || !rightAmount) problem("Paid on expressPay with the wrong amount: send it back.");
    else problem("Paid on expressPay but not credited here.");
  } else if (a.outcome === "waiting" && p.status === "pending") {
    into.waiting++;
    into.matched++;
  } else {
    into.matched++;
  }
}

