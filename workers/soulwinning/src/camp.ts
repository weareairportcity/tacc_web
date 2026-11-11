import * as ep from "./expresspay";
import { sendSms } from "./sms";
import { HttpError, UUID, json, nowIso, readJson, timingSafeEqual, type AppEnv } from "./util";

/**
 * Camp payments through expressPay (src/expresspay.ts holds the keys).
 *
 *   Next server (ADMIN_SECRET) → /v1/admin/camp/pay-init, /check, /reconcile,
 *                                /bulk-init, /bulk-check, /pay-cancel,
 *                                /provider-check
 *   expressPay                 → /v1/camp/ep (the post-url notice)
 *   Every 10 minutes           → reconcile, for notices that never arrived
 *
 * A coordinator can pay for several people in one checkout (a "bulk"
 * payment): one camp_bulk_payments row carries the reference, expressPay's
 * token and the fee, and each person's share is a camp_payments row pointing
 * at it. Shares are settled together, through the bulk, never on their own.
 *
 * Nothing is trusted on its word: the notice, the return page and
 * reconciliation all ask expressPay's query endpoint, and a payment is
 * credited only when the amount and currency match exactly. Crediting is one
 * guarded D1 batch (payment, audit entry, registration balance and status),
 * so a repeat does nothing and two payments can never add up to more than the
 * price. Refunds are sent by hand and recorded on the Next side.
 */

const ACTOR = "expresspay";
const PROVIDER = "expresspay";
const MIN_PESEWAS = 100;
/** A checkout nobody finished is given up on after this long. */
const ABANDON_AFTER_MS = 60 * 60 * 1000;
/** Reconciliation looks at payments still pending after this long. */
const RECONCILE_AFTER_MS = 10 * 60 * 1000;
/** The processing page asks at most this often per payment. */
const CHECK_EVERY_MS = 10 * 1000;

type Payment = {
  id: string;
  created_at: string;
  registration_id: string;
  reference: string;
  amount_pesewas: number;
  fee_pesewas: number;
  charged_pesewas: number;
  currency: string;
  status: "pending" | "success" | "failed";
  flag: string | null;
  checked_at: string | null;
  bulk_id: string | null;
  checkout_url?: string | null;
  payer_name?: string | null;
  provider: string;
  provider_token: string | null;
  method: string | null;
};

/** A checkout opened this recently, for the same amount and payer, is reopened rather than started again. */
const RESUME_WITHIN_MS = 30 * 60 * 1000;

type Bulk = {
  id: string;
  created_at: string;
  camp_id: string;
  reference: string;
  paid_by: string;
  charged_pesewas: number;
  currency: string;
  status: "pending" | "success" | "failed";
  flag: string | null;
  checked_at: string | null;
  provider: string;
  provider_token: string | null;
};

/**
 * expressPay's fee, passed on so the church receives the full instalment:
 * charged × (1 − rate) ≥ amount. Integer maths, rounded up to the pesewa.
 * Mirrored in src/lib/camp/money.ts for the fee shown before paying.
 */
export function feeFor(amountPesewas: number, feeBps: number) {
  if (feeBps <= 0) return 0;
  return Math.ceil((amountPesewas * 10000) / (10000 - feeBps)) - amountPesewas;
}

/**
 * The rate for a payment, by how the payer said they'd pay. expressPay's page
 * still offers both, so someone who picks MoMo and then pays by card leaves the
 * church the difference on that payment (the church's choice, Nov 2026).
 * Mirrored in money.ts.
 */
export function rateFor(method: PayMethod, camp: { fee_bps: number; momo_fee_bps: number }) {
  return method === "momo" ? camp.momo_fee_bps : camp.fee_bps;
}

export type PayMethod = "card" | "momo";

const reference = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `CAMP-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};
// Still starts CAMP- so the notice and the expressPay check pick bulk payments up too.
const bulkReference = () => reference().replace("CAMP-", "CAMP-B");

const audit = (env: AppEnv, campId: string | null, action: string, entityId: string, after: unknown) =>
  env.APP_DB.prepare(
    `INSERT INTO camp_audit_log (camp_id, actor, action, entity, entity_id, after_json)
     VALUES (?, ?, ?, 'payment', ?, ?)`,
  ).bind(campId, ACTOR, action, entityId, JSON.stringify(after));

const campIdOf = async (env: AppEnv, registrationId: string) =>
  (
    await env.APP_DB.prepare("SELECT camp_id FROM camp_registrations WHERE id = ?")
      .bind(registrationId)
      .first<{ camp_id: string }>()
  )?.camp_id ?? null;

/** What a registration has paid: successful payments minus recorded refunds (migration 0008). */
const netPaid = (registrationId: string) =>
  `((SELECT COALESCE(SUM(amount_pesewas), 0) FROM camp_payments
     WHERE registration_id = ${registrationId} AND status = 'success')
    - (SELECT COALESCE(SUM(amount_pesewas), 0) FROM camp_refunds WHERE registration_id = ${registrationId}))`;

// What People shows without looking up payments per person (migration 0018). Keep in step
// with src/lib/camp/adjustments.ts.
const PAYMENT_SUMMARY = `last_paid_at = (SELECT p.paid_at FROM camp_payments p WHERE p.registration_id = camp_registrations.id AND p.status = 'success' ORDER BY p.paid_at DESC LIMIT 1),
       last_paid_pesewas = (SELECT p.amount_pesewas FROM camp_payments p WHERE p.registration_id = camp_registrations.id AND p.status = 'success' ORDER BY p.paid_at DESC LIMIT 1),
       flagged_payments = (SELECT COUNT(*) FROM camp_payments p WHERE p.registration_id = camp_registrations.id AND p.flag IN ('amount_mismatch', 'over_balance'))`;

// The registration's cached balance and status, recomputed from its payments and refunds.
const PAID_SUM = netPaid("camp_registrations.id");
const refreshRegistration = (env: AppEnv, registrationId: string) =>
  env.APP_DB.prepare(
    `UPDATE camp_registrations SET
       paid_pesewas = ${PAID_SUM},
       status = CASE
         WHEN status = 'cancelled' THEN 'cancelled'
         WHEN ${PAID_SUM} >= price_pesewas THEN 'fully_paid'
         WHEN ${PAID_SUM} > 0 THEN 'partially_paid'
         ELSE 'registered'
       END,
       ${PAYMENT_SUMMARY}
     WHERE id = ?`,
  ).bind(registrationId);

async function flagPayment(env: AppEnv, p: Payment, flag: string, raw: string, detail: Record<string, unknown>) {
  const campId = await campIdOf(env, p.registration_id);
  await env.APP_DB.batch([
    env.APP_DB.prepare(
      `UPDATE camp_payments SET status = 'failed', flag = ?, checked_at = ?, raw_json = ?
       WHERE id = ? AND status <> 'success'`,
    ).bind(flag, nowIso(), raw, p.id),
    audit(env, campId, "payment.flagged", p.id, { reference: p.reference, flag, ...detail }),
    refreshRegistration(env, p.registration_id),
  ]);
  if (env.ALERT_PHONE) {
    await sendSms(env, env.ALERT_PHONE, `The Airport City Church, Commune: payment ${p.reference} needs a look (${flag.replace("_", " ")}).`, "Commune");
  }
}

const shortDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * "You're fully paid", once per person: the audit row is the claim, so a
 * repeat webhook or a second payment never texts twice. Points them at
 * roommates while the deadline hasn't passed.
 */
async function textFullyPaid(env: AppEnv, registrationId: string) {
  const r = await env.APP_DB.prepare(
    `SELECT r.full_name, r.phone, r.status, c.id AS camp_id, c.name, c.roommate_deadline_on, c.ends_on
     FROM camp_registrations r JOIN camps c ON c.id = r.camp_id WHERE r.id = ?`,
  )
    .bind(registrationId)
    .first<{ full_name: string; phone: string; status: string; camp_id: string; name: string; roommate_deadline_on: string; ends_on: string }>();
  const today = nowIso().slice(0, 10);
  if (!r || r.status !== "fully_paid" || !/^233\d{9}$/.test(r.phone) || today > r.ends_on) return;
  const claim = await env.APP_DB.prepare(
    `INSERT INTO camp_audit_log (camp_id, actor, action, entity, entity_id, after_json)
     SELECT ?1, ?2, 'registration.fully_paid_sms', 'registration', ?3, '{}'
     WHERE NOT EXISTS (SELECT 1 FROM camp_audit_log WHERE action = 'registration.fully_paid_sms' AND entity_id = ?3)`,
  )
    .bind(r.camp_id, ACTOR, registrationId)
    .run();
  if (claim.meta.changes !== 1) return;
  const first = r.full_name.trim().split(/\s+/)[0];
  const next = today <= r.roommate_deadline_on ? ` Next, choose your roommates by ${shortDay(r.roommate_deadline_on)} in Commune.` : "";
  await sendSms(env, r.phone, `Hi ${first}, you're fully paid for ${r.name}. Thank you!${next} - The Airport City Church`, "Commune");
}

/** Marks a payment successful and updates the balance, all or nothing. */
async function credit(env: AppEnv, p: Payment, paidAt: string | null, raw: string) {
  const now = nowIso();
  const campId = await campIdOf(env, p.registration_id);
  const [updated] = await env.APP_DB.batch([
    env.APP_DB.prepare(
      `UPDATE camp_payments SET status = 'success', flag = NULL, paid_at = ?2, checked_at = ?3, raw_json = ?4
       WHERE id = ?5 AND status <> 'success'
         AND amount_pesewas + ${netPaid("?1")} <= (SELECT price_pesewas FROM camp_registrations WHERE id = ?1)`,
    ).bind(p.registration_id, paidAt ?? now, now, raw, p.id),
    // Only when the update above changed the payment, so a repeat logs nothing.
    env.APP_DB.prepare(
      `INSERT INTO camp_audit_log (camp_id, actor, action, entity, entity_id, after_json)
       SELECT ?, ?, 'payment.success', 'payment', ?, ? WHERE changes() = 1`,
    ).bind(campId, ACTOR, p.id, JSON.stringify({ reference: p.reference, amount_pesewas: p.amount_pesewas })),
    refreshRegistration(env, p.registration_id),
  ]);
  if (updated.meta.changes === 1) {
    await textFullyPaid(env, p.registration_id).catch(() => undefined);
    return "success";
  }

  const now2 = await env.APP_DB.prepare("SELECT status FROM camp_payments WHERE id = ?")
    .bind(p.id)
    .first<{ status: string }>();
  if (now2?.status === "success") return "success"; // credited by a concurrent call
  // Paid, but the balance was already covered: a coordinator sends it back by hand.
  await flagPayment(env, p, "over_balance", raw, { amount_pesewas: p.amount_pesewas });
  return "failed";
}

const markFailed = (env: AppEnv, p: Payment, raw: string | null) =>
  env.APP_DB.prepare(
    `UPDATE camp_payments SET status = 'failed', checked_at = ?, raw_json = COALESCE(?, raw_json)
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(nowIso(), raw, p.id)
    .run();

const touch = (env: AppEnv, p: Payment) =>
  env.APP_DB.prepare("UPDATE camp_payments SET checked_at = ? WHERE id = ?").bind(nowIso(), p.id).run();

/**
 * A checkout from before the switch to expressPay can't be asked about any
 * more. Still pending, it's set aside (failed, flagged) so it doesn't block a
 * new payment; Money lists it so a coordinator can check Paystack's dashboard.
 */
async function retirePaystack(env: AppEnv, table: "camp_payments" | "camp_bulk_payments", id: string) {
  await env.APP_DB.prepare(`UPDATE ${table} SET status = 'failed', flag = 'paystack_unchecked', checked_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(nowIso(), id)
    .run();
}

/** Did expressPay take exactly what we asked? */
const exact = (a: ep.Answer, charged: number, currency: string) => a.amountPesewas === charged && (a.currency ?? "GHS") === currency;

/**
 * Asks expressPay about one payment and applies the answer. `giveUp` fails an
 * unfinished checkout straight away (when the attendee starts a new one).
 * A payment marked failed is still credited if expressPay later says it went
 * through, because the money was taken.
 */
async function settle(env: AppEnv, p: Payment, giveUp = false): Promise<Payment["status"]> {
  if (p.status === "success" || p.flag === "amount_mismatch" || p.flag === "over_balance") return p.status;
  if (p.bulk_id) {
    const bulk = await env.APP_DB.prepare("SELECT * FROM camp_bulk_payments WHERE id = ?").bind(p.bulk_id).first<Bulk>();
    // Never give up on a bulk checkout because one person started their own payment.
    if (bulk) await settleBulk(env, bulk);
    const now = await env.APP_DB.prepare("SELECT status FROM camp_payments WHERE id = ?").bind(p.id).first<{ status: Payment["status"] }>();
    return now?.status ?? p.status;
  }
  if (p.provider !== PROVIDER) {
    if (p.status === "pending") await retirePaystack(env, "camp_payments", p.id);
    return p.status === "pending" ? "failed" : p.status;
  }
  const old = Date.now() - Date.parse(p.created_at) > ABANDON_AFTER_MS;
  const a = p.provider_token ? await ep.query(env, p.provider_token) : null;

  if (!a) {
    // No token (the checkout never started) or expressPay didn't answer.
    if (p.status === "pending" && !p.provider_token && (giveUp || old)) await markFailed(env, p, null);
    else await touch(env, p);
    return p.status === "pending" && !p.provider_token && (giveUp || old) ? "failed" : p.status;
  }

  switch (a.outcome) {
    case "approved":
      if (!exact(a, p.charged_pesewas, p.currency)) {
        await flagPayment(env, p, "amount_mismatch", a.raw, {
          expected: { amount: p.charged_pesewas, currency: p.currency },
          received: { amount: a.amountPesewas, currency: a.currency },
        });
        return "failed";
      }
      return credit(env, p, a.processedAt, a.raw);
    case "declined":
      await markFailed(env, p, a.raw);
      return "failed";
    case "unknown":
      // Nobody has paid on expressPay's page (yet).
      if (p.status === "pending" && (giveUp || old)) {
        await markFailed(env, p, a.raw);
        return "failed";
      }
      await touch(env, p);
      return p.status;
    default:
      // Waiting: MoMo still to be approved on the phone. Never given up on here.
      await touch(env, p);
      return p.status;
  }
}

const paymentByReference = (env: AppEnv, ref: string) =>
  env.APP_DB.prepare("SELECT * FROM camp_payments WHERE reference = ?").bind(ref).first<Payment>();

const bulkByReference = (env: AppEnv, ref: string) =>
  env.APP_DB.prepare("SELECT * FROM camp_bulk_payments WHERE reference = ?").bind(ref).first<Bulk>();

const sharesOf = async (env: AppEnv, bulkId: string) =>
  (await env.APP_DB.prepare("SELECT * FROM camp_payments WHERE bulk_id = ?").bind(bulkId).all<Payment>()).results ?? [];

const setBulk = (env: AppEnv, bulk: Bulk, status: Bulk["status"], raw: string | null, flag: string | null = null, paidAt: string | null = null) =>
  env.APP_DB.prepare(
    `UPDATE camp_bulk_payments SET status = ?, flag = ?, paid_at = COALESCE(?, paid_at), checked_at = ?, raw_json = COALESCE(?, raw_json)
     WHERE id = ? AND status <> 'success'`,
  )
    .bind(status, flag, paidAt, nowIso(), raw, bulk.id)
    .run();

/**
 * The bulk version of settle: asks expressPay about the one checkout, then
 * credits each person's share. A share that no longer fits (they paid in the
 * meantime) is flagged over_balance for a refund; the rest still count.
 */
async function settleBulk(env: AppEnv, bulk: Bulk, giveUp = false): Promise<Bulk["status"]> {
  if (bulk.status === "success" || bulk.flag === "amount_mismatch") return bulk.status;
  const shares = await sharesOf(env, bulk.id);
  const failShares = async (raw: string | null) => {
    for (const p of shares) await markFailed(env, p, raw);
    await setBulk(env, bulk, "failed", raw);
  };
  if (bulk.provider !== PROVIDER) {
    if (bulk.status !== "pending") return bulk.status;
    for (const p of shares) await retirePaystack(env, "camp_payments", p.id);
    await retirePaystack(env, "camp_bulk_payments", bulk.id);
    return "failed";
  }
  const old = Date.now() - Date.parse(bulk.created_at) > ABANDON_AFTER_MS;
  const a = bulk.provider_token ? await ep.query(env, bulk.provider_token) : null;

  if (!a) {
    if (bulk.status === "pending" && !bulk.provider_token && (giveUp || old)) {
      await failShares(null);
      return "failed";
    }
    await env.APP_DB.prepare("UPDATE camp_bulk_payments SET checked_at = ? WHERE id = ?").bind(nowIso(), bulk.id).run();
    return bulk.status;
  }
  switch (a.outcome) {
    case "approved": {
      if (!exact(a, bulk.charged_pesewas, bulk.currency)) {
        await setBulk(env, bulk, "failed", a.raw, "amount_mismatch");
        for (const p of shares) await flagPayment(env, p, "amount_mismatch", a.raw, { bulk: bulk.reference });
        return "failed";
      }
      for (const p of shares) if (p.status !== "success") await credit(env, p, a.processedAt, a.raw);
      await setBulk(env, bulk, "success", a.raw, null, a.processedAt ?? nowIso());
      await env.APP_DB.prepare(
        `INSERT INTO camp_audit_log (camp_id, actor, action, entity, entity_id, after_json)
         VALUES (?, ?, 'payment.bulk_success', 'bulk_payment', ?, ?)`,
      )
        .bind(bulk.camp_id, ACTOR, bulk.id, JSON.stringify({ reference: bulk.reference, people: shares.length, paid_by: bulk.paid_by }))
        .run();
      return "success";
    }
    case "declined":
      await failShares(a.raw);
      return "failed";
    case "unknown":
      if (bulk.status === "pending" && (giveUp || old)) {
        await failShares(a.raw);
        return "failed";
      }
      await env.APP_DB.prepare("UPDATE camp_bulk_payments SET checked_at = ? WHERE id = ?").bind(nowIso(), bulk.id).run();
      return bulk.status;
    default:
      await env.APP_DB.prepare("UPDATE camp_bulk_payments SET checked_at = ? WHERE id = ?").bind(nowIso(), bulk.id).run();
      return bulk.status;
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

type Started = { reference: string; authorization_url: string; amount_pesewas: number; fee_pesewas: number; charged_pesewas: number; resumed?: boolean };

/**
 * Opens the checkout at expressPay for a payment row already written. On any
 * refusal the row is failed (init_failed) so a new payment can start.
 */
async function open(
  env: AppEnv,
  row: { table: "camp_payments" | "camp_bulk_payments"; id: string; reference: string; charged: number },
  redirectUrl: string,
  customer: ep.Customer,
  failShares?: string,
): Promise<string> {
  const fail = async (message: string, raw?: string) => {
    const now = nowIso();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`UPDATE ${row.table} SET status = 'failed', flag = 'init_failed', checked_at = ?, raw_json = ? WHERE id = ?`).bind(
        now,
        raw ?? JSON.stringify({ message }),
        row.id,
      ),
      ...(failShares
        ? [env.APP_DB.prepare("UPDATE camp_payments SET status = 'failed', flag = 'init_failed', checked_at = ? WHERE bulk_id = ?").bind(now, failShares)]
        : []),
    ]);
  };

  const started = await ep.submit(env, { orderId: row.reference, amountPesewas: row.charged, redirectUrl, customer });
  if ("error" in started) {
    console.error("expressPay submit refused", row.reference, started.error);
    await fail(started.error);
    throw new HttpError(502, "expressPay couldn't start the payment. Please try again.");
  }
  const url = ep.checkoutUrl(env, started.token);
  await env.APP_DB.prepare(`UPDATE ${row.table} SET provider_token = ?, checkout_url = ? WHERE id = ?`).bind(started.token, url, row.id).run();
  return url;
}

const customerFor = (reg: { full_name: string; phone: string; camp_name: string }, payerName: string): ep.Customer => ({
  name: payerName || reg.full_name,
  phone: reg.phone,
  description: `${reg.camp_name}: ${reg.full_name}`,
});

/** Starts a payment. The Next server has already checked ownership. */
export async function payInit(request: Request, env: AppEnv) {
  const body = await readJson<{
    registration_id?: unknown;
    amount_pesewas?: unknown;
    callback_url?: unknown;
    // Someone else paying through a pay link: their name.
    payer_name?: unknown;
    method?: unknown;
  }>(request);
  const payerName = typeof body.payer_name === "string" ? body.payer_name.trim().slice(0, 80) : "";
  const registrationId = typeof body.registration_id === "string" && UUID.test(body.registration_id) ? body.registration_id : null;
  const amount = body.amount_pesewas;
  const callbackUrl = typeof body.callback_url === "string" && /^https?:\/\//.test(body.callback_url) ? body.callback_url : null;
  if (!registrationId || !callbackUrl) throw new HttpError(400, "registration_id and callback_url required");
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < MIN_PESEWAS) {
    throw new HttpError(400, "The smallest payment is GHS 1.00.");
  }
  if (!ep.configured(env)) throw new HttpError(503, "payments are not set up");
  const method: PayMethod = body.method === "momo" ? "momo" : "card";

  const reg = await env.APP_DB.prepare(
    `SELECT r.id, r.full_name, r.phone, r.price_pesewas, r.status, c.fee_bps, c.momo_fee_bps, c.status AS camp_status, c.name AS camp_name
     FROM camp_registrations r JOIN camps c ON c.id = r.camp_id WHERE r.id = ?`,
  )
    .bind(registrationId)
    .first<{
      id: string;
      full_name: string;
      phone: string;
      price_pesewas: number;
      status: string;
      fee_bps: number;
      momo_fee_bps: number;
      camp_status: string;
      camp_name: string;
    }>();
  if (!reg) throw new HttpError(404, "registration not found");
  if (reg.status === "cancelled") throw new HttpError(409, "This registration has been cancelled.");
  if (reg.camp_status === "archived") throw new HttpError(409, "This camp is no longer taking payments.");

  const fee = feeFor(amount, rateFor(method, reg));

  // An earlier checkout still open: settle it first, so two can't overpay.
  const { results: open0 } = await env.APP_DB.prepare(
    "SELECT * FROM camp_payments WHERE registration_id = ? AND status = 'pending'",
  )
    .bind(registrationId)
    .all<Payment>();
  // A second tab (or a second tap) for the same payment opens the same checkout, so paying in
  // both can't charge twice. One that's still being opened is waited for, not replaced.
  for (const p of open0 ?? []) {
    const age = Date.now() - Date.parse(p.created_at);
    if (p.bulk_id || (p.method ?? "card") !== method || p.amount_pesewas !== amount || (p.payer_name ?? "") !== payerName || age > RESUME_WITHIN_MS) continue;
    if (p.checkout_url) {
      return json({ reference: p.reference, authorization_url: p.checkout_url, amount_pesewas: amount, fee_pesewas: p.fee_pesewas, charged_pesewas: p.charged_pesewas, resumed: true } satisfies Started);
    }
    if (age < 30_000) throw new HttpError(409, "Your payment is already opening. Give it a moment, then try again.");
  }
  for (const p of open0 ?? []) {
    if ((await settle(env, p, true)) === "pending") {
      throw new HttpError(
        409,
        p.method === "momo"
          ? "Your last MoMo payment is still waiting. Approve or decline it on your phone, then try again."
          : "Your last payment is still processing. Wait for it to finish, then try again.",
      );
    }
  }

  const id = crypto.randomUUID();
  const ref = reference();
  // Guarded: no other pending payment, and the amount fits the balance.
  const inserted = await env.APP_DB.prepare(
    `INSERT INTO camp_payments (id, registration_id, reference, amount_pesewas, fee_pesewas, charged_pesewas, payer_name, provider, method)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM camp_payments WHERE registration_id = ? AND status = 'pending')
       AND ? <= (SELECT price_pesewas - paid_pesewas FROM camp_registrations WHERE id = ?)`,
  )
    .bind(id, registrationId, ref, amount, fee, amount + fee, payerName, PROVIDER, method, registrationId, amount, registrationId)
    .run();
  if (inserted.meta.changes !== 1) {
    const now = await env.APP_DB.prepare("SELECT price_pesewas - paid_pesewas AS balance FROM camp_registrations WHERE id = ?")
      .bind(registrationId)
      .first<{ balance: number }>();
    if (!now || now.balance <= 0) throw new HttpError(409, "You're already fully paid.");
    if (amount > now.balance) throw new HttpError(400, "That's more than your balance.");
    throw new HttpError(409, "Your last payment is still processing. Wait for it to finish, then try again.");
  }

  const url = await open(env, { table: "camp_payments", id, reference: ref, charged: amount + fee }, callbackUrl, customerFor(reg, payerName));
  return json({ reference: ref, authorization_url: url, amount_pesewas: amount, fee_pesewas: fee, charged_pesewas: amount + fee } satisfies Started);
}

/** The processing page asking "has it gone through?". Throttled per payment. */
export async function payCheck(request: Request, env: AppEnv) {
  const { reference: ref, registration_id } = await readJson<{ reference?: unknown; registration_id?: unknown }>(request);
  if (typeof ref !== "string" || typeof registration_id !== "string") throw new HttpError(400, "reference required");
  const p = await paymentByReference(env, ref);
  if (!p || p.registration_id !== registration_id) throw new HttpError(404, "payment not found");
  const recent = p.checked_at && Date.now() - Date.parse(p.checked_at) < CHECK_EVERY_MS;
  const status = p.status === "pending" && !recent ? await settle(env, p) : p.status;
  return json({ status });
}

export async function reconcile(env: AppEnv, olderThanMs = RECONCILE_AFTER_MS) {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const { results } = await env.APP_DB.prepare(
    "SELECT * FROM camp_payments WHERE status = 'pending' AND bulk_id IS NULL AND created_at <= ? ORDER BY created_at LIMIT 50",
  )
    .bind(cutoff)
    .all<Payment>();
  const outcome: Record<string, number> = { checked: 0, success: 0, failed: 0, pending: 0, errors: 0 };
  const { results: bulks } = await env.APP_DB.prepare(
    "SELECT * FROM camp_bulk_payments WHERE status = 'pending' AND created_at <= ? ORDER BY created_at LIMIT 20",
  )
    .bind(cutoff)
    .all<Bulk>();
  for (const b of bulks ?? []) {
    outcome.checked++;
    try {
      outcome[await settleBulk(env, b)]++;
    } catch (err) {
      outcome.errors++;
      console.error("reconcile bulk", b.reference, err);
    }
  }
  for (const p of results ?? []) {
    outcome.checked++;
    try {
      outcome[await settle(env, p)]++;
    } catch (err) {
      outcome.errors++;
      console.error("reconcile", p.reference, err);
    }
  }
  // Rate-limit windows are at most a day long; older counters are dead weight.
  const pruned = await env.APP_DB.prepare("DELETE FROM camp_rate_limits WHERE window_start < ?")
    .bind(new Date(Date.now() - 86_400_000).toISOString())
    .run();
  outcome.rateLimitsPruned = pruned.meta.changes ?? 0;
  return outcome;
}

/**
 * "Check all with expressPay": what expressPay says about each of these
 * references, for the coordinators' report. expressPay has no list endpoint,
 * so the report asks about the payments Commune knows, a few dozen at a time.
 * Read-only: nothing here changes a payment.
 */
export async function providerCheck(request: Request, env: AppEnv) {
  const { references } = await readJson<{ references?: unknown }>(request);
  const refs = Array.isArray(references) ? [...new Set(references.filter((r): r is string => typeof r === "string" && /^CAMP-[0-9A-Z-]{6,40}$/.test(r)))] : [];
  if (refs.length === 0 || refs.length > 40) throw new HttpError(400, "send 1 to 40 references");
  const { results: rows } = await env.APP_DB.prepare(
    `SELECT reference, provider_token FROM camp_payments WHERE reference IN (SELECT value FROM json_each(?1)) AND bulk_id IS NULL
     UNION ALL SELECT reference, provider_token FROM camp_bulk_payments WHERE reference IN (SELECT value FROM json_each(?1))`,
  )
    .bind(JSON.stringify(refs))
    .all<{ reference: string; provider_token: string | null }>();

  type Seen = { reference: string; outcome: ep.Answer["outcome"] | "no_token" | "no_answer"; amount_pesewas: number | null; currency: string | null; text: string };
  const found: Seen[] = [];
  const queue = [...(rows ?? [])];
  // Six at a time keeps well inside the Worker's subrequest limits.
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        if (!row.provider_token) {
          found.push({ reference: row.reference, outcome: "no_token", amount_pesewas: null, currency: null, text: "" });
          continue;
        }
        const a = await ep.query(env, row.provider_token);
        found.push(
          a
            ? { reference: row.reference, outcome: a.outcome, amount_pesewas: a.amountPesewas, currency: a.currency, text: a.text }
            : { reference: row.reference, outcome: "no_answer", amount_pesewas: null, currency: null, text: "" },
        );
      }
    }),
  );
  return json({ results: found });
}

export async function postReconcile(request: Request, env: AppEnv) {
  const { older_than_minutes } = await readJson<{ older_than_minutes?: unknown }>(request);
  const minutes = typeof older_than_minutes === "number" && older_than_minutes >= 0 ? older_than_minutes : 10;
  return json(await reconcile(env, minutes * 60 * 1000));
}

/**
 * expressPay's post-url: it calls this when a pending payment (MoMo) finishes,
 * with the order-id and token. Unsigned, so it's only a nudge: the payment is
 * looked up by both, then expressPay is asked. Always answers 200, as
 * expressPay asks; unknown or mismatched notices do nothing.
 */
export async function expressPayNotice(request: Request, env: AppEnv) {
  const url = new URL(request.url);
  const raw = (await request.text()).slice(0, 8 * 1024);
  let fields: Record<string, unknown> = Object.fromEntries(url.searchParams);
  try {
    fields = { ...fields, ...(raw.trim().startsWith("{") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw))) };
  } catch {
    // Not a body we can read; the query string may still have it.
  }
  const ref = String(fields["order-id"] ?? fields.order_id ?? "");
  const token = String(fields.token ?? "");
  if (/^CAMP-[0-9A-Z-]{6,40}$/.test(ref) && token && token.length <= 1024) {
    // The token is the proof: only expressPay and Commune know it. No time throttle, so a real
    // notice for a checkout given up on a moment ago (money taken after all) is never dropped.
    const same = (stored: string | null) => Boolean(stored) && stored!.length === token.length && timingSafeEqual(stored!, token);
    const p = await paymentByReference(env, ref);
    if (p && !p.bulk_id && same(p.provider_token)) await settle(env, p);
    else if (!p) {
      const bulk = await bulkByReference(env, ref);
      if (bulk && same(bulk.provider_token)) await settleBulk(env, bulk);
    }
  }
  return json({ ok: true });
}

// ─── Paying for several people ───────────────────────────────────────────────

/**
 * A coordinator pays the outstanding balances of several people in one
 * expressPay checkout. The Next server has checked the coordinator role and
 * that everyone is in this camp. Each share is exactly that person's balance.
 */
export async function bulkInit(request: Request, env: AppEnv) {
  const body = await readJson<{
    camp_id?: unknown;
    registration_ids?: unknown;
    paid_by?: unknown;
    note?: unknown;
    callback_url?: unknown;
  }>(request);
  const campId = typeof body.camp_id === "string" && UUID.test(body.camp_id) ? body.camp_id : null;
  const ids = Array.isArray(body.registration_ids) ? [...new Set(body.registration_ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))] : [];
  const paidBy = typeof body.paid_by === "string" ? body.paid_by.slice(0, 254) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  const callbackUrl = typeof body.callback_url === "string" && /^https?:\/\//.test(body.callback_url) ? body.callback_url : null;
  if (!campId || !paidBy || !callbackUrl) throw new HttpError(400, "camp_id, paid_by and callback_url required");
  if (ids.length === 0) throw new HttpError(400, "Choose at least one person.");
  if (ids.length > 100) throw new HttpError(400, "Pay for up to 100 people at a time.");

  if (!ep.configured(env)) throw new HttpError(503, "payments are not set up");
  const camp = await env.APP_DB.prepare("SELECT fee_bps, momo_fee_bps, status, name FROM camps WHERE id = ?")
    .bind(campId)
    .first<{ fee_bps: number; momo_fee_bps: number; status: string; name: string }>();
  if (!camp) throw new HttpError(404, "camp not found");
  if (camp.status === "archived") throw new HttpError(409, "This camp is no longer taking payments.");

  const marks = ids.map(() => "?").join(",");
  const { results: regs } = await env.APP_DB.prepare(
    `SELECT id, full_name, price_pesewas - paid_pesewas AS balance, status FROM camp_registrations
     WHERE camp_id = ? AND id IN (${marks})`,
  )
    .bind(campId, ...ids)
    .all<{ id: string; full_name: string; balance: number; status: string }>();
  const owing = (regs ?? []).filter((r) => r.status !== "cancelled" && r.balance > 0);
  if (owing.length === 0) throw new HttpError(409, "Everyone you picked is already fully paid.");

  // Open checkouts first, as for a single payment.
  for (const r of owing) {
    const { results: open } = await env.APP_DB.prepare("SELECT * FROM camp_payments WHERE registration_id = ? AND status = 'pending'")
      .bind(r.id)
      .all<Payment>();
    for (const p of open ?? []) {
      // The same coordinator starting again gives up on their own unfinished checkout.
      const mine = p.bulk_id && (await env.APP_DB.prepare("SELECT * FROM camp_bulk_payments WHERE id = ?").bind(p.bulk_id).first<Bulk>());
      if (mine && mine.paid_by === paidBy && mine.status === "pending") await settleBulk(env, mine, true);
      if ((await settle(env, p, !p.bulk_id)) === "pending") {
        throw new HttpError(409, `${r.full_name} has a payment still processing. Resume it or cancel it first.`);
      }
    }
  }

  const amount = owing.reduce((sum, r) => sum + r.balance, 0);
  // Coordinators aren't asked how they'll pay, so the higher rate applies.
  const fee = feeFor(amount, Math.max(camp.fee_bps, camp.momo_fee_bps));
  const bulkId = crypto.randomUUID();
  const ref = bulkReference();
  const results = await env.APP_DB.batch([
    env.APP_DB.prepare(
      `INSERT INTO camp_bulk_payments (id, camp_id, reference, paid_by, note, amount_pesewas, fee_pesewas, charged_pesewas, provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(bulkId, campId, ref, paidBy, note, amount, fee, amount + fee, PROVIDER),
    ...owing.map((r, i) =>
      env.APP_DB.prepare(
        `INSERT INTO camp_payments (id, registration_id, reference, amount_pesewas, fee_pesewas, charged_pesewas, bulk_id, payer_name, provider)
         SELECT ?, ?, ?, ?, 0, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM camp_payments WHERE registration_id = ? AND status = 'pending')
           AND ? = (SELECT price_pesewas - paid_pesewas FROM camp_registrations WHERE id = ? AND status <> 'cancelled')`,
      ).bind(crypto.randomUUID(), r.id, `${ref}-${i + 1}`, r.balance, r.balance, bulkId, note || paidBy, PROVIDER, r.id, r.balance, r.id),
    ),
  ]);
  if (results.slice(1).some((r) => r.meta.changes !== 1)) {
    await env.APP_DB.batch([
      env.APP_DB.prepare("UPDATE camp_payments SET status = 'failed', flag = 'init_failed', checked_at = ? WHERE bulk_id = ?").bind(nowIso(), bulkId),
      env.APP_DB.prepare("UPDATE camp_bulk_payments SET status = 'failed', flag = 'init_failed', checked_at = ? WHERE id = ?").bind(nowIso(), bulkId),
    ]);
    throw new HttpError(409, "Someone's balance changed just now. Refresh and try again.");
  }

  const url = await open(
    env,
    { table: "camp_bulk_payments", id: bulkId, reference: ref, charged: amount + fee },
    callbackUrl,
    {
      name: paidBy.includes("@") ? paidBy.split("@")[0] : paidBy,
      phone: "",
      description: `${camp.name}: ${owing.length} ${owing.length === 1 ? "person" : "people"}${note ? ` (${note})` : ""}`,
    },
    bulkId,
  );
  return json({
    reference: ref,
    authorization_url: url,
    people: owing.length,
    amount_pesewas: amount,
    fee_pesewas: fee,
    charged_pesewas: amount + fee,
  });
}

/**
 * "Cancel it" on a payment that's still processing. Asks expressPay first: if
 * it was paid it's credited; if nobody finished the checkout it's given up,
 * so a new payment can start; if mobile money is still waiting for approval
 * on a phone it stays as it is. Never cancels a payment expressPay might
 * still take.
 */
export async function payCancel(request: Request, env: AppEnv) {
  const { reference: ref, camp_id } = await readJson<{ reference?: unknown; camp_id?: unknown }>(request);
  if (typeof ref !== "string" || typeof camp_id !== "string") throw new HttpError(400, "reference and camp_id required");
  const bulk = await bulkByReference(env, ref);
  let status: Payment["status"];
  if (bulk) {
    if (bulk.camp_id !== camp_id) throw new HttpError(404, "payment not found");
    status = await settleBulk(env, bulk, true);
    if (status === "failed") await env.APP_DB.prepare("UPDATE camp_bulk_payments SET checkout_url = NULL WHERE id = ?").bind(bulk.id).run();
  } else {
    const p = await paymentByReference(env, ref);
    if (!p || (await campIdOf(env, p.registration_id)) !== camp_id) throw new HttpError(404, "payment not found");
    status = await settle(env, p, true);
    if (status === "failed") await env.APP_DB.prepare("UPDATE camp_payments SET checkout_url = NULL WHERE id = ?").bind(p.id).run();
  }
  return json({ status });
}

/** The coordinator's "processing" page asking about a bulk checkout. */
export async function bulkCheck(request: Request, env: AppEnv) {
  const { reference: ref, camp_id } = await readJson<{ reference?: unknown; camp_id?: unknown }>(request);
  if (typeof ref !== "string" || typeof camp_id !== "string") throw new HttpError(400, "reference required");
  const bulk = await bulkByReference(env, ref);
  if (!bulk || bulk.camp_id !== camp_id) throw new HttpError(404, "payment not found");
  const recent = bulk.checked_at && Date.now() - Date.parse(bulk.checked_at) < CHECK_EVERY_MS;
  const status = bulk.status === "pending" && !recent ? await settleBulk(env, bulk) : bulk.status;
  const shares = await sharesOf(env, bulk.id);
  return json({ status, people: shares.length, credited: shares.filter((p) => p.status === "success").length });
}
