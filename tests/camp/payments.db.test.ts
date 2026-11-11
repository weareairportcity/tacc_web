import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { post, query } from "@/lib/cf";
import { feeFor } from "@/lib/camp/money";
import { checkPayment, startPayment } from "@/lib/camp/payments";
import { cancelRegistration, getRegistration, listPayments } from "@/lib/camp/registrations";
import { CampError } from "@/lib/camp/types";
import { TEST_WORKER_URL } from "../setup/constants";
import { checkWithExpressPay } from "@/lib/camp/reconciliation";
import { TEST_ALERT_PHONE } from "../setup/constants";
import { orders, sendNotice, setFailSubmit, setOrder, smsSent, startFakeExpressPay, succeed } from "../setup/expresspay";
import { ACTOR, registered } from "./helpers";

// Payments end to end: src/lib/camp → local Worker → fake expressPay, with
// post-url notices sent the way expressPay sends them (unsigned, order-id and
// token). The Worker never reaches the real expressPay.

let expresspay: Server;
beforeAll(async () => {
  expresspay = await startFakeExpressPay();
});
afterAll(() => new Promise<void>((resolve) => expresspay.close(() => resolve())));

const CALLBACK = "http://localhost:3000/camps/test/paid";
// A checkout opened long enough ago that a new one is started rather than reopened.
const longAgo = (reference: string) =>
  query("app", "UPDATE camp_payments SET created_at = ? WHERE reference = ?", [new Date(Date.now() - 40 * 60 * 1000).toISOString(), reference]);

const pay = (registrationId: string, amount: number) => startPayment(registrationId, amount, CALLBACK);
const reconcileNow = () => post<Record<string, number>>("/v1/admin/camp/reconcile", { older_than_minutes: 0 });
const auditActions = async (entityId: string) =>
  (
    await query<{ action: string }>("app", "SELECT action FROM camp_audit_log WHERE entity_id = ? ORDER BY id", [entityId])
  ).map((r) => r.action);
const paymentId = async (reference: string) =>
  (await query<{ id: string }>("app", "SELECT id FROM camp_payments WHERE reference = ?", [reference]))[0].id;

describe("fees", () => {
  it("adds expressPay's fee so the church receives the full amount", () => {
    for (const amount of [100, 18000, 20000, 33333, 60000, 1_234_567]) {
      const fee = feeFor(amount, 195);
      // What expressPay keeps (1.95% of the total) never eats into the instalment.
      expect(Math.floor(((amount + fee) * (10000 - 195)) / 10000)).toBeGreaterThanOrEqual(amount);
    }
    expect(feeFor(20000, 195)).toBe(398);
    expect(feeFor(20000, 0)).toBe(0);
  });

  it("charges expressPay the instalment plus the same fee the attendee was shown", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 20000);
    expect(checkout).toMatchObject({ amount_pesewas: 20000, fee_pesewas: 398, charged_pesewas: 20398 });
    expect(orders.get(checkout.reference)).toMatchObject({ amount: 20398, currency: "GHS", firstname: "Ama" });
    // No email: expressPay needs a different one per customer, and families share.
    expect(orders.get(checkout.reference)?.email).toBeNull();
    // The payer goes to expressPay's page for this token, and comes back to us.
    expect(checkout.authorization_url).toBe(`http://127.0.0.1:8792/expresspay/checkout.php?token=${encodeURIComponent(orders.get(checkout.reference)!.token)}`);
    expect(orders.get(checkout.reference)?.redirect).toBe(CALLBACK);
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
    expect((await sendNotice(first.reference)).status).toBe(200);
    expect(await getRegistration(id)).toMatchObject({ status: "partially_paid", paid_pesewas: 20000 });

    const second = await pay(id, 40000);
    succeed(second.reference);
    await sendNotice(second.reference);
    expect(await getRegistration(id)).toMatchObject({ status: "fully_paid", paid_pesewas: 60000 });

    const payments = await listPayments(id);
    expect(payments.map((p) => p.status)).toEqual(["success", "success"]);
    expect(await auditActions(await paymentId(first.reference))).toEqual(["payment.success"]);
  });

  it("refuses a payment once fully paid", async () => {
    const { id } = await registered();
    const full = await pay(id, 60000);
    succeed(full.reference);
    await sendNotice(full.reference);
    await expect(pay(id, 100)).rejects.toThrow("already fully paid");
  });
});

describe("expressPay's notice", () => {
  it("ignores duplicates, including several at once", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    succeed(checkout.reference);
    const responses = await Promise.all(Array.from({ length: 5 }, () => sendNotice(checkout.reference)));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    await sendNotice(checkout.reference);

    expect(await getRegistration(id)).toMatchObject({ status: "partially_paid", paid_pesewas: 30000 });
    expect(await auditActions(await paymentId(checkout.reference))).toEqual(["payment.success"]);
  });

  it("does nothing for a notice with the wrong token, and never asks expressPay about it", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    succeed(checkout.reference);
    const res = await sendNotice(checkout.reference, { token: "not-the-token" });
    expect(res.status).toBe(200);
    expect((await getRegistration(id))?.paid_pesewas).toBe(0);
    expect((await sendNotice("CAMP-0000000000000000", { token: "x" })).status).toBe(200);
  });

  it("doesn't trust the notice: no credit until expressPay's query says approved", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    await sendNotice(checkout.reference); // still unpaid on expressPay
    expect((await getRegistration(id))?.paid_pesewas).toBe(0);
    expect((await listPayments(id))[0].status).toBe("pending");
  });

  it("fails and flags a payment whose amount doesn't match", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    setOrder(checkout.reference, { status: "approved", amount: 100 });
    await sendNotice(checkout.reference);

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
    await sendNotice(first.reference);
    expect(fullyPaidTexts()).toEqual([]);

    const second = await pay(id, 30000);
    expect(second.reference).not.toBe(first.reference);
    succeed(second.reference);
    await sendNotice(second.reference);
    await sendNotice(second.reference); // a repeat doesn't text again
    expect(fullyPaidTexts()).toHaveLength(1);
    expect(fullyPaidTexts()[0].message).toMatch(new RegExp(`^Hi Ama, you're fully paid for ${camp.name}\\. Thank you!.* - The Airport City Church$`));
  });

  it("texts the coordinator when an amount doesn't match", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    setOrder(checkout.reference, { status: "approved", amount: 100 });
    await sendNotice(checkout.reference);
    expect(smsSent.find((s) => s.message.includes(checkout.reference))).toEqual({
      recipient: [`233${TEST_ALERT_PHONE.slice(1)}`],
      message: `The Airport City Church, Commune: payment ${checkout.reference} needs a look (amount mismatch).`,
    });
  });

  it("fails a payment in the wrong currency", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 30000);
    setOrder(checkout.reference, { status: "approved", currency: "NGN" });
    await sendNotice(checkout.reference);
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
    await longAgo(stale.reference);
    const fresh = await pay(id, 60000); // stale was never paid, so it's given up on
    expect((await listPayments(id)).find((p) => p.reference === stale.reference)?.status).toBe("failed");

    succeed(fresh.reference);
    await sendNotice(fresh.reference);
    // The attendee then finishes the old checkout too: money taken, not credited, flagged for refund.
    succeed(stale.reference);
    await sendNotice(stale.reference);

    expect(await getRegistration(id)).toMatchObject({ status: "fully_paid", paid_pesewas: 60000 });
    expect((await listPayments(id)).find((p) => p.reference === stale.reference)).toMatchObject({
      status: "failed",
      flag: "over_balance",
    });
  });

  it("still credits an old checkout paid late when it fits the balance", async () => {
    const { id } = await registered();
    const stale = await pay(id, 20000);
    await longAgo(stale.reference);
    await pay(id, 20000); // closes stale
    succeed(stale.reference);
    await sendNotice(stale.reference);
    expect(await getRegistration(id)).toMatchObject({ paid_pesewas: 20000, status: "partially_paid" });
  });

  it("waits while mobile money is still processing", async () => {
    const { id } = await registered();
    const first = await pay(id, 20000);
    setOrder(first.reference, { status: "waiting" });
    // The same amount reopens the same checkout; a different one waits for the first to finish.
    expect((await pay(id, 20000)).reference).toBe(first.reference);
    await expect(pay(id, 10000)).rejects.toThrow("still processing");
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

  it("marks a declined expressPay payment as failed", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 25000);
    setOrder(checkout.reference, { status: "declined" });
    await reconcileNow();
    expect((await listPayments(id))[0].status).toBe("failed");
  });

  it("leaves a recent unfinished checkout pending: result 3 \"No transaction data\" isn't a decline", async () => {
    const { id } = await registered();
    await pay(id, 25000);
    await reconcileNow();
    expect((await listPayments(id))[0].status).toBe("pending");
  });

  it("but fails a result 3 that has a transaction behind it", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 25000);
    setOrder(checkout.reference, { status: "error" });
    await reconcileNow();
    expect((await listPayments(id))[0].status).toBe("failed");
  });

  it("sets aside a Paystack payment left pending from before the switch, and flags it", async () => {
    const { id } = await registered();
    await query(
      "app",
      `INSERT INTO camp_payments (id, registration_id, provider, reference, amount_pesewas, fee_pesewas, charged_pesewas, created_at)
       VALUES (?, ?, 'paystack', 'CAMP-00000000OLDPAY01', 10000, 0, 10000, ?)`,
      [crypto.randomUUID(), id, new Date(Date.now() - 3600_000).toISOString()],
    );
    await reconcileNow();
    expect((await listPayments(id))[0]).toMatchObject({ status: "failed", flag: "paystack_unchecked" });
    // It no longer blocks a new payment.
    await expect(pay(id, 10000)).resolves.toMatchObject({ amount_pesewas: 10000 });
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
  it("records a payment expressPay wouldn't start, and lets the attendee retry", async () => {
    const { id } = await registered();
    setFailSubmit(true);
    try {
      await expect(pay(id, 20000)).rejects.toThrow("couldn't start");
    } finally {
      setFailSubmit(false);
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

describe("checking all with expressPay", () => {
  it("matches when every payment agrees, and counts a payment still waiting on a phone", async () => {
    const { camp, id } = await registered();
    const paid = await pay(id, 20000);
    succeed(paid.reference);
    await sendNotice(paid.reference);
    const open = await pay(id, 10000); // started, never paid: fine on both sides
    expect(await checkWithExpressPay(camp.id)).toEqual({ checked: 2, matched: 2, awaitingRefund: 0, waiting: 0, unanswered: 0, problems: [] });
    setOrder(open.reference, { status: "waiting" });
    expect(await checkWithExpressPay(camp.id)).toMatchObject({ checked: 2, matched: 2, waiting: 1, problems: [] });
  });

  it("skips sample and Paystack-era payments", async () => {
    const { camp, id } = await registered();
    for (const provider of ["sample", "paystack"]) {
      await query(
        "app",
        `INSERT INTO camp_payments (id, registration_id, provider, reference, amount_pesewas, fee_pesewas, charged_pesewas, status)
         VALUES (?, ?, ?, ?, 10000, 0, 10000, 'success')`,
        [crypto.randomUUID(), id, provider, `CAMP-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`],
      );
    }
    expect(await checkWithExpressPay(camp.id)).toMatchObject({ checked: 0, problems: [] });
  });

  it("lists a payment expressPay approved that was never credited here", async () => {
    const { camp, id } = await registered();
    const missed = await pay(id, 20000);
    succeed(missed.reference); // no notice, no reconcile job yet
    const report = await checkWithExpressPay(camp.id);
    expect(report.problems).toEqual([
      {
        reference: missed.reference,
        full_name: "Ama Mensah",
        ours: "pending, GHS 203.98",
        expresspay: "approved, GHS 203.98",
        issue: "Paid on expressPay but not credited here.",
      },
    ]);
    // Once the notice lands it matches.
    await sendNotice(missed.reference);
    expect((await checkWithExpressPay(camp.id)).problems).toEqual([]);
  });

  it("lists one credited here that expressPay says wasn't paid", async () => {
    const { camp, id } = await registered();
    const checkout = await pay(id, 20000);
    succeed(checkout.reference);
    await sendNotice(checkout.reference);
    setOrder(checkout.reference, { status: "declined" });
    expect((await checkWithExpressPay(camp.id)).problems).toEqual([expect.objectContaining({ issue: "Credited here but not paid on expressPay." })]);
  });

  it("counts a late over-balance payment as waiting for a refund, not a mismatch", async () => {
    const { camp, id } = await registered();
    const stale = await pay(id, 60000);
    await longAgo(stale.reference);
    const fresh = await pay(id, 60000);
    succeed(fresh.reference);
    await sendNotice(fresh.reference);
    succeed(stale.reference);
    await sendNotice(stale.reference);
    expect(await checkWithExpressPay(camp.id)).toMatchObject({ matched: 1, awaitingRefund: 1, problems: [] });
  });

  it("only looks at the last 30 days", async () => {
    const { camp, id } = await registered();
    const old = await pay(id, 20000);
    succeed(old.reference);
    await query("app", "UPDATE camp_payments SET created_at = ? WHERE reference = ?", [new Date(Date.now() - 31 * 86_400_000).toISOString(), old.reference]);
    expect((await checkWithExpressPay(camp.id)).checked).toBe(0);
  });
});

describe("MoMo or card", () => {
  it("charges the fee for the way they said they'd pay", async () => {
    const { camp, id } = await registered();
    await query("app", "UPDATE camps SET fee_bps = 250, momo_fee_bps = 150 WHERE id = ?", [camp.id]);
    const momo = await startPayment(id, 20000, CALLBACK, "momo");
    expect(momo).toMatchObject({ fee_pesewas: feeFor(20000, 150), charged_pesewas: 20000 + feeFor(20000, 150) });
    expect(momo.authorization_url).toContain("checkout.php?token=");
    expect((await listPayments(id))[0]).toMatchObject({ status: "pending", fee_pesewas: feeFor(20000, 150) });
    await longAgo(momo.reference);
    expect((await startPayment(id, 20000, CALLBACK, "card")).fee_pesewas).toBe(feeFor(20000, 250));
  });

  it("reopens the same checkout only for the same way of paying", async () => {
    const { id } = await registered();
    const first = await startPayment(id, 20000, CALLBACK, "momo");
    expect(await startPayment(id, 20000, CALLBACK, "momo")).toMatchObject({ reference: first.reference, resumed: true });
    // Switching to card gives up the unpaid MoMo checkout and opens a new one at the card fee.
    const card = await startPayment(id, 20000, CALLBACK, "card");
    expect(card.reference).not.toBe(first.reference);
  });

  it("coordinators paying for several people pay the higher fee", async () => {
    const { camp, roomTypeId } = await openCamp();
    await query("app", "UPDATE camps SET fee_bps = 250, momo_fee_bps = 150 WHERE id = ?", [camp.id]);
    const a = (await getRegistration((await register(camp, attendeeInput(roomTypeId))).id))!;
    const checkout = await startBulkPayment({ campId: camp.id, registrationIds: [a.id], paidBy: ACTOR, note: "", callbackUrl: CALLBACK });
    expect(checkout.fee_pesewas).toBe(feeFor(60000, 250));
  });
});

// ─── Commune v2: paying for several people, refunds, requests ───────────────

import { checkBulkPayment, startBulkPayment, startPaymentFor } from "@/lib/camp/payments";
import { listRefunds, recordRefund } from "@/lib/camp/adjustments";
import { approveRefund, approveRoomChange, askForRefund, askForRoomChange, declineRequest, listRequests } from "@/lib/camp/requests";
import { cancelMine } from "@/lib/camp/profile";
import { createRoomType } from "@/lib/camp/rooms";
import { listBulkPayments } from "@/lib/camp/reports";
import { openCamp, attendee as attendeeInput } from "./helpers";
import { register } from "@/lib/camp/registrations";

const newPerson = async (camp: Awaited<ReturnType<typeof openCamp>>["camp"], roomTypeId: string) =>
  (await getRegistration((await register(camp, attendeeInput(roomTypeId))).id))!;

/** Pays `amount` for a registration through the fake expressPay, end to end. */
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
      campId: camp.id, registrationIds: [a.id, b.id], paidBy: ACTOR, note: "Zion fund", callbackUrl: CALLBACK,
    });
    expect(checkout).toMatchObject({ people: 2, amount_pesewas: 60000 + 40000, fee_pesewas: feeFor(100000, 195) });
    expect(orders.get(checkout.reference)).toMatchObject({ amount: checkout.charged_pesewas });
    expect(orders.get(checkout.reference)?.email).toBeNull();

    succeed(checkout.reference);
    expect(await checkBulkPayment(camp.id, checkout.reference)).toMatchObject({ status: "success", people: 2, credited: 2 });
    expect((await getRegistration(a.id))?.status).toBe("fully_paid");
    expect((await getRegistration(b.id))?.status).toBe("fully_paid");
    const share = (await listPayments(a.id)).find((p) => p.bulk_id);
    expect(share).toMatchObject({ amount_pesewas: 60000, fee_pesewas: 0, payer_name: "Zion fund", status: "success" });
    expect((await listBulkPayments(camp.id))[0]).toMatchObject({ paid_by: ACTOR, count: 2, status: "success" });
  });

  it("is checked with expressPay as one payment, not one per person", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const b = await newPerson(camp, roomTypeId);
    const checkout = await startBulkPayment({ campId: camp.id, registrationIds: [a.id, b.id], paidBy: ACTOR, note: "", callbackUrl: CALLBACK });
    succeed(checkout.reference);
    await checkBulkPayment(camp.id, checkout.reference);
    const report = await checkWithExpressPay(camp.id);
    expect(report.problems).toEqual([]);
    expect(report.checked).toBe(1);
  });

  it("skips people who are already fully paid and refuses when nobody owes", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    await payFor(a.id, 60000);
    await expect(
      startBulkPayment({ campId: camp.id, registrationIds: [a.id], paidBy: ACTOR, note: "", callbackUrl: CALLBACK }),
    ).rejects.toThrow("already fully paid");
  });

  it("a repeated notice and a reconcile change nothing after success", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    const checkout = await startBulkPayment({ campId: camp.id, registrationIds: [a.id], paidBy: ACTOR, note: "", callbackUrl: CALLBACK });
    succeed(checkout.reference);
    await sendNotice(checkout.reference);
    await sendNotice(checkout.reference);
    await reconcileNow();
    expect((await getRegistration(a.id))?.paid_pesewas).toBe(60000);
  });
});

describe("pay links", () => {
  it("lets someone else pay, with their name on the payment", async () => {
    const { id } = await registered();
    const checkout = await startPaymentFor(id, 30000, CALLBACK, "Daddy", "card");
    expect(orders.get(checkout.reference)).toMatchObject({ firstname: "Daddy" });
    succeed(checkout.reference);
    await checkPayment(id, checkout.reference);
    expect((await listPayments(id))[0]).toMatchObject({ payer_name: "Daddy", status: "success" });
  });
});

describe("refunds, sent by hand and recorded", () => {
  it("lower what was paid, with the reference kept", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    await payFor(a.id, 20000);
    await payFor(a.id, 40000);
    await recordRefund(ACTOR, a.id, { amount_pesewas: 50000, reference: "MOMO-TX-1234", note: "" });
    expect(await getRegistration(a.id)).toMatchObject({ paid_pesewas: 10000, status: "partially_paid" });
    expect((await listRefunds(a.id))[0]).toMatchObject({ amount_pesewas: 50000, reference: "MOMO-TX-1234" });
  });

  it("can't be more than was paid", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    await payFor(a.id, 20000);
    await expect(recordRefund(ACTOR, a.id, { amount_pesewas: 20001, reference: "X-1", note: "" })).rejects.toThrow("can't be more");
    expect((await getRegistration(a.id))?.paid_pesewas).toBe(20000);
  });
});

describe("requests", () => {
  it("cancelling after paying asks for a refund; approving records the one sent", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    await payFor(a.id, 30000);
    const me = (await getRegistration(a.id))!;
    expect(await cancelMine(me, "Exams moved", false)).toEqual({ refundRequested: true });
    const [request] = await listRequests(camp.id, "pending");
    expect(request).toMatchObject({ kind: "refund", amount_pesewas: 30000, reason: "Exams moved", registration_status: "cancelled" });
    await expect(approveRefund(ACTOR, request.id, 30000, "", "")).rejects.toThrow("reference");
    const result = await approveRefund(ACTOR, request.id, 30000, "Sorry to miss you", "MP241110.1234.A01");
    expect(result.refunded_pesewas).toBe(30000);
    expect((await getRegistration(a.id))?.paid_pesewas).toBe(0);
    const [refund] = await query<{ request_id: string; reference: string }>("app", "SELECT request_id, reference FROM camp_refunds WHERE registration_id = ?", [a.id]);
    expect(refund).toEqual({ request_id: request.id, reference: "MP241110.1234.A01" });
    expect(await listRequests(camp.id, "pending")).toEqual([]);
    await expect(approveRefund(ACTOR, request.id, 30000, "", "X-123")).rejects.toThrow("already decided");
  });

  it("puts a refund request back if it can't be recorded", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await newPerson(camp, roomTypeId);
    await payFor(a.id, 30000);
    await askForRefund((await getRegistration(a.id))!, 10000, "Paid twice");
    const [request] = await listRequests(camp.id, "pending");
    // Someone else recorded a refund meanwhile, so there's less paid than the request saw.
    await recordRefund(ACTOR, a.id, { amount_pesewas: 25000, reference: "OTHER-1", note: "" });
    await expect(approveRefund(ACTOR, request.id, 10000, "", "MOMO-2")).rejects.toThrow();
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

  it("an upgrade leaves the difference to pay; a downgrade records the refund first", async () => {
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
    await payFor(down.id, 60000);
    await askForRoomChange((await getRegistration(down.id))!, dorm, "Cheaper please");
    [request] = await listRequests(camp.id, "pending");
    await expect(approveRoomChange(ACTOR, request.id, "")).rejects.toThrow("reference");
    const result = await approveRoomChange(ACTOR, request.id, "", "MOMO-DOWN-1");
    expect(result.refunded).toBe(20000);
    expect((await listRefunds(down.id))[0]).toMatchObject({ amount_pesewas: 20000, reference: "MOMO-DOWN-1" });
    expect(await getRegistration(down.id)).toMatchObject({ room_type_name: "Dorm", price_pesewas: 40000, paid_pesewas: 40000, status: "fully_paid" });
  });
});

import { cancelPayment, listMyOpenBulkPayments, listOpenPaymentsFor } from "@/lib/camp/payments";

describe("a payment still processing", () => {
  const bulk = (campId: string, ids: string[], paidBy = ACTOR) =>
    startBulkPayment({ campId, registrationIds: ids, paidBy, note: "", callbackUrl: CALLBACK });

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
    setOrder(first.reference, { status: "waiting" });
    expect((await cancelPayment(camp.id, first.reference)).status).toBe("pending");

    setOrder(first.reference, { status: "unpaid" });
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
    const checkout = await startBulkPayment({ campId: camp.id, registrationIds: [a.id, b.id], paidBy: ACTOR, note: "Zion fund", callbackUrl: CALLBACK });
    succeed(checkout.reference);
    await checkBulkPayment(camp.id, checkout.reference);
    const receipt = await getBulkReceipt(camp.id, checkout.reference);
    expect(receipt).toMatchObject({ paid_by: ACTOR, note: "Zion fund", amount_pesewas: 120000, charged_pesewas: checkout.charged_pesewas, status: "success" });
    expect(receipt!.people.map((p) => [p.id, p.amount_pesewas, p.status]).sort()).toEqual([[a.id, 60000, "success"], [b.id, 60000, "success"]].sort());
    expect(await getBulkReceipt((await openCamp()).camp.id, checkout.reference)).toBeNull();
  });
});

describe("one checkout at a time", () => {
  it("opens the same checkout again for a second tab with the same amount", async () => {
    const { id } = await registered();
    const first = await pay(id, 20000);
    const second = await pay(id, 20000);
    expect(second.reference).toBe(first.reference);
    expect(second.authorization_url).toBe(first.authorization_url);
    const pending = await query("app", "SELECT id FROM camp_payments WHERE registration_id = ? AND status = 'pending'", [id]);
    expect(pending).toHaveLength(1);
  });

  it("never starts two checkouts for two taps at the same moment", async () => {
    const { id } = await registered();
    const tries = await Promise.allSettled([pay(id, 20000), pay(id, 20000)]);
    const refs = new Set(tries.flatMap((t) => (t.status === "fulfilled" ? [t.value.reference] : [])));
    expect(refs.size).toBe(1);
    const open = await query("app", "SELECT id FROM camp_payments WHERE registration_id = ? AND status = 'pending'", [id]);
    expect(open).toHaveLength(1);
  });
});

describe("stored on the registration", () => {
  it("keeps each person's latest payment on their registration", async () => {
    const { id } = await registered();
    const checkout = await pay(id, 15000);
    succeed(checkout.reference);
    await sendNotice(checkout.reference);
    const [row] = await query<{ last_paid_pesewas: number; last_paid_at: string | null; flagged_payments: number }>(
      "app",
      "SELECT last_paid_pesewas, last_paid_at, flagged_payments FROM camp_registrations WHERE id = ?",
      [id],
    );
    expect(row).toMatchObject({ last_paid_pesewas: 15000, flagged_payments: 0 });
    expect(row.last_paid_at).toBeTruthy();
  });
});

// Notifications run here too: they need this file's fake expressPay/Telegram/push server.
import "./notifications.cases";
