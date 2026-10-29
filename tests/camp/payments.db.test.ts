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

  it("texts the person once, when their payments reach the full price", async () => {
    const { camp, id } = await registered();
    const phone = (await getRegistration(id))!.phone;
    const fullyPaidTexts = () => smsSent.filter((s) => s.recipient.includes(phone) && s.message.includes("you're fully paid"));

    const first = await pay(id, 30000);
    succeed(first.reference);
    await sendWebhook(first.reference);
    expect(fullyPaidTexts()).toEqual([]);

    const second = await pay(id, 30000);
    succeed(second.reference);
    await sendWebhook(second.reference);
    await sendWebhook(second.reference); // a repeat doesn't text again
    expect(fullyPaidTexts()).toHaveLength(1);
    expect(fullyPaidTexts()[0].message).toMatch(new RegExp(`^Hi Ama, you're fully paid for ${camp.name}\\. Thank you!.* - The Airport City Church$`));
  });

  it("texts the coordinator when an amount doesn't match", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    setTransaction(checkout.reference, { status: "success", amount: 100 });
    await sendWebhook(checkout.reference);
    expect(smsSent.find((s) => s.message.includes(checkout.reference))).toEqual({
      recipient: [`233${TEST_ALERT_PHONE.slice(1)}`],
      message: `The Airport City Church, Commune: payment ${checkout.reference} needs a look (amount mismatch).`,
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

  it("skips sample payments, but still flags a credited one Paystack never saw", async () => {
    const { camp, id } = await registered();
    const insert = (provider: string, reference: string) =>
      query(
        "app",
        `INSERT INTO camp_payments (id, registration_id, provider, reference, amount_pesewas, fee_pesewas, charged_pesewas, status)
         VALUES (?, ?, ?, ?, 10000, 0, 10000, 'success')`,
        [crypto.randomUUID(), id, provider, reference],
      );
    await insert("sample", `SAMPLE-${crypto.randomUUID().slice(0, 12)}`);
    expect(await reconcileWithPaystack(camp.id)).toMatchObject({ checked: 0, problems: [] });
    await insert("paystack", "CAMP-00000000DEADBEEF");
    const report = await reconcileWithPaystack(camp.id);
    expect(report.checked).toBe(1);
    expect(report.problems).toEqual([expect.objectContaining({ reference: "CAMP-00000000DEADBEEF", issue: "Credited here but not paid on Paystack." })]);
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

// ─── Commune v2: paying for several people, refunds through Paystack, requests ─

import { checkBulkPayment, refundThroughPaystack, startBulkPayment, startPaymentFor } from "@/lib/camp/payments";
import { approveRefund, approveRoomChange, askForRefund, askForRoomChange, declineRequest, listRequests } from "@/lib/camp/requests";
import { cancelMine } from "@/lib/camp/profile";
import { createRoomType } from "@/lib/camp/rooms";
import { listBulkPayments } from "@/lib/camp/reports";
import { refundsAsked, setFailRefund } from "../setup/paystack";
import { openCamp, attendee as attendeeInput } from "./helpers";
import { register } from "@/lib/camp/registrations";

const newPerson = async (camp: Awaited<ReturnType<typeof openCamp>>["camp"], roomTypeId: string) =>
  (await getRegistration((await register(camp, attendeeInput(roomTypeId))).id))!;

/** Pays `amount` for a registration through the fake Paystack, end to end. */
async function payFor(id: string, amount: number) {
  const checkout = await pay(id, amount);
  succeed(checkout.reference);
  await checkPayment(id, checkout.reference);
  return checkout;
}

describe("paying for several people", () => {
  it("clears each person's balance with one checkout, with the fee on the total", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const b = await newPerson(camp, roomTypeId);
    await payFor(b.id, 20000);
    const checkout = await startBulkPayment({
      campId: camp.id, registrationIds: [a.id, b.id], paidBy: ACTOR, payerEmail: "coord@test.local", note: "Zion fund", callbackUrl: CALLBACK,
    });
    expect(checkout).toMatchObject({ people: 2, amount_pesewas: 60000 + 40000, fee_pesewas: feeFor(100000, 195) });
    expect(transactions.get(checkout.reference)).toMatchObject({ amount: checkout.charged_pesewas, email: "coord@test.local" });

    succeed(checkout.reference);
    expect(await checkBulkPayment(camp.id, checkout.reference)).toMatchObject({ status: "success", people: 2, credited: 2 });
    expect((await getRegistration(a.id))?.status).toBe("fully_paid");
    expect((await getRegistration(b.id))?.status).toBe("fully_paid");
    const share = (await listPayments(a.id)).find((p) => p.bulk_id);
    expect(share).toMatchObject({ amount_pesewas: 60000, fee_pesewas: 0, payer_name: "Zion fund", status: "success" });
    expect((await listBulkPayments(camp.id))[0]).toMatchObject({ paid_by: ACTOR, count: 2, status: "success" });
  });

  it("reconciles against Paystack as one transaction, not one per person", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const b = await newPerson(camp, roomTypeId);
    const checkout = await startBulkPayment({ campId: camp.id, registrationIds: [a.id, b.id], paidBy: ACTOR, payerEmail: "c@test.local", note: "", callbackUrl: CALLBACK });
    succeed(checkout.reference);
    await checkBulkPayment(camp.id, checkout.reference);
    const report = await reconcileWithPaystack(camp.id);
    expect(report.problems).toEqual([]);
    expect(report.checked).toBe(1);
  });

  it("skips people who are already fully paid and refuses when nobody owes", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    await payFor(a.id, 60000);
    await expect(
      startBulkPayment({ campId: camp.id, registrationIds: [a.id], paidBy: ACTOR, payerEmail: "c@test.local", note: "", callbackUrl: CALLBACK }),
    ).rejects.toThrow("already fully paid");
  });

  it("a repeated webhook and a reconcile change nothing after success", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const checkout = await startBulkPayment({ campId: camp.id, registrationIds: [a.id], paidBy: ACTOR, payerEmail: "c@test.local", note: "", callbackUrl: CALLBACK });
    succeed(checkout.reference);
    await sendWebhook(checkout.reference);
    await sendWebhook(checkout.reference);
    await reconcileNow();
    expect((await getRegistration(a.id))?.paid_pesewas).toBe(60000);
  });
});

describe("pay links", () => {
  it("lets someone else pay, with their email for the receipt and their name on the payment", async () => {
    const { id } = await registered();
    const checkout = await startPaymentFor(id, 30000, CALLBACK, { email: "dad@example.com", name: "Daddy" });
    expect(transactions.get(checkout.reference)?.email).toBe("dad@example.com");
    succeed(checkout.reference);
    await checkPayment(id, checkout.reference);
    expect((await listPayments(id))[0]).toMatchObject({ payer_name: "Daddy", status: "success" });
  });
});

describe("refunds through Paystack", () => {
  it("refunds across payments, newest first, and lowers what was paid", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const first = await payFor(a.id, 20000);
    const second = await payFor(a.id, 40000);
    const before = refundsAsked.length;
    expect(await refundThroughPaystack({ registrationId: a.id, amountPesewas: 50000, actor: ACTOR, note: "" })).toEqual({ refunded_pesewas: 50000, short_pesewas: 0 });
    expect(refundsAsked.slice(before)).toEqual([
      { transaction: second.reference, amount: 40000 },
      { transaction: first.reference, amount: 10000 },
    ]);
    expect(await getRegistration(a.id)).toMatchObject({ paid_pesewas: 10000, status: "partially_paid" });
  });

  it("refunds a share of a bulk payment against the bulk's own Paystack reference", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const checkout = await startBulkPayment({ campId: camp.id, registrationIds: [a.id], paidBy: ACTOR, payerEmail: "c@test.local", note: "", callbackUrl: CALLBACK });
    succeed(checkout.reference);
    await checkBulkPayment(camp.id, checkout.reference);
    await refundThroughPaystack({ registrationId: a.id, amountPesewas: 60000, actor: ACTOR, note: "" });
    expect(refundsAsked.at(-1)).toEqual({ transaction: checkout.reference, amount: 60000 });
  });

  it("can't refund more than was paid, and records nothing if Paystack refuses", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    await payFor(a.id, 20000);
    await expect(refundThroughPaystack({ registrationId: a.id, amountPesewas: 20001, actor: ACTOR, note: "" })).rejects.toThrow("more than");
    setFailRefund(true);
    try {
      await expect(refundThroughPaystack({ registrationId: a.id, amountPesewas: 100, actor: ACTOR, note: "" })).rejects.toThrow("Paystack refused");
    } finally {
      setFailRefund(false);
    }
    expect((await getRegistration(a.id))?.paid_pesewas).toBe(20000);
  });
});

describe("requests", () => {
  it("cancelling after paying asks for a refund; approving sends it", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    await payFor(a.id, 30000);
    const me = (await getRegistration(a.id))!;
    expect(await cancelMine(me, "Exams moved", false)).toEqual({ refundRequested: true });
    const [request] = await listRequests(camp.id, "pending");
    expect(request).toMatchObject({ kind: "refund", amount_pesewas: 30000, reason: "Exams moved", registration_status: "cancelled" });
    const result = await approveRefund(ACTOR, request.id, 30000, "Sorry to miss you");
    expect(result.refunded_pesewas).toBe(30000);
    expect((await getRegistration(a.id))?.paid_pesewas).toBe(0);
    expect(await listRequests(camp.id, "pending")).toEqual([]);
    await expect(approveRefund(ACTOR, request.id, 30000, "")).rejects.toThrow("already decided");
  });

  it("puts a refund request back if Paystack refuses", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    await payFor(a.id, 30000);
    await askForRefund((await getRegistration(a.id))!, 10000, "Paid twice");
    const [request] = await listRequests(camp.id, "pending");
    setFailRefund(true);
    try {
      await expect(approveRefund(ACTOR, request.id, 10000, "")).rejects.toThrow();
    } finally {
      setFailRefund(false);
    }
    expect((await listRequests(camp.id, "pending")).map((r) => r.id)).toEqual([request.id]);
    await declineRequest(ACTOR, request.id, "Not this time");
    expect((await listRequests(camp.id, "done"))[0]).toMatchObject({ status: "declined", decision_note: "Not this time" });
  });

  it("only one open request of each kind", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    await payFor(a.id, 30000);
    const me = (await getRegistration(a.id))!;
    await askForRefund(me, 100, "Paid twice");
    await expect(askForRefund(me, 100, "Again")).rejects.toThrow("already have");
  });

  it("an upgrade leaves the difference to pay; a downgrade refunds it first", async () => {
    const { camp, roomTypeId } = await openCamp();
    const hotel = await createRoomType(ACTOR, camp.id, { name: "Hotel", price_pesewas: 120000, capacity: 2 });
    const dorm = await createRoomType(ACTOR, camp.id, { name: "Dorm", price_pesewas: 40000, capacity: 8 });

    const up = await newPerson(camp, roomTypeId);
    await payFor(up.id, 60000);
    await askForRoomChange((await getRegistration(up.id))!, hotel, "");
    let [request] = await listRequests(camp.id, "pending");
    await approveRoomChange(ACTOR, request.id, "");
    expect(await getRegistration(up.id)).toMatchObject({ room_type_name: "Hotel", price_pesewas: 120000, paid_pesewas: 60000, status: "partially_paid" });

    const down = await newPerson(camp, roomTypeId);
    const paid = await payFor(down.id, 60000);
    await askForRoomChange((await getRegistration(down.id))!, dorm, "Cheaper please");
    [request] = await listRequests(camp.id, "pending");
    const result = await approveRoomChange(ACTOR, request.id, "");
    expect(result.refunded).toBe(20000);
    expect(refundsAsked.at(-1)).toEqual({ transaction: paid.reference, amount: 20000 });
    expect(await getRegistration(down.id)).toMatchObject({ room_type_name: "Dorm", price_pesewas: 40000, paid_pesewas: 40000, status: "fully_paid" });
  });
});

import { cancelPayment, listMyOpenBulkPayments, listOpenPaymentsFor } from "@/lib/camp/payments";

describe("a payment still processing", () => {
  const bulk = (campId: string, ids: string[], paidBy = ACTOR) =>
    startBulkPayment({ campId, registrationIds: ids, paidBy, payerEmail: "c@test.local", note: "", callbackUrl: CALLBACK });

  it("can be resumed: its checkout link is kept while it's pending", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const checkout = await bulk(camp.id, [a.id]);
    const [open] = await listMyOpenBulkPayments(camp.id, ACTOR);
    expect(open).toMatchObject({ reference: checkout.reference, kind: "bulk", people: 1, checkout_url: checkout.authorization_url });
    expect(await listMyOpenBulkPayments(camp.id, "someone@test.local")).toEqual([]);
    expect(await listOpenPaymentsFor(camp.id, [a.id])).toMatchObject([{ reference: checkout.reference, kind: "bulk", paid_by: ACTOR }]);
  });

  it("blocks another coordinator, until it's cancelled", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const first = await bulk(camp.id, [a.id]);
    await expect(bulk(camp.id, [a.id], "other@test.local")).rejects.toThrow("still processing");

    // Mobile money waiting on a phone: not cancelled.
    setTransaction(first.reference, { status: "ongoing" });
    expect((await cancelPayment(camp.id, first.reference)).status).toBe("pending");

    setTransaction(first.reference, { status: "abandoned" });
    expect((await cancelPayment(camp.id, first.reference)).status).toBe("failed");
    expect(await listOpenPaymentsFor(camp.id, [a.id])).toEqual([]);
    expect(await bulk(camp.id, [a.id], "other@test.local")).toMatchObject({ people: 1 });
  });

  it("is credited, not cancelled, when it was paid after all", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const checkout = await bulk(camp.id, [a.id]);
    succeed(checkout.reference);
    expect((await cancelPayment(camp.id, checkout.reference)).status).toBe("success");
    expect((await getRegistration(a.id))?.status).toBe("fully_paid");
  });

  it("the same coordinator starting again replaces their own unfinished checkout", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const first = await bulk(camp.id, [a.id]);
    const second = await bulk(camp.id, [a.id]);
    expect(second.reference).not.toBe(first.reference);
    expect(await listMyOpenBulkPayments(camp.id, ACTOR)).toMatchObject([{ reference: second.reference }]);
  });

  it("can't be cancelled from another camp", async () => {
    const { camp, roomTypeId } = await openCamp();
    const other = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const checkout = await bulk(camp.id, [a.id]);
    await expect(cancelPayment(other.camp.id, checkout.reference)).rejects.toThrow();
  });
});

import { getBulkReceipt } from "@/lib/camp/reports";

describe("pay-for-people receipt", () => {
  it("lists who was paid for, what each got, the fee and the total", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const b = await newPerson(camp, roomTypeId);
    const checkout = await startBulkPayment({ campId: camp.id, registrationIds: [a.id, b.id], paidBy: ACTOR, payerEmail: "c@test.local", note: "Zion fund", callbackUrl: CALLBACK });
    succeed(checkout.reference);
    await checkBulkPayment(camp.id, checkout.reference);
    const receipt = await getBulkReceipt(camp.id, checkout.reference);
    expect(receipt).toMatchObject({ paid_by: ACTOR, note: "Zion fund", amount_pesewas: 120000, charged_pesewas: checkout.charged_pesewas, status: "success" });
    expect(receipt!.people.map((p) => [p.id, p.amount_pesewas, p.status]).sort()).toEqual([[a.id, 60000, "success"], [b.id, 60000, "success"]].sort());
    expect(await getBulkReceipt((await openCamp()).camp.id, checkout.reference)).toBeNull();
  });
});
