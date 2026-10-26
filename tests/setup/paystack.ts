import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { TEST_PAYSTACK_PORT, TEST_PAYSTACK_SECRET, TEST_WORKER_URL } from "./constants";

/**
 * A stand-in for api.paystack.co that the local Worker calls instead.
 * Initialize records the transaction as "abandoned" (what Paystack reports
 * before the customer pays); tests then decide what verify answers.
 */

type Transaction = { reference: string; amount: number; currency: string; email: string; status: string; created_at: string };

export const transactions = new Map<string, Transaction>();
/** Texts the Worker sent through the fake mNotify (/mnotify/sms/quick). */
export const smsSent: { recipient: string[]; message: string }[] = [];
/** Refunds the Worker asked for (POST /refund). */
export const refundsAsked: { transaction: string; amount: number }[] = [];
let failInitialize = false;
let failRefund = false;
export const setFailRefund = (fail: boolean) => {
  failRefund = fail;
};

export function setTransaction(reference: string, patch: Partial<Transaction>) {
  const current = transactions.get(reference);
  if (!current) throw new Error(`fake Paystack has no ${reference}`);
  transactions.set(reference, { ...current, ...patch });
}

/** Paystack says the customer paid exactly what was asked. */
export const succeed = (reference: string) => setTransaction(reference, { status: "success" });

export const setFailInitialize = (fail: boolean) => {
  failInitialize = fail;
};

export function startFakePaystack(): Promise<Server> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const send = (status: number, data: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (req.method === "POST" && req.url?.startsWith("/mnotify/sms/quick")) {
        const { recipient, message } = JSON.parse(body);
        smsSent.push({ recipient, message });
        return send(200, { status: "success" });
      }
      if (req.headers.authorization !== `Bearer ${TEST_PAYSTACK_SECRET}`) return send(401, { status: false });

      if (req.method === "POST" && req.url === "/transaction/initialize") {
        if (failInitialize) return send(400, { status: false, message: "Invalid key" });
        const input = JSON.parse(body);
        transactions.set(input.reference, {
          reference: input.reference,
          amount: input.amount,
          currency: input.currency,
          email: input.email,
          status: "abandoned",
          created_at: new Date().toISOString(),
        });
        return send(200, {
          status: true,
          data: { authorization_url: `https://checkout.paystack.test/${input.reference}`, reference: input.reference },
        });
      }
      if (req.method === "POST" && req.url === "/refund") {
        if (failRefund) return send(400, { status: false, message: "Refund failed" });
        const input = JSON.parse(body);
        const tx = transactions.get(input.transaction);
        if (!tx || tx.status !== "success") return send(400, { status: false, message: "Transaction not found" });
        const done = refundsAsked.filter((r) => r.transaction === input.transaction).reduce((sum, r) => sum + r.amount, 0);
        if (done + input.amount > tx.amount) return send(400, { status: false, message: "Refund amount is more than the transaction" });
        refundsAsked.push({ transaction: input.transaction, amount: input.amount });
        return send(200, { status: true, data: { id: refundsAsked.length, status: "pending" } });
      }
      const verify = req.url?.match(/^\/transaction\/verify\/(.+)$/);
      if (req.method === "GET" && verify) {
        const tx = transactions.get(decodeURIComponent(verify[1]));
        if (!tx) return send(400, { status: false, message: "Transaction reference not found" });
        return send(200, {
          status: true,
          data: { ...tx, paid_at: tx.status === "success" ? new Date().toISOString() : null },
        });
      }
      // List transactions in a date range, a page at a time, like Paystack's GET /transaction.
      if (req.method === "GET" && req.url?.startsWith("/transaction?")) {
        const q = new URL(req.url, "http://fake").searchParams;
        const perPage = Number(q.get("perPage") ?? 50);
        const page = Number(q.get("page") ?? 1);
        const inRange = [...transactions.values()].filter(
          (t) => t.created_at >= (q.get("from") ?? "") && t.created_at <= (q.get("to") ?? "~"),
        );
        return send(200, {
          status: true,
          data: inRange
            .slice((page - 1) * perPage, page * perPage)
            .map((t) => ({ ...t, paid_at: t.status === "success" ? t.created_at : null })),
        });
      }
      send(404, { status: false });
    });
  });
  return new Promise((resolve) => server.listen(TEST_PAYSTACK_PORT, "127.0.0.1", () => resolve(server)));
}

/** Sends a charge.success webhook to the local Worker, signed like Paystack signs it. */
export async function sendWebhook(reference: string, opts: { secret?: string } = {}) {
  const body = JSON.stringify({ event: "charge.success", data: { reference } });
  const signature = createHmac("sha512", opts.secret ?? TEST_PAYSTACK_SECRET).update(body).digest("hex");
  return fetch(`${TEST_WORKER_URL}/v1/camp/paystack/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
    body,
  });
}
