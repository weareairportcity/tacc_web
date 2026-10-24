import { expect, type Locator, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createCamp, getCamp } from "@/lib/camp/camps";
import { createRoomType } from "@/lib/camp/rooms";
import { query } from "@/lib/cf";

/**
 * Phase 2 walkthrough: register, pay a first instalment through Paystack's
 * test checkout, sign out and back in with the code. Runs against a local
 * stack only: `wrangler dev --local` (with the Paystack TEST key) and
 * `next dev` on localhost:3100 pointed at it. SW_API_SERVER_URL and
 * SW_API_ADMIN_SECRET must point this process at the same local Worker.
 */

const ORIGIN = "http://localhost:3100";
const VIEWPORT = { width: 1280, height: 800 };
const OUT_DIR = process.env.WALKTHROUGH_OUT ?? path.join(process.cwd(), "docs/camp");
const VIDEO_DIR = path.join(OUT_DIR, ".walkthrough-video");
const TOTAL = 10;
const ACTOR = "walkthrough@local";

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test.describe.configure({ timeout: 420_000 });

test("camp registration and payment walkthrough", async ({ browser }) => {
  if (!process.env.SW_API_SERVER_URL?.startsWith("http://127.0.0.1")) {
    throw new Error("Point SW_API_SERVER_URL at a local Worker; this walkthrough never runs against production.");
  }

  const campId = await createCamp(ACTOR, {
    name: "Youth Camp 2026",
    venue: "Akosombo",
    starts_on: day(60),
    ends_on: day(63),
    registration_opens_on: day(-1),
    registration_closes_on: day(30),
    payment_due_on: day(45),
    roommate_deadline_on: day(50),
    fee_bps: 195,
    status: "open",
  });
  await createRoomType(ACTOR, campId, { name: "Hostel, 4 in a room", price_pesewas: 60000, capacity: 4 });
  await createRoomType(ACTOR, campId, { name: "Hotel, 2 in a room", price_pesewas: 150000, capacity: 2 });
  const slug = (await getCamp(campId))!.slug;

  fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const context = await browser.newContext({
    baseURL: ORIGIN,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();
  // The HUD is re-added on every load, including Paystack's checkout.
  await page.addInitScript(installHud);

  // 1. Landing
  await page.goto(`/camps/${slug}`);
  await expect(page.getByRole("heading", { name: "Youth Camp 2026" })).toBeVisible();
  await title(page, "Camp registration and payment", "Phase 2 walkthrough · Paystack test mode");
  await hold(page, 3800);
  await page.evaluate(() => window.__campHud?.hideTitle());
  await say(page, 1, "The camp page an attendee opens: dates, venue, rooms and prices.");
  await highlight(page, page.getByText("Rooms and prices").locator("xpath=ancestor::section[1]"));
  await hold(page, 4200);

  // 2. Register
  await say(page, 2, "They register: name, phone, email, gender, fellowship and room type.");
  await clearHighlight(page);
  await page.getByRole("link", { name: "Register" }).click();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await typeInto(page.getByLabel("Full name"), "Ama Mensah");
  await typeInto(page.getByLabel("Phone"), "024 000 0001");
  await typeInto(page.getByLabel("Email (for your Paystack receipts)"), "ama@example.com");
  await page.getByLabel("Gender").selectOption("female");
  await hold(page, 500);
  await page.getByLabel("Fellowship").selectOption("Qadash");
  await hold(page, 500);
  const hostel = page.getByRole("radio").first();
  await hostel.check();
  await highlight(page, hostel.locator("xpath=ancestor::label[1]"));
  await hold(page, 1800);
  await clearHighlight(page);
  await page.getByRole("button", { name: "Register" }).click();

  // 3. Code
  const code = page.locator("p.font-mono");
  await expect(code).toHaveText(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  const signInCode = (await code.textContent())!.trim();
  await say(page, 3, "They get a private sign-in code, on screen and by SMS. No password to remember.");
  await highlight(page, code);
  await hold(page, 4200);
  await clearHighlight(page);
  await page.getByRole("link", { name: "Continue to payment" }).click();

  // 4. Registration
  await expect(page.getByText("Your registration")).toBeVisible();
  await say(page, 4, "Registered for GHS 600. Nothing paid yet, so the balance is the full price.");
  await highlight(page, page.locator("dl"));
  await hold(page, 4000);

  // 5. Choose an amount
  const amount = page.getByLabel(/Amount in GHS/);
  await say(page, 5, "They can pay in parts. More than the balance isn't accepted.");
  await clearHighlight(page);
  await amount.fill("");
  await typeInto(amount, "700");
  await highlight(page, page.getByText(/Enter an amount from/));
  await hold(page, 2800);
  await amount.fill("");
  await typeInto(amount, "200");
  await say(page, 5, "GHS 200 now. The Paystack fee is added on top and shown before paying.");
  await highlight(page, page.getByText("Paystack fee ="));
  await hold(page, 4200);
  await clearHighlight(page);
  await page.getByRole("button", { name: "Pay with Paystack" }).click();

  // 6. Paystack
  await page.waitForURL(/checkout\.paystack\.com/, { timeout: 30_000 });
  await expect(page.getByTestId("transaction-amount")).toBeVisible();
  await say(page, 6, "Paystack's checkout, in test mode. It charges GHS 203.98: 200 plus the fee.");
  await highlight(page, page.getByTestId("transaction-amount"));
  await hold(page, 4200);
  await say(page, 6, "Mobile money with Paystack's test number. No real money moves.");
  await highlight(page, page.getByRole("button", { name: "Confirm" }));
  await hold(page, 2200);
  await clearHighlight(page);
  await page.getByRole("button", { name: "Confirm" }).click();

  // 7. Back on our side
  await page.waitForURL(/\/paid\?/, { timeout: 90_000 });
  await say(page, 7, "Back on the camp site. It asks Paystack directly before crediting anything.");
  await expect(page.getByText("Payment received")).toBeVisible({ timeout: 60_000 });
  await highlight(page, page.getByText("Thank you. Your balance has been updated."));
  await hold(page, 3800);
  await clearHighlight(page);
  await page.getByRole("link", { name: "Back to your registration" }).click();

  // 8. Partially paid
  await expect(page.getByText("Partially paid", { exact: true })).toBeVisible();
  await say(page, 8, "Partially paid: GHS 200 in, GHS 400 to go. The payment is in their history.");
  await highlight(page, page.locator("dl"));
  await hold(page, 3200);
  await highlight(page, page.getByText("Payment history").locator("xpath=ancestor::section[1]"));
  await hold(page, 3200);
  await clearHighlight(page);

  // 9. Sign out and back in
  await say(page, 9, "Signing out, then back in on any phone with the code.");
  await page.getByRole("button", { name: /sign out/i }).click();
  const codeInput = page.getByLabel("Your sign-in code");
  await expect(codeInput).toBeVisible();
  await codeInput.scrollIntoViewIfNeeded();
  await highlight(page, codeInput);
  await typeInto(codeInput, signInCode.toLowerCase());
  await hold(page, 800);
  await clearHighlight(page);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Partially paid", { exact: true })).toBeVisible();
  await hold(page, 1600);

  // 10. The rest
  await say(page, 10, "The other GHS 400 can be paid any time before the due date, in one go or in parts.");
  await expect(amount).toHaveValue("400.00");
  await highlight(page, page.getByText("Make a payment").locator("xpath=ancestor::section[1]"));
  await hold(page, 4600);

  // What the database recorded, read straight from D1.
  const payments = await query<{ amount_pesewas: number; fee_pesewas: number; charged_pesewas: number; status: string }>(
    "app",
    `SELECT p.amount_pesewas, p.fee_pesewas, p.charged_pesewas, p.status FROM camp_payments p
     JOIN camp_registrations r ON r.id = p.registration_id WHERE r.camp_id = ? ORDER BY p.created_at`,
    [campId],
  );
  const [reg] = await query<{ paid_pesewas: number; price_pesewas: number; status: string }>(
    "app",
    "SELECT paid_pesewas, price_pesewas, status FROM camp_registrations WHERE camp_id = ?",
    [campId],
  );
  expect(payments.map((p) => [p.amount_pesewas, p.fee_pesewas, p.status])).toEqual([
    [20000, 398, "success"],
  ]);
  expect(reg).toMatchObject({ paid_pesewas: 20000, price_pesewas: 60000, status: "partially_paid" });

  const ghs = (p: number) => `GHS ${(p / 100).toFixed(2)}`;
  await clearHighlight(page);
  await page.evaluate(() => window.__campHud?.clear());
  await title(
    page,
    "What the database recorded",
    [
      ...payments.map((p, i) => `Payment ${i + 1}: ${ghs(p.amount_pesewas)} + ${ghs(p.fee_pesewas)} fee = ${ghs(p.charged_pesewas)} · ${p.status}`),
      `Registration: ${ghs(reg.paid_pesewas)} of ${ghs(reg.price_pesewas)} · ${reg.status.replace("_", " ")}`,
    ].join("\n"),
  );
  await hold(page, 6500);
  await context.close();

  const recorded = fs.readdirSync(VIDEO_DIR).find((name) => name.endsWith(".webm"));
  if (!recorded) throw new Error("Playwright did not write a video");
  const webm = path.join(OUT_DIR, "phase-2-walkthrough.webm");
  const mp4 = path.join(OUT_DIR, "phase-2-walkthrough.mp4");
  fs.renameSync(path.join(VIDEO_DIR, recorded), webm);
  fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
  try {
    execSync(`ffmpeg -y -i "${webm}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${mp4}"`, { stdio: "pipe" });
  } catch {
    // webm is enough if ffmpeg is not installed
  }
});

declare global {
  interface Window {
    __campHud?: {
      title: (heading: string, sub: string) => void;
      hideTitle: () => void;
      say: (label: string, text: string) => void;
      highlight: (box: { x: number; y: number; width: number; height: number }) => void;
      clearHighlight: () => void;
      clear: () => void;
    };
  }
}

/** Caption, spotlight and title card. Runs in the page (addInitScript), so it can't close over anything. */
function installHud() {
  const mount = () => {
    if (document.getElementById("camp-hud")) return;
    const root = document.createElement("div");
    root.id = "camp-hud";
    root.innerHTML = `
      <style>
        #camp-hud { pointer-events: none; font-family: ui-sans-serif, system-ui, sans-serif; }
        nextjs-portal, [data-next-badge-root] { display: none !important; }
        .ch-title { position: fixed; inset: 0; z-index: 2147483645; display: none; flex-direction: column;
          align-items: center; justify-content: center; background: rgba(15,23,42,.86); color: #fff;
          text-align: center; padding: 32px; transition: opacity .45s ease; }
        .ch-title h1 { margin: 0; font-size: 40px; letter-spacing: -0.03em; font-weight: 600; }
        .ch-title p { margin: 14px 0 0; font-size: 18px; line-height: 1.7; color: #cbd5e1; white-space: pre-line; }
        .ch-caption { position: fixed; left: 50%; bottom: 24px; z-index: 2147483646; transform: translateX(-50%);
          width: min(680px, calc(100vw - 48px)); display: flex; gap: 12px; align-items: flex-start;
          background: #0f172a; color: #f8fafc; border-radius: 14px; padding: 14px 16px;
          box-shadow: 0 18px 40px rgba(15,23,42,.3); opacity: 0; transition: opacity .25s ease; }
        .ch-caption.on { opacity: 1; }
        .ch-caption.top { top: 24px; bottom: auto; }
        .ch-step { flex: none; min-width: 44px; height: 24px; border-radius: 999px; background: #10b981;
          color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
        .ch-text { font-size: 16px; line-height: 1.45; font-weight: 500; }
        .ch-spot { position: fixed; z-index: 2147483640; border-radius: 12px; display: none;
          box-shadow: 0 0 0 9999px rgba(15,23,42,.38); outline: 3px solid #10b981;
          transition: left .2s ease, top .2s ease, width .2s ease, height .2s ease; }
      </style>
      <div class="ch-spot"></div>
      <div class="ch-caption"><span class="ch-step"></span><span class="ch-text"></span></div>
      <div class="ch-title"><h1></h1><p></p></div>`;
    document.documentElement.appendChild(root);
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    const caption = $(".ch-caption");
    const spot = $(".ch-spot");
    const titleEl = $(".ch-title");
    // Keep the caption off whatever is highlighted.
    const place = (box: { y: number; height: number } | null) =>
      caption.classList.toggle("top", !!box && box.y + box.height > window.innerHeight - 140);
    window.__campHud = {
      title(heading, sub) {
        $(".ch-title h1").textContent = heading;
        $(".ch-title p").textContent = sub;
        titleEl.style.display = "flex";
        titleEl.style.opacity = "1";
      },
      hideTitle() {
        titleEl.style.opacity = "0";
        setTimeout(() => (titleEl.style.display = "none"), 450);
      },
      say(label, text) {
        $(".ch-step").textContent = label;
        $(".ch-text").textContent = text;
        caption.classList.add("on");
      },
      highlight(box) {
        const pad = 8;
        Object.assign(spot.style, {
          display: "block",
          left: `${box.x - pad}px`,
          top: `${box.y - pad}px`,
          width: `${box.width + pad * 2}px`,
          height: `${box.height + pad * 2}px`,
        });
        place(box);
      },
      clearHighlight() {
        spot.style.display = "none";
        place(null);
      },
      clear() {
        spot.style.display = "none";
        caption.classList.remove("on");
        titleEl.style.display = "none";
      },
    };
  };
  if (document.documentElement) mount();
  document.addEventListener("DOMContentLoaded", mount);
}

// The last caption is carried across page loads so it doesn't blink out.
let lastCaption: [string, string] | null = null;

async function ensureHud(page: Page) {
  await page.waitForFunction(() => Boolean(window.__campHud));
  if (lastCaption) await page.evaluate(([label, text]) => window.__campHud?.say(label, text), lastCaption);
}

async function title(page: Page, heading: string, sub: string) {
  await ensureHud(page);
  await page.evaluate(([h, s]) => window.__campHud?.title(h, s), [heading, sub]);
}

async function say(page: Page, step: number, text: string) {
  lastCaption = [`${step}/${TOTAL}`, text];
  await ensureHud(page);
}

async function highlight(page: Page, locator: Locator) {
  await ensureHud(page);
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = await locator.boundingBox();
  if (box) await page.evaluate((b) => window.__campHud?.highlight(b), box);
}

async function clearHighlight(page: Page) {
  await ensureHud(page);
  await page.evaluate(() => window.__campHud?.clearHighlight());
}

async function typeInto(locator: Locator, value: string, delay = 70) {
  await locator.click();
  await locator.pressSequentially(value, { delay });
}

async function hold(page: Page, ms: number) {
  await page.waitForTimeout(ms);
  if (lastCaption) await ensureHud(page);
}
