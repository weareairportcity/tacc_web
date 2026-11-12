import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { post, query } from "@/lib/cf";
import { checkPayment, startPayment, startPaymentFor } from "@/lib/camp/payments";
import { notifyPrefs, savePushSub } from "@/lib/camp/push";
import { getReceipt, listReceipts, parseReceiptFilters, receiptsCsv } from "@/lib/camp/receipts";
import { askForRefund } from "@/lib/camp/requests";
import { getRegistration } from "@/lib/camp/registrations";
import { TEST_PROVIDER_PORT, TEST_TELEGRAM_LINK_CODE, TEST_TELEGRAM_SECRET, TEST_WORKER_URL } from "../setup/constants";
import { gonePushIds, pushes, smsSent, succeed, telegramCalls } from "../setup/expresspay";
import { ACTOR, registered } from "./helpers";

// Notifications end to end: the Worker sends to a fake Telegram and a fake
// push service on the same local server, and the tests read what arrived.

// Imported by payments.db.test.ts, whose fake server (one per process, one port) these use too.
beforeAll(async () => {
  await query("app", "INSERT INTO camp_staff (email, role) VALUES (?, 'coordinator') ON CONFLICT DO NOTHING", [ACTOR]);
});
afterAll(async () => {
  await query("app", "DELETE FROM camp_telegram_chats", []);
  await query("app", "DELETE FROM camp_push_subs", []);
});

const CALLBACK = "http://localhost:3000/camps/test/paid";
const subtle = webcrypto.subtle;
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");

/** A browser's side of a push subscription: we keep the private key so we can read what arrives. */
async function phone(id: string) {
  const keys = (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pub = new Uint8Array(await subtle.exportKey("raw", keys.publicKey));
  const auth = webcrypto.getRandomValues(new Uint8Array(16));
  return {
    keys,
    pub,
    auth,
    json: { endpoint: `http://127.0.0.1:${TEST_PROVIDER_PORT}/push/${id}`, keys: { p256dh: b64(pub), auth: b64(auth) } },
  };
}

/** RFC 8291 decryption, as a phone does it. */
async function read(p: Awaited<ReturnType<typeof phone>>, body: Buffer) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const asKey = await subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: asKey }, p.keys.privateKey, 256));
  const hkdf = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) =>
    new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s, info }, await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), n * 8));
  const te = new TextEncoder();
  const ikm = await hkdf(p.auth, shared, Buffer.concat([te.encode("WebPush: info\0"), p.pub, asPublic]), 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const plain = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), cipher));
  expect(plain[plain.length - 1]).toBe(2);
  return JSON.parse(new TextDecoder().decode(plain.subarray(0, -1))) as { title: string; body: string; url: string };
}

const hook = (body: unknown, secret = TEST_TELEGRAM_SECRET) =>
  fetch(`${TEST_WORKER_URL}/v1/tg/hook`, { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret }, body: JSON.stringify(body) });
const GROUP = -1001;
const OWNER = 501;
const command = (text: string, from = OWNER) => hook({ message: { message_id: 9, chat: { id: GROUP, title: "Coordinators", type: "group" }, from: { id: from, first_name: "Kwame" }, text } });
const about = (name: string) => sentToGroup().filter((t) => t.includes(name));
const sentToGroup = () => telegramCalls.filter((c) => c.method === "sendMessage" && c.body.chat_id === String(GROUP)).map((c) => String(c.body.text));

async function payInFull(id: string, amount: number) {
  const checkout = await startPayment(id, amount, CALLBACK, "momo");
  succeed(checkout.reference);
  await checkPayment(id, checkout.reference);
  return checkout;
}

describe("the coordinators' Telegram group", () => {
  beforeEach(() => {
    telegramCalls.length = 0;
  });

  it("refuses calls without Telegram's secret, and a wrong link code", async () => {
    expect((await hook({ message: { chat: { id: GROUP }, text: "/link x" } }, "wrong")).status).toBe(401);
    await command("/link not-the-code");
    expect(sentToGroup()[0]).toContain("isn't right");
    expect(await query("app", "SELECT * FROM camp_telegram_chats", [])).toEqual([]);
  });

  it("links with the code, deletes the code from the chat, and posts registrations and payments", async () => {
    await command(`/link ${TEST_TELEGRAM_LINK_CODE}`);
    expect(telegramCalls.some((c) => c.method === "deleteMessage")).toBe(true);
    expect(sentToGroup().some((t) => t.includes("Linked!"))).toBe(true);

    // Other test files register people at the same time, so only this test's people are looked at.
    const { id } = await registered({ full_name: "Abena Owusu" });
    // Laid out one fact per line, not one long sentence.
    const reg = about("Abena Owusu");
    expect(reg).toHaveLength(1);
    expect(reg[0].split("\n").slice(0, 4)).toEqual(["🙋 <b>New registration</b>", "", "Name: <b>Abena Owusu</b>", "Gender: <b>Female</b>"]);
    expect(reg[0]).toContain("Room type: <b>Hostel (GHS 600.00)</b>");
    expect(telegramCalls.find((c) => String(c.body.text).includes("Abena Owusu"))?.body.parse_mode).toBe("HTML");

    await payInFull(id, 20000);
    const paid = about("Abena Owusu").at(-1)!;
    expect(paid).toMatch(/^💰 <b>Payment received<\/b>\n/);
    expect(paid).toContain("Paid by: <b>Abena Owusu (themselves)</b>");
    expect(paid).toContain("Amount: <b>GHS 200 + GHS 3.98 fee</b>");
    expect(paid).toContain("Paid with: <b>Mobile money</b>");
    expect(paid).toContain("Balance: <b>GHS 400 left of GHS 600</b>");
  });

  it("lets only the person who linked it turn kinds off, and then stops sending them", async () => {
    await command("/settings", 999);
    expect(sentToGroup().some((t) => t.includes("Only Kwame can change these"))).toBe(true);

    await command("/settings");
    const keyboard = telegramCalls.findLast((c) => c.body.reply_markup)!.body.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    expect(keyboard.inline_keyboard.map((row) => row[0].text)).toContain("🔔 On · New registrations");

    await hook({ callback_query: { id: "q1", from: { id: 999 }, data: "t:registration", message: { chat: { id: GROUP }, message_id: 5 } } });
    expect(telegramCalls.find((c) => c.method === "answerCallbackQuery" && c.body.callback_query_id === "q1")).toMatchObject({ body: { show_alert: true } });
    await hook({ callback_query: { id: "q2", from: { id: OWNER }, data: "t:registration", message: { chat: { id: GROUP }, message_id: 5 } } });
    expect(telegramCalls.some((c) => c.method === "editMessageReplyMarkup")).toBe(true);

    const { id } = await registered({ full_name: "Kofi Quiet" });
    expect(about("Kofi Quiet")).toEqual([]);
    // Other kinds still come.
    await payInFull(id, 10000);
    expect(about("Kofi Quiet")).toEqual([expect.stringMatching(/^💰 <b>Payment received/)]);
    const paid = (await getRegistration(id))!;
    await askForRefund(paid, 5000, "Paid by mistake");
    expect(about("Kofi Quiet").at(-1)).toMatch(/^📨 <b>New refund request<\/b>\n\nAttendee: <b>Kofi Quiet<\/b>\nAsking for: <b>GHS 50\.00 back<\/b>/);
    expect(about("Kofi Quiet").at(-1)).toContain("Reason: <b>Paid by mistake</b>");
    await hook({ callback_query: { id: "q3", from: { id: OWNER }, data: "t:registration", message: { chat: { id: GROUP }, message_id: 5 } } });
  });
});

describe("who paid", () => {
  beforeEach(() => {
    telegramCalls.length = 0;
  });

  it("is named in the receipt text and the Telegram update when someone else pays through the pay link", async () => {
    const { id } = await registered({ full_name: "Efua Paidfor" });
    const checkout = await startPaymentFor(id, 20000, CALLBACK, "Kwesi Mensah", "card");
    succeed(checkout.reference);
    await checkPayment(id, checkout.reference);
    expect(smsSent.find((s) => s.message.includes(checkout.reference))?.message).toMatch(
      /^Hi Efua, Kwesi Mensah has paid GHS 200 towards your place at .+\. You have GHS 400 left to pay\. Receipt: /,
    );
    expect(about("Efua Paidfor").at(-1)).toContain("Paid by: <b>Kwesi Mensah (pay link)</b>");
  });
});

describe("/test in Telegram", () => {
  it("shows one example of each kind of update", async () => {
    telegramCalls.length = 0;
    await command("/test");
    const sent = sentToGroup();
    // Other test files register people meanwhile, so their messages can arrive in between.
    expect(sent.some((t) => t.includes("Examples"))).toBe(true);
    for (const title of ["New registration", "Payment received", "A payment needs a look", "New refund request", "New room change request", "Registration cancelled"]) {
      expect(sent.some((t) => t.includes(`<b>${title}</b>`))).toBe(true);
    }
  });
});

describe("/summary in Telegram", () => {
  it("lays out each open camp in sections, at any time", async () => {
    const { camp } = await registered();
    telegramCalls.length = 0;
    await command("/summary");
    const mine = sentToGroup().find((t) => t.includes(camp.name))!;
    expect(mine).toMatch(/^📊 <b>/);
    for (const part of ["<b>PEOPLE</b>", "Registered: <b>", "<b>MONEY</b>", "Still owed: <b>", "<b>ROOMS</b>", "<b>NEEDS YOU</b>", "Requests waiting: <b>", "<i>As of "]) {
      expect(mine).toContain(part);
    }
  });
});

describe("app notifications", () => {
  beforeEach(() => {
    pushes.length = 0;
  });

  it("tell the attendee their payment arrived, with a receipt, in plain words", async () => {
    const { id } = await registered({ full_name: "Yaw Boateng" });
    const p = await phone(`attendee-${id}`);
    await savePushSub(`attendee:${id}`, p.json);

    const checkout = await payInFull(id, 20000);
    const mine = pushes.filter((x) => x.id === `attendee-${id}`);
    expect(mine).toHaveLength(1);
    expect(mine[0].encoding).toBe("aes128gcm");
    expect(mine[0].authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(await read(p, mine[0].body)).toEqual({
      title: "Payment received",
      body: expect.stringMatching(/^We received GHS 200\. You have GHS 400 left to pay by .+\. Tap to see your receipt\.$/),
      url: `/camps/r/${checkout.reference}`,
      tag: `payment_received:${id}`,
    });
    // Encrypted for this phone only.
    await expect(read(await phone("someone-else"), mine[0].body)).rejects.toThrow();

    // The receipt text has the same link, and the receipt page has the payment.
    const text = smsSent.find((s) => s.message.includes(checkout.reference));
    expect(text?.message).toMatch(
      /^Hi Yaw, we've received your payment of GHS 200 for .+\. You have GHS 400 left to pay\. Receipt: https:\/\/commune\.theairportcitychurch\.com\/camps\/r\/CAMP-[0-9A-F]{16} - The Airport City Church$/,
    );
    expect(await getReceipt(checkout.reference)).toMatchObject({ full_name: "Yaw Boateng", amount_pesewas: 20000, paid_pesewas: 20000 });
    expect(await getReceipt("CAMP-0000000000000000")).toBeNull();
  });

  it("tell coordinators about registrations, and respect what each person turned off", async () => {
    const p = await phone("coordinator");
    await savePushSub(`staff:${ACTOR}`, p.json);
    const seen = async () => Promise.all(pushes.filter((x) => x.id === "coordinator").map((x) => read(p, x.body)));
    await registered({ full_name: "Esi Mensah" });
    expect((await seen()).filter((m) => m.body.includes("Esi Mensah"))).toEqual([
      expect.objectContaining({ title: "New registration", body: expect.stringContaining("Esi Mensah registered for") }),
    ]);

    expect((await notifyPrefs(`staff:${ACTOR}`, ["registration"])).off).toEqual(["registration"]);
    await registered({ full_name: "Kojo Muted" });
    expect((await seen()).filter((m) => m.body.includes("Kojo Muted"))).toEqual([]);
    await notifyPrefs(`staff:${ACTOR}`, []);
  });

  it("forget a phone that the push service says is gone", async () => {
    const { id } = await registered();
    const p = await phone(`gone-${id}`);
    await savePushSub(`attendee:${id}`, p.json);
    gonePushIds.add(`gone-${id}`);
    await payInFull(id, 10000);
    expect(await query("app", "SELECT endpoint FROM camp_push_subs WHERE owner = ?", [`attendee:${id}`])).toEqual([]);
  });

  it("remind people 3 days before payment is due, once", async () => {
    const { camp, id } = await registered();
    const p = await phone(`due-${id}`);
    await savePushSub(`attendee:${id}`, p.json);
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await query("app", "UPDATE camps SET payment_due_on = ? WHERE id = ?", [inThreeDays, camp.id]);
    await post("/v1/admin/camp/reminders", {});
    await post("/v1/admin/camp/reminders", {});
    const got = pushes.filter((x) => x.id === `due-${id}`);
    expect(got).toHaveLength(1);
    expect(await read(p, got[0].body)).toMatchObject({ title: "Payment due in 3 days", body: expect.stringContaining("GHS 600 left to pay") });
  });
});

describe("Receipts for coordinators", () => {
  it("lists each payment once, says who paid, filters, and exports the same rows", async () => {
    const { camp, id } = await registered({ full_name: "Abla Receipts" });
    const own = await startPayment(id, 10000, CALLBACK, "momo");
    succeed(own.reference);
    await checkPayment(id, own.reference);
    const sponsored = await startPaymentFor(id, 20000, CALLBACK, "Uncle Kofi", "card");
    succeed(sponsored.reference);
    await checkPayment(id, sponsored.reference);
    // Unfinished checkouts aren't receipts.
    await startPayment(id, 5000, CALLBACK, "momo");

    const all = await listReceipts(camp.id, parseReceiptFilters({}));
    expect(all.map((r) => [r.reference, r.payer, r.who, r.method, r.amount_pesewas])).toEqual([
      [sponsored.reference, "Uncle Kofi", "link", "card", 20000],
      [own.reference, "Abla Receipts", "self", "momo", 10000],
    ]);
    expect((await listReceipts(camp.id, parseReceiptFilters({ who: "link" }))).map((r) => r.reference)).toEqual([sponsored.reference]);
    expect((await listReceipts(camp.id, parseReceiptFilters({ method: "momo" }))).map((r) => r.reference)).toEqual([own.reference]);
    expect((await listReceipts(camp.id, parseReceiptFilters({ q: "uncle" }))).map((r) => r.reference)).toEqual([sponsored.reference]);
    expect((await listReceipts(camp.id, parseReceiptFilters({ q: own.reference.slice(5, 12).toLowerCase() }))).map((r) => r.reference)).toEqual([own.reference]);
    expect(await listReceipts(camp.id, parseReceiptFilters({ from: "2099-01-01" }))).toEqual([]);

    const csv = receiptsCsv(all, "https://commune.test");
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"Receipt no."');
    expect(lines[1]).toContain(`"https://commune.test/camps/r/${sponsored.reference}"`);
    expect(lines[1]).toContain('"Uncle Kofi","Pay link","Card","200.00"');
  });
});
