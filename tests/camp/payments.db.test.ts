import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { post, query } from "@/lib/cf";
import { feeFor } from "@/lib/camp/money";
import { checkPayment, startPayment } from "@/lib/camp/payments";
import { cancelRegistration, getRegistration, listPayments } from "@/lib/camp/registrations";
import { CampError } from "@/lib/camp/types";
import { TEST_WORKER_URL } from "../setup/constants";
import { reconcileWithPaystack } from "@/lib/camp/reconciliation";
import { TEST_ALERT_PHONE } from "../setup/constants";
import { sendWebhook, setFailInitialize, setTransaction, smsSent, startFakePaystack, succeed, transactions } from "../setup/paystack";
import { ACTOR, registered } from "./helpers";

// Payments end to end: src/lib/camp → local Worker → fake Paystack, with
// webhooks signed like Paystack's. The Worker never reaches the real Paystack.

let paystack: Server;
beforeAll(async () => {
  paystack = await startFakePaystack();
});
afterAll(() => new Promise<void>((resolve) => paystack.close(() => resolve())));

const CALLBACK = "http://localhost:3000/camps/test/paid";
const pay = (registrationId: string, amount: number) => startPayment(registrationId, amount, CALLBACK);
const reconcileNow = () => post<Record<string, number>>("/v1/admin/camp/reconcile", { older_than_minutes: 0 });
const auditActions = async (entityId: string) =>
  (
    await query<{ action: string }>("app", "SELECT action FROM camp_audit_log WHERE entity_id = ? ORDER BY id", [entityId])
  ).map((r) => r.action);
const paymentId = async (reference: string) =>
  (await query<{ id: string }>("app", "SELECT id FROM camp_payments WHERE reference = ?", [reference]))[0].id;

describe("fees", () => {
  it("adds Paystack's fee so the church receives the full amount", () => {
    for (const amount of [100, 18000, 20000, 33333, 60000, 1_234_567]) {
      const fee = feeFor(amount, 195);
      // What Paystack keeps (1.95% of the total) never eats into the instalment.
      expect(Math.floor(((amount + fee) * (10000 - 195)) / 10000)).toBeGreaterThanOrEqual(amount);
    }
    expect(feeFor(20000, 195)).toBe(398);
    expect(feeFor(20000, 0)).toBe(0);
  });

  it("charges Paystack the instalment plus the same fee the attendee was shown", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 20000);
    expect(checkout).toMatchObject({ amount_pesewas: 20000, fee_pesewas: 398, charged_pesewas: 20398 });
    expect(transactions.get(checkout.reference)).toMatchObject({ amount: 20398, currency: "GHS", email: "ama@example.com" });
    // The Worker's copy of the formula agrees with the page's (each new checkout closes the last).
    for (const amount of [100, 18000, 33333, 60000]) {
      expect((await pay(id, amount)).fee_pesewas).toBe(feeFor(amount, 195));
    }
  });
});

describe("instalments", () => {
  it("move a registration from Registered to Partially paid to Fully paid", async () => {
    const { id } = await registered();
    expect((await getRegistration(id))?.status).toBe("registered");

    const first = await pay(id, 20000);
    succeed(first.reference);
    expect((await sendWebhook(first.reference)).status).toBe(200);
    expect(await getRegistration(id)).toMatchObject({ status: "partially_paid", paid_pesewas: 20000 });

    const second = await pay(id, 40000);
    succeed(second.reference);
    await sendWebhook(second.reference);
    expect(await getRegistration(id)).toMatchObject({ status: "fully_paid", paid_pesewas: 60000 });

    const payments = await listPayments(id);
    expect(payments.map((p) => p.status)).toEqual(["success", "success"]);
    expect(await auditActions(await paymentId(first.reference))).toEqual(["payment.success"]);
  });

  it("refuses a payment once fully paid", async () => {
    const { id } = await registered();
    const full = await pay(id, 60000);
    succeed(full.reference);
    await sendWebhook(full.reference);
    await expect(pay(id, 100)).rejects.toThrow("already fully paid");
  });
});

describe("webhook", () => {
  it("ignores duplicates, including several at once", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    succeed(checkout.reference);
    const responses = await Promise.all(Array.from({ length: 5 }, () => sendWebhook(checkout.reference)));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    await sendWebhook(checkout.reference);

    expect(await getRegistration(id)).toMatchObject({ status: "partially_paid", paid_pesewas: 30000 });
    expect(await auditActions(await paymentId(checkout.reference))).toEqual(["payment.success"]);
  });

  it("rejects a bad signature and changes nothing", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    succeed(checkout.reference);
    const res = await sendWebhook(checkout.reference, { secret: "sk_test_wrong" });
    expect(res.status).toBe(401);
    expect((await getRegistration(id))?.paid_pesewas).toBe(0);
  });

  it("doesn't trust the event: no credit until Paystack's verify says success", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    await sendWebhook(checkout.reference); // still "abandoned" on Paystack
    expect((await getRegistration(id))?.paid_pesewas).toBe(0);
    expect((await listPayments(id))[0].status).toBe("pending");
  });

  it("fails and flags a payment whose amount doesn't match", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    setTransaction(checkout.reference, { status: "success", amount: 100 });
    await sendWebhook(checkout.reference);

    expect((await getRegistration(id))?.paid_pesewas).toBe(0);
    expect((await listPayments(id))[0]).toMatchObject({ status: "failed", flag: "amount_mismatch" });
    expect(await auditActions(await paymentId(checkout.reference))).toEqual(["payment.flagged"]);
  });

  it("texts the coordinator when an amount doesn't match", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    setTransaction(checkout.reference, { status: "success", amount: 100 });
    await sendWebhook(checkout.reference);
    expect(smsSent.find((s) => s.message.includes(checkout.reference))).toEqual({
      recipient: [`233${TEST_ALERT_PHONE.slice(1)}`],
      message: `TACC camp: payment ${checkout.reference} needs a look (amount mismatch).`,
    });
  });

  it("fails a payment in the wrong currency", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    setTransaction(checkout.reference, { status: "success", currency: "NGN" });
    await sendWebhook(checkout.reference);
    expect((await listPayments(id))[0]).toMatchObject({ status: "failed", flag: "amount_mismatch" });
  });
});

describe("overpayment", () => {
  it("is rejected when starting a payment", async () => {
    const { id } = await registered();
    await expect(pay(id, 60001)).rejects.toThrow(CampError);
    await expect(pay(id, 60001)).rejects.toThrow("more than your balance");
    await expect(pay(id, 99)).rejects.toThrow("smallest payment");
    expect(await listPayments(id)).toEqual([]);
  });

  it("can't happen through two checkouts: an open one is closed first", async () => {
    const { id } = await registered();
    const stale = await pay(id, 60000);
    const fresh = await pay(id, 60000); // stale was never paid, so it's given up on
    expect((await listPayments(id)).find((p) => p.reference === stale.reference)?.status).toBe("failed");

    succeed(fresh.reference);
    await sendWebhook(fresh.reference);
    // The attendee then finishes the old checkout too: money taken, not credited, flagged for refund.
    succeed(stale.reference);
    await sendWebhook(stale.reference);

    expect(await getRegistration(id)).toMatchObject({ status: "fully_paid", paid_pesewas: 60000 });
    expect((await listPayments(id)).find((p) => p.reference === stale.reference)).toMatchObject({
      status: "failed",
      flag: "over_balance",
    });
  });

  it("still credits an old checkout paid late when it fits the balance", async () => {
    const { id } = await registered();
    const stale = await pay(id, 20000);
    await pay(id, 20000); // closes stale
    succeed(stale.reference);
    await sendWebhook(stale.reference);
    expect(await getRegistration(id)).toMatchObject({ paid_pesewas: 20000, status: "partially_paid" });
  });

  it("waits while mobile money is still processing", async () => {
    const { id } = await registered();
    const first = await pay(id, 20000);
    setTransaction(first.reference, { status: "ongoing" });
    await expect(pay(id, 20000)).rejects.toThrow("still processing");
  });

  it("is blocked by the database even if the code is bypassed", async () => {
    const { id } = await registered();
    const insert = (pid: string, ref: string) =>
      query(
        "app",
        `INSERT INTO camp_payments (id, registration_id, reference, amount_pesewas, fee_pesewas, charged_pesewas)
         VALUES (?, ?, ?, 40000, 0, 40000)`,
        [pid, id, ref],
      );
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    await insert(a, `RAW-${a}`);
    await insert(b, `RAW-${b}`);
    await query("app", "UPDATE camp_payments SET status = 'success' WHERE id = ?", [a]);
    await expect(query("app", "UPDATE camp_payments SET status = 'success' WHERE id = ?", [b])).rejects.toThrow();
    // And a success can't be undone.
    await expect(query("app", "UPDATE camp_payments SET status = 'failed' WHERE id = ?", [a])).rejects.toThrow();
  });
});

describe("reconciliation", () => {
  it("credits a payment whose webhook never arrived", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 25000);
    succeed(checkout.reference);
    const result = await reconcileNow();
    expect(result.success).toBeGreaterThanOrEqual(1);
    expect(await getRegistration(id)).toMatchObject({ status: "partially_paid", paid_pesewas: 25000 });
  });

  it("marks a failed Paystack charge as failed", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 25000);
    setTransaction(checkout.reference, { status: "failed" });
    await reconcileNow();
    expect((await listPayments(id))[0].status).toBe("failed");
  });

  it("leaves a recent unfinished checkout pending", async () => {
    const { id } = await registered();
    await pay(id, 25000);
    await reconcileNow();
    expect((await listPayments(id))[0].status).toBe("pending");
  });
});

describe("processing page check", () => {
  it("reports success and only for the attendee's own payment", async () => {
    const { id } = await registered();
    const other = await registered();
    const checkout = await pay(id, 25000);
    succeed(checkout.reference);
    expect(await checkPayment(id, checkout.reference)).toBe("success");
    await expect(checkPayment(other.id, checkout.reference)).rejects.toThrow();
  });
});

describe("failures", () => {
  it("records a payment Paystack wouldn't start, and lets the attendee retry", async () => {
    const { id } = await registered();
    setFailInitialize(true);
    try {
      await expect(pay(id, 20000)).rejects.toThrow("couldn't start");
    } finally {
      setFailInitialize(false);
    }
    expect((await listPayments(id))[0]).toMatchObject({ status: "failed", flag: "init_failed" });
    await expect(pay(id, 20000)).resolves.toMatchObject({ amount_pesewas: 20000 });
  });

  it("refuses payments on a cancelled registration", async () => {
    const { id } = await registered();
    await cancelRegistration(ACTOR, id);
    await expect(pay(id, 20000)).rejects.toThrow("cancelled");
    expect(await auditActions(id)).toEqual(["registration.create", "registration.cancel"]);
  });

  it("needs the admin secret to start a payment", async () => {
    const res = await fetch(`${TEST_WORKER_URL}/v1/admin/camp/pay-init`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});

describe("checking against Paystack", () => {
  it("reconciles exactly when every payment matches", async () => {
    const { camp, id } = await registered();
    const paid = await pay(id, 20000);
    succeed(paid.reference);
    await sendWebhook(paid.reference);
    await pay(id, 10000); // started, never paid: fine on both sides
    expect(await reconcileWithPaystack(camp.id)).toEqual({ checked: 2, matched: 2, awaitingRefund: 0, problems: [], complete: true });
  });

  it("lists a payment Paystack took that was never credited here", async () => {
    const { camp, id } = await registered();
    const missed = await pay(id, 20000);
    succeed(missed.reference); // no webhook, no reconcile job yet
    const report = await reconcileWithPaystack(camp.id);
    expect(report.problems).toEqual([
      {
        reference: missed.reference,
        full_name: "Ama Mensah",
        ours: "pending, GHS 203.98",
        paystack: "success, GHS 203.98",
        issue: "Paid on Paystack but not credited here.",
      },
    ]);
    // Once the webhook lands it reconciles.
    await sendWebhook(missed.reference);
    expect((await reconcileWithPaystack(camp.id)).problems).toEqual([]);
  });

  it("counts a late over-balance payment as waiting for a refund, not a mismatch", async () => {
    const { camp, id } = await registered();
    const stale = await pay(id, 60000);
    const fresh = await pay(id, 60000);
    succeed(fresh.reference);
    await sendWebhook(fresh.reference);
    succeed(stale.reference);
    await sendWebhook(stale.reference);
    expect(await reconcileWithPaystack(camp.id)).toMatchObject({ matched: 1, awaitingRefund: 1, problems: [] });
  });

  it("lists a camp payment on Paystack that no camp here knows", async () => {
    const { camp } = await registered();
    const ghost = `CAMP-${"F".repeat(16)}`;
    transactions.set(ghost, {
      reference: ghost,
      amount: 5000,
      currency: "GHS",
      email: "x@example.com",
      status: "success",
      created_at: new Date().toISOString(),
    });
    try {
      expect((await reconcileWithPaystack(camp.id)).problems).toContainEqual(
        expect.objectContaining({ reference: ghost, issue: "Paid on Paystack but unknown here." }),
      );
    } finally {
      transactions.delete(ghost);
    }
  });
});
