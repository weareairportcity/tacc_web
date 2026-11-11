import { createServer, type Server } from "node:http";
import { TEST_EXPRESSPAY_KEY, TEST_EXPRESSPAY_MERCHANT, TEST_PROVIDER_PORT, TEST_WORKER_URL } from "./constants";

/**
 * A stand-in for expressPay's Merchant API that the local Worker calls
 * instead (EXPRESSPAY_API_URL=http://127.0.0.1:<port>/expresspay). It answers
 * the way the real sandbox did on 10 Nov 2026: form posts in, JSON out, the
 * amount as a cedi string, and result 3 "No transaction data available" for a
 * checkout nobody has paid yet. Tests decide what query.php answers next.
 * The same server also stands in for mNotify (/mnotify/sms/quick).
 */

export type OrderStatus = "unpaid" | "approved" | "declined" | "waiting" | "error";
type Order = {
  reference: string;
  token: string;
  /** In pesewas, as asked; tests may change it to fake a mismatch. */
  amount: number;
  currency: string;
  /** Null when none was sent (Commune sends none). */
  email: string | null;
  firstname: string;
  phonenumber: string;
  redirect: string;
  status: OrderStatus;
  created_at: string;
};

export const orders = new Map<string, Order>();
/** Texts the Worker sent through the fake mNotify. */
export const smsSent: { recipient: string[]; message: string }[] = [];
/** Every query.php call, by token, so tests can see what was asked. */
export const queried: string[] = [];

let failSubmit = false;
export const setFailSubmit = (fail: boolean) => {
  failSubmit = fail;
};

export function setOrder(reference: string, patch: Partial<Order>) {
  const current = orders.get(reference);
  if (!current) throw new Error(`fake expressPay has no ${reference}`);
  orders.set(reference, { ...current, ...patch });
}

/** expressPay says the customer paid exactly what was asked. */
export const succeed = (reference: string) => setOrder(reference, { status: "approved" });

const cedis = (pesewas: number) => `${Math.floor(pesewas / 100)}.${String(pesewas % 100).padStart(2, "0")}`;
const RESULT: Record<OrderStatus, [number, string]> = {
  approved: [1, "Approved"],
  declined: [2, "Declined"],
  error: [3, "Error in transaction data or system error"],
  unpaid: [3, "No transaction data available"],
  waiting: [4, "Pending"],
};

function answer(o: Order) {
  const [result, text] = RESULT[o.status];
  const paidSomehow = o.status !== "unpaid";
  return {
    result,
    "result-text": text,
    "order-id": o.reference,
    token: o.token,
    currency: o.currency,
    amount: cedis(o.amount),
    ...(paidSomehow ? { "transaction-id": `TX${o.token.slice(0, 8)}`, "date-processed": new Date().toISOString() } : {}),
  };
}

export function startFakeExpressPay(): Promise<Server> {
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
      if (req.method !== "POST" || !req.url?.startsWith("/expresspay/")) return send(404, {});
      const f = new URLSearchParams(body);
      const path = req.url.slice("/expresspay".length);
      const signedIn = f.get("merchant-id") === TEST_EXPRESSPAY_MERCHANT && f.get("api-key") === TEST_EXPRESSPAY_KEY;

      if (path === "/submit.php") {
        if (!signedIn) return send(200, { status: 2, message: "Invalid Credentials" });
        const reference = f.get("order-id") ?? "";
        const amount = (f.get("amount") ?? "").match(/^(\d+)\.(\d{2})$/);
        if (failSubmit || !reference || !amount || !f.get("post-url")?.startsWith("https://")) return send(200, { status: 3, message: "Invalid Request" });
        const token = `${crypto.randomUUID().replace(/-/g, "")}.${Date.now()}`;
        orders.set(reference, {
          reference,
          token,
          amount: Number(amount[1]) * 100 + Number(amount[2]),
          currency: f.get("currency") ?? "",
          email: f.get("email"),
          firstname: f.get("firstname") ?? "",
          phonenumber: f.get("phonenumber") ?? "",
          redirect: f.get("redirect-url") ?? "",
          status: "unpaid",
          created_at: new Date().toISOString(),
        });
        return send(200, { status: 1, "order-id": reference, token, message: "Success" });
      }
      if (path === "/query.php") {
        if (f.get("merchant-id") !== TEST_EXPRESSPAY_MERCHANT) return send(200, { result: 3, "result-text": "Invalid Credentials" });
        const token = f.get("token") ?? "";
        queried.push(token);
        const o = [...orders.values()].find((x) => x.token === token);
        if (!o) return send(200, { result: 3, "result-text": "No transaction data available" });
        return send(200, answer(o));
      }
      send(404, {});
    });
  });
  return new Promise((resolve) => server.listen(TEST_PROVIDER_PORT, "127.0.0.1", () => resolve(server)));
}

/** expressPay's post-url call for a finished payment: order-id and token, unsigned. */
export async function sendNotice(reference: string, opts: { token?: string } = {}) {
  const token = opts.token ?? orders.get(reference)?.token ?? "";
  return fetch(`${TEST_WORKER_URL}/v1/camp/ep`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "order-id": reference, token }),
  });
}
