import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { TEST_PAYSTACK_PORT, TEST_PAYSTACK_SECRET, TEST_WORKER_URL } from "./constants";

/**
 * A stand-in for api.paystack.co that the local Worker calls instead.
 * Initialize records the transaction as "abandoned" (what Paystack reports
 * before the customer pays); tests then decide what verify answers.
 */

type Transaction = { reference: string; amount: number; currency: string; email: string; status: string };

export const transactions = new Map<string, Transaction>();
let failInitialize = false;

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
        });
        return send(200, {
          status: true,
          data: { authorization_url: `https://checkout.paystack.test/${input.reference}`, reference: input.reference },
        });
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
