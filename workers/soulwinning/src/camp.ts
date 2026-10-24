import { sendSms } from "./sms";
import { HttpError, UUID, json, nowIso, readJson, timingSafeEqual, type AppEnv } from "./util";

/**
 * Camp payments through Paystack. The Paystack secret lives only here.
 *
 *   Next server (ADMIN_SECRET) → /v1/admin/camp/pay-init, /check, /reconcile
 *   Paystack                   → /v1/camp/paystack/webhook (via workers.dev)
 *   Every 10 minutes           → reconcile, for webhooks that never arrived
 *
 * The webhook and reconciliation never trust what they're told: both ask
 * Paystack's verify endpoint and credit a payment only when the amount and
 * currency match exactly. Crediting is one guarded D1 batch (payment, audit
 * entry, registration balance and status), so a repeat does nothing and two
 * payments can never add up to more than the price.
 */

const API = (env: AppEnv) => env.PAYSTACK_API_URL || "https://api.paystack.co";
const ACTOR = "paystack";
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
};

type Verified = { status?: string; amount?: number; currency?: string; paid_at?: string | null };

/**
 * Paystack's fee, passed on so the church receives the full instalment:
 * charged × (1 − rate) ≥ amount. Integer maths, rounded up to the pesewa.
 * Mirrored in src/lib/camp/money.ts for the fee shown before paying.
 */
export function feeFor(amountPesewas: number, feeBps: number) {
  if (feeBps <= 0) return 0;
  return Math.ceil((amountPesewas * 10000) / (10000 - feeBps)) - amountPesewas;
}

async function paystack<T>(env: AppEnv, path: string, init: RequestInit = {}) {
  if (!env.PAYSTACK_SECRET_KEY) throw new HttpError(503, "payments are not set up");
  const res = await fetch(`${API(env)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  return { ok: res.ok && body.status === true, message: body.message ?? "", data: body.data };
}

const reference = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `CAMP-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};

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
       END
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
  ]);
  if (env.ALERT_PHONE) {
    await sendSms(env, env.ALERT_PHONE, `TACC camp: payment ${p.reference} needs a look (${flag.replace("_", " ")}).`);
  }
}

/** Marks a payment successful and updates the balance, all or nothing. */
async function credit(env: AppEnv, p: Payment, verified: Verified, raw: string) {
  const now = nowIso();
  const campId = await campIdOf(env, p.registration_id);
  const [updated] = await env.APP_DB.batch([
    env.APP_DB.prepare(
      `UPDATE camp_payments SET status = 'success', flag = NULL, paid_at = ?2, checked_at = ?3, raw_json = ?4
       WHERE id = ?5 AND status <> 'success'
         AND amount_pesewas + ${netPaid("?1")} <= (SELECT price_pesewas FROM camp_registrations WHERE id = ?1)`,
    ).bind(p.registration_id, verified.paid_at ?? now, now, raw, p.id),
    // Only when the update above changed the payment, so a repeat logs nothing.
    env.APP_DB.prepare(
      `INSERT INTO camp_audit_log (camp_id, actor, action, entity, entity_id, after_json)
       SELECT ?, ?, 'payment.success', 'payment', ?, ? WHERE changes() = 1`,
    ).bind(campId, ACTOR, p.id, JSON.stringify({ reference: p.reference, amount_pesewas: p.amount_pesewas })),
    refreshRegistration(env, p.registration_id),
  ]);
  if (updated.meta.changes === 1) return "success";

  const now2 = await env.APP_DB.prepare("SELECT status FROM camp_payments WHERE id = ?")
    .bind(p.id)
    .first<{ status: string }>();
  if (now2?.status === "success") return "success"; // credited by a concurrent call
  // Paid on Paystack, but the balance was already covered: refund in Paystack.
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
 * Asks Paystack about one payment and applies the answer. `giveUp` fails an
 * unfinished checkout straight away (when the attendee starts a new one).
 * A payment marked failed is still credited if Paystack later says it went
 * through, because the money was taken.
 */
async function settle(env: AppEnv, p: Payment, giveUp = false): Promise<Payment["status"]> {
  if (p.status === "success" || p.flag === "amount_mismatch" || p.flag === "over_balance") return p.status;
  const v = await paystack<Verified>(env, `/transaction/verify/${encodeURIComponent(p.reference)}`);
  const old = Date.now() - Date.parse(p.created_at) > ABANDON_AFTER_MS;

  if (!v.ok || !v.data) {
    // Paystack doesn't know it: the checkout never started.
    if (p.status === "pending" && (giveUp || old)) await markFailed(env, p, null);
    else await touch(env, p);
    return giveUp || old ? "failed" : p.status;
  }

  const raw = JSON.stringify(v.data).slice(0, 20_000);
  switch (v.data.status) {
    case "success":
      if (v.data.amount !== p.charged_pesewas || v.data.currency !== p.currency) {
        await flagPayment(env, p, "amount_mismatch", raw, {
          expected: { amount: p.charged_pesewas, currency: p.currency },
          received: { amount: v.data.amount, currency: v.data.currency },
        });
        return "failed";
      }
      return credit(env, p, v.data, raw);
    case "failed":
    case "reversed":
      await markFailed(env, p, raw);
      return "failed";
    case "abandoned":
      if (p.status === "pending" && (giveUp || old)) {
        await markFailed(env, p, raw);
        return "failed";
      }
      await touch(env, p);
      return p.status;
    default:
      // ongoing, pending, processing, queued: mobile money still waiting.
      await touch(env, p);
      return p.status;
  }
}

const paymentByReference = (env: AppEnv, ref: string) =>
  env.APP_DB.prepare("SELECT * FROM camp_payments WHERE reference = ?").bind(ref).first<Payment>();

// ─── Endpoints ───────────────────────────────────────────────────────────────

/** Starts a Paystack checkout. The Next server has already checked ownership. */
export async function payInit(request: Request, env: AppEnv) {
  const body = await readJson<{ registration_id?: unknown; amount_pesewas?: unknown; callback_url?: unknown }>(request);
  const registrationId = typeof body.registration_id === "string" && UUID.test(body.registration_id) ? body.registration_id : null;
  const amount = body.amount_pesewas;
  const callbackUrl = typeof body.callback_url === "string" && /^https?:\/\//.test(body.callback_url) ? body.callback_url : null;
  if (!registrationId || !callbackUrl) throw new HttpError(400, "registration_id and callback_url required");
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < MIN_PESEWAS) {
    throw new HttpError(400, "The smallest payment is GHS 1.00.");
  }

  const reg = await env.APP_DB.prepare(
    `SELECT r.id, r.email, r.price_pesewas, r.status, c.fee_bps, c.status AS camp_status
     FROM camp_registrations r JOIN camps c ON c.id = r.camp_id WHERE r.id = ?`,
  )
    .bind(registrationId)
    .first<{ id: string; email: string; price_pesewas: number; status: string; fee_bps: number; camp_status: string }>();
  if (!reg) throw new HttpError(404, "registration not found");
  if (reg.status === "cancelled") throw new HttpError(409, "This registration has been cancelled.");
  if (reg.camp_status === "archived") throw new HttpError(409, "This camp is no longer taking payments.");

  // An earlier checkout still open: settle it first, so two can't overpay.
  const { results: open } = await env.APP_DB.prepare(
    "SELECT * FROM camp_payments WHERE registration_id = ? AND status = 'pending'",
  )
    .bind(registrationId)
    .all<Payment>();
  for (const p of open ?? []) {
    if ((await settle(env, p, true)) === "pending") {
      throw new HttpError(409, "Your last payment is still processing. Wait for it to finish, then try again.");
    }
  }

  const fee = feeFor(amount, reg.fee_bps);
  const id = crypto.randomUUID();
  const ref = reference();
  // Guarded: no other pending payment, and the amount fits the balance.
  const inserted = await env.APP_DB.prepare(
    `INSERT INTO camp_payments (id, registration_id, reference, amount_pesewas, fee_pesewas, charged_pesewas)
     SELECT ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM camp_payments WHERE registration_id = ? AND status = 'pending')
       AND ? <= (SELECT price_pesewas - paid_pesewas FROM camp_registrations WHERE id = ?)`,
  )
    .bind(id, registrationId, ref, amount, fee, amount + fee, registrationId, amount, registrationId)
    .run();
  if (inserted.meta.changes !== 1) {
    const now = await env.APP_DB.prepare("SELECT price_pesewas - paid_pesewas AS balance FROM camp_registrations WHERE id = ?")
      .bind(registrationId)
      .first<{ balance: number }>();
    if (!now || now.balance <= 0) throw new HttpError(409, "You're already fully paid.");
    if (amount > now.balance) throw new HttpError(400, "That's more than your balance.");
    throw new HttpError(409, "Your last payment is still processing. Wait for it to finish, then try again.");
  }

  const init = await paystack<{ authorization_url?: string }>(env, "/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: reg.email,
      amount: amount + fee,
      currency: "GHS",
      reference: ref,
      callback_url: callbackUrl,
      metadata: { registration_id: registrationId, payment_id: id },
    }),
  });
  if (!init.ok || !init.data?.authorization_url) {
    await env.APP_DB.prepare(
      "UPDATE camp_payments SET status = 'failed', flag = 'init_failed', checked_at = ?, raw_json = ? WHERE id = ?",
    )
      .bind(nowIso(), JSON.stringify({ message: init.message }), id)
      .run();
    throw new HttpError(502, "Paystack couldn't start the payment. Please try again.");
  }
  return json({
    reference: ref,
    authorization_url: init.data.authorization_url,
    amount_pesewas: amount,
    fee_pesewas: fee,
    charged_pesewas: amount + fee,
  });
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
    "SELECT * FROM camp_payments WHERE status = 'pending' AND created_at <= ? ORDER BY created_at LIMIT 50",
  )
    .bind(cutoff)
    .all<Payment>();
  const outcome: Record<string, number> = { checked: 0, success: 0, failed: 0, pending: 0, errors: 0 };
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
 * Paystack's own list of camp transactions (references starting CAMP-) in a
 * date range, for the coordinators' reconciliation report. Only the fields
 * the report compares; no customer details.
 */
export async function paystackTransactions(request: Request, env: AppEnv) {
  const { from, to } = await readJson<{ from?: unknown; to?: unknown }>(request);
  const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  const range = { from: iso(from), to: iso(to) };
  if (!range.from || !range.to) throw new HttpError(400, "from and to dates required");

  type Tx = { reference: string; amount: number; currency: string; status: string; paid_at: string | null };
  const found: Tx[] = [];
  for (let page = 1; page <= 50; page++) {
    const query = new URLSearchParams({ from: range.from, to: range.to, perPage: "100", page: String(page) });
    const res = await paystack<Tx[]>(env, `/transaction?${query}`);
    if (!res.ok) throw new HttpError(502, `Paystack: ${res.message || "list failed"}`);
    const rows = res.data ?? [];
    for (const t of rows) {
      if (t.reference?.startsWith("CAMP-")) {
        found.push({ reference: t.reference, amount: t.amount, currency: t.currency, status: t.status, paid_at: t.paid_at ?? null });
      }
    }
    if (rows.length < 100) return json({ transactions: found, complete: true });
  }
  return json({ transactions: found, complete: false });
}

export async function postReconcile(request: Request, env: AppEnv) {
  const { older_than_minutes } = await readJson<{ older_than_minutes?: unknown }>(request);
  const minutes = typeof older_than_minutes === "number" && older_than_minutes >= 0 ? older_than_minutes : 10;
  return json(await reconcile(env, minutes * 60 * 1000));
}

async function signature(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Paystack's webhook: the only unauthenticated write. The signature is checked
 * on the raw body before anything is parsed, then the payment is verified with
 * Paystack rather than trusting the event's own fields.
 */
export async function paystackWebhook(request: Request, env: AppEnv) {
  if (!env.PAYSTACK_SECRET_KEY) throw new HttpError(503, "payments are not set up");
  const raw = await request.text();
  if (raw.length > 256 * 1024) throw new HttpError(413, "request too large");
  const given = (request.headers.get("x-paystack-signature") ?? "").toLowerCase();
  if (!given || !timingSafeEqual(given, await signature(env.PAYSTACK_SECRET_KEY, raw))) {
    throw new HttpError(401, "bad signature");
  }

  let event: { event?: string; data?: { reference?: unknown } };
  try {
    event = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
  const ref = event.data?.reference;
  if (event.event === "charge.success" && typeof ref === "string") {
    const p = await paymentByReference(env, ref);
    if (p) await settle(env, p);
  }
  // Always 200 once signed, or Paystack keeps retrying events we don't use.
  return json({ ok: true });
}
