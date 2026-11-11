import { HttpError, type AppEnv } from "./util";

/**
 * expressPay's Merchant API (expresspaygh.com/developers/docs). Every call is a
 * form POST carrying the merchant ID and API key, which live only here.
 *
 *   submit.php → a token for one checkout (expressPay's own page, MoMo or card)
 *   query.php  → where a payment stands, by token
 *
 * expressPay has no refund or transaction-list endpoint, and its post-url
 * notice is unsigned: it only ever makes us ask query.php again. Their Direct
 * API (taking MoMo inside Commune) needs PCI DSS certification, so it isn't used.
 */

const LIVE = "https://expresspaygh.com/api";

/** Sandbox: https://sandbox.expresspaygh.com/api. Tests point it at a fake. */
export const apiBase = (env: AppEnv) => (env.EXPRESSPAY_API_URL || LIVE).replace(/\/+$/, "");

/** expressPay's checkout page for a token. */
export const checkoutUrl = (env: AppEnv, token: string) => `${apiBase(env)}/checkout.php?token=${encodeURIComponent(token)}`;

export const configured = (env: AppEnv) => Boolean(env.EXPRESSPAY_MERCHANT_ID && env.EXPRESSPAY_API_KEY);

async function call(env: AppEnv, path: string, fields: Record<string, string>) {
  if (!configured(env)) throw new HttpError(503, "payments are not set up");
  const body = new URLSearchParams({ "merchant-id": env.EXPRESSPAY_MERCHANT_ID!, "api-key": env.EXPRESSPAY_API_KEY!, ...fields });
  const res = await fetch(`${apiBase(env)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON: treated as no answer below.
  }
  return { httpOk: res.ok, data };
}

/** Pesewas → "350.00". */
export const cedis = (pesewas: number) => `${Math.floor(pesewas / 100)}.${String(pesewas % 100).padStart(2, "0")}`;

/** expressPay's amount ("350.00", "350", 350 or 350.5) → pesewas, or null. Never through float maths for strings. */
export function toPesewas(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== "string") return null;
  const m = value.trim().replace(/,/g, "").match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

const SUBMIT_STATUS: Record<number, string> = { 2: "invalid credentials", 3: "invalid request", 4: "invalid IP" };

/**
 * No email: expressPay needs a different email for every customer, and family
 * members often share one. Commune texts its own receipt instead.
 */
export type Customer = { name: string; phone: string; description: string };

/** Starts a checkout. Returns expressPay's token, or why it refused. */
export async function submit(
  env: AppEnv,
  input: { orderId: string; amountPesewas: number; redirectUrl: string; customer: Customer | null },
): Promise<{ token: string } | { error: string }> {
  const fields: Record<string, string> = {
    currency: "GHS",
    amount: cedis(input.amountPesewas),
    "order-id": input.orderId,
    "post-url": notifyUrl(env),
    "redirect-url": input.redirectUrl,
  };
  if (input.customer) {
    const [first, ...rest] = input.customer.name.trim().split(/\s+/);
    fields.firstname = (first || "Camp").slice(0, 32);
    fields.lastname = (rest.join(" ") || "-").slice(0, 64);
    if (input.customer.phone) fields.phonenumber = input.customer.phone.slice(0, 64);
    fields["order-desc"] = input.customer.description.slice(0, 256);
  }
  const { data } = await call(env, "/submit.php", fields);
  const status = Number(data.status);
  if (status === 1 && typeof data.token === "string" && data.token) return { token: data.token };
  return { error: SUBMIT_STATUS[status] ?? (typeof data.message === "string" ? data.message : "no answer") };
}

export type Answer = {
  /** approved, declined, waiting (MoMo still to be approved on the phone), unknown (nothing paid yet, or no clear answer) */
  outcome: "approved" | "declined" | "waiting" | "unknown";
  amountPesewas: number | null;
  currency: string | null;
  text: string;
  transactionId: string | null;
  processedAt: string | null;
  raw: string;
};

/**
 * Reads a query/checkout answer. Result 3 covers both "Error in transaction
 * data" and "No transaction data available" (a checkout nobody has paid yet),
 * so it's only a decline when expressPay has a transaction to show for it.
 */
export function readAnswer(data: Record<string, unknown>): Answer {
  const result = Number(data.result);
  const transactionId = String(data["transaction-id"] ?? data.transaction_id ?? "") || null;
  const text = String(data["result-text"] ?? "");
  const outcome: Answer["outcome"] =
    result === 1 ? "approved" : result === 2 ? "declined" : result === 4 ? "waiting" : result === 3 && transactionId ? "declined" : "unknown";
  const processed = String(data["date-processed"] ?? "");
  return {
    outcome,
    amountPesewas: toPesewas(data.amount),
    currency: typeof data.currency === "string" ? data.currency : null,
    text,
    transactionId,
    processedAt: processed && !Number.isNaN(Date.parse(processed)) ? new Date(processed).toISOString() : null,
    raw: JSON.stringify(data).slice(0, 20_000),
  };
}

/** Where a payment stands. Null when expressPay couldn't be asked. */
export async function query(env: AppEnv, token: string): Promise<Answer | null> {
  try {
    const { httpOk, data } = await call(env, "/query.php", { token });
    if (!httpOk || !("result" in data)) return null;
    return readAnswer(data);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("expressPay query", err);
    return null;
  }
}

/** Where expressPay posts when a pending payment finishes. */
export const notifyUrl = (env: AppEnv) => env.EXPRESSPAY_NOTIFY_URL || "https://sw-api.theairportcitychurch.com/v1/camp/ep";
