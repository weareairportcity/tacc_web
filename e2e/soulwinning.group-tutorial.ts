import { expect, type Locator, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ORIGIN = "http://127.0.0.1:3000";
const OUT_DIR = path.join(process.cwd(), "docs/soulwinning");
const TOTAL = 8;

test.describe.configure({ timeout: 240_000 });

test("group tutorial video", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "no-preference",
    geolocation: { latitude: 5.6037, longitude: -0.187 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 390, height: 844 },
    },
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    const hide = () => {
      const portal = document.querySelector("nextjs-portal");
      if (portal instanceof HTMLElement) portal.style.display = "none";
    };
    new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true });
  });

  await page.goto("/1909/shots/entry");
  await page.addStyleTag({
    content: "nextjs-portal,[data-next-badge-root]{display:none!important}",
  });
  await expect(page.getByRole("button", { name: "Start new" })).toBeVisible();
  await installHud(page);

  await title(page, "How to log a group", "1909 · members · one class, one save");
  await hold(page, 4200);
  await page.evaluate(() => window.__swTutorial?.hideTitle());
  await hold(page, 800);

  await say(page, 1, "Start as you always do. This is still you, a member.");
  await highlight(page, page.getByRole("button", { name: "Start new" }), { circle: true });
  await hold(page, 2200);
  await page.getByRole("button", { name: "Start new" }).click();
  await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();

  await typeInto(page, page.getByRole("textbox", { name: "Name" }), "Ama Boateng");
  await page.getByLabel("Fellowship").selectOption("Qadash");
  await typeInto(page, page.getByRole("textbox", { name: "Number" }), "0244123456");
  await page.getByRole("button", { name: "Start logging" }).click();

  await expect(page.getByRole("heading", { name: "Turn on location" })).toBeVisible();
  await say(page, 2, "Location still pins the class to the map.");
  await highlight(page, page.getByRole("button", { name: "Enable location" }), { circle: true });
  await hold(page, 2400);
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await page.getByRole("button", { name: "Enable location" }).click();
  await expect(page.getByRole("button", { name: "A group" })).toBeVisible();
  await hold(page, 700);

  await say(page, 3, "Won a whole class or crowd? Switch to A group.");
  await highlight(page, page.getByRole("button", { name: "A group" }), { circle: true });
  await hold(page, 2800);
  await page.getByRole("button", { name: "A group" }).click();
  await expect(page.getByPlaceholder("Group name")).toBeVisible();
  await hold(page, 600);

  await say(page, 4, "Name the group, then one contact for follow-up.");
  await highlight(page, page.getByPlaceholder("Group name"), { circle: true });
  await hold(page, 1800);
  await typeInto(page, page.getByPlaceholder("Group name"), "Tema SHS class");
  await hold(page, 500);
  await highlight(page, page.getByPlaceholder("Contact (phone)"), { circle: true });
  await hold(page, 1400);
  await typeInto(page, page.getByPlaceholder("Contact (phone)"), "0244001122");
  await hold(page, 800);

  await say(page, 5, "Souls won is what the hall counts. Then how many tongues, how many church.");
  const soulsWon = page.getByLabel("Souls won");
  await soulsWon.scrollIntoViewIfNeeded();
  await highlight(page, soulsWon, { circle: true });
  await hold(page, 2000);
  await soulsWon.fill("12");
  await hold(page, 700);
  const tongues = page.getByLabel("Spoke in tongues");
  await highlight(page, tongues, { circle: true });
  await hold(page, 1400);
  await tongues.fill("8");
  await hold(page, 500);
  const church = page.getByLabel("Coming to church");
  await highlight(page, church, { circle: true });
  await hold(page, 1400);
  await church.fill("10");
  await hold(page, 900);

  const save = page.getByRole("button", { name: "Save 12 souls" });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeEnabled({ timeout: 12_000 });
  await say(page, 6, "Save once. Twelve souls move the hall.");
  await highlight(page, save, { circle: true });
  await hold(page, 2800);
  await save.click();
  await expect(page.getByRole("heading", { name: "Successful" })).toBeVisible();
  await expect(page.getByText("12 souls have been added.")).toBeVisible();
  await page.evaluate(() => window.__swTutorial?.clearHighlight());
  await hold(page, 2000);

  await say(page, 7, "My souls keeps the class as one group, not twelve names.");
  await highlight(page, page.getByRole("button", { name: /My souls/ }), { circle: true });
  await hold(page, 2400);
  await page.getByRole("button", { name: /My souls/ }).click();
  await expect(page.getByText("Tema SHS class")).toBeVisible();
  await expect(page.getByText("12 souls")).toBeVisible();
  await highlight(page, page.getByText("Tema SHS class").first(), { circle: true });
  await hold(page, 3600);

  await page.evaluate(() => window.__swTutorial?.clearHighlight());
  await say(page, 8, "Wrong count? Delete the group from here.");
  await highlight(page, page.getByRole("button", { name: "Delete" }).first(), { circle: true });
  await hold(page, 2800);
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText("Remove all 12 souls in this group?")).toBeVisible();
  await highlight(page, page.getByText("Remove all 12 souls in this group?"), { circle: true });
  await hold(page, 3200);

  await page.evaluate(() => window.__swTutorial?.clear());
  await hold(page, 900);
  await context.close();

  const recorded = fs
    .readdirSync(OUT_DIR)
    .filter((name) => name.endsWith(".webm"))
    .map((name) => ({ name, t: fs.statSync(path.join(OUT_DIR, name)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];

  if (!recorded) throw new Error("Playwright did not write a video");

  const webm = path.join(OUT_DIR, "group-tutorial.webm");
  const mp4 = path.join(OUT_DIR, "group-tutorial.mp4");
  fs.renameSync(path.join(OUT_DIR, recorded.name), webm);

  try {
    execSync(
      `ffmpeg -y -i "${webm}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${mp4}"`,
      { stdio: "pipe" }
    );
  } catch {
    // webm is enough if ffmpeg is not installed
  }
});

declare global {
  interface Window {
    __swTutorial?: {
      hideTitle: () => void;
      say: (step: number, total: number, text: string) => void;
      highlight: (box: { x: number; y: number; width: number; height: number }, circle: boolean) => void;
      clearHighlight: () => void;
      clear: () => void;
    };
  }
}

async function installHud(page: Page) {
  await page.evaluate(() => {
    document.getElementById("sw-tutorial")?.remove();

    const root = document.createElement("div");
    root.id = "sw-tutorial";
    root.innerHTML = `
      <style>
        #sw-tutorial { pointer-events: none; }
        nextjs-portal, [data-next-badge-root] { display: none !important; }
        #sw-tutorial * { box-sizing: border-box; }
        .sw-t-title {
          position: fixed; inset: 0; z-index: 2147483645;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          background: rgba(12,10,9,.78);
          color: white; text-align: center; padding: 32px;
          font-family: ui-sans-serif, system-ui, sans-serif;
          transition: opacity .45s ease;
        }
        .sw-t-title h1 { margin: 0; font-size: 34px; letter-spacing: -0.04em; font-weight: 560; }
        .sw-t-title p { margin: 10px 0 0; font-size: 15px; color: #c1e1f7; }
        .sw-t-caption {
          position: fixed; left: 14px; right: 14px; top: auto; bottom: 16px; z-index: 2147483646;
          display: flex; gap: 10px; align-items: flex-start;
          background: #0c0a09; color: #fafaf9; border-radius: 16px;
          padding: 12px 14px; box-shadow: 0 18px 40px rgba(12,10,9,.28);
          font-family: ui-sans-serif, system-ui, sans-serif;
          opacity: 0;
          transition: opacity .25s ease, top .2s ease;
        }
        .sw-t-caption.on { opacity: 1; }
        .sw-t-step {
          flex: none; min-width: 36px; height: 22px; border-radius: 999px;
          background: #3ba6f1; color: white; font-size: 11px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
        }
        .sw-t-text { font-size: 14px; line-height: 1.35; font-weight: 500; }
        .sw-t-spot {
          position: fixed; z-index: 2147483640; border-radius: 18px;
          box-shadow: 0 0 0 9999px rgba(12,10,9,.46);
          outline: 2px solid #3ba6f1;
          transition: left .28s ease, top .28s ease, width .28s ease, height .28s ease;
          display: none;
        }
        .sw-t-ring {
          position: fixed; z-index: 2147483642; pointer-events: none;
          border: 3px solid #3ba6f1; border-radius: 999px;
          box-shadow: 0 0 0 6px rgba(59,166,241,.22);
          animation: sw-t-pulse 1.8s ease-out infinite;
          display: none;
        }
        @keyframes sw-t-pulse {
          0% { transform: scale(.92); opacity: 1; }
          70% { transform: scale(1.12); opacity: .35; }
          100% { transform: scale(1.2); opacity: 0; }
        }
      </style>
      <div class="sw-t-spot"></div>
      <div class="sw-t-ring"></div>
      <div class="sw-t-caption"><span class="sw-t-step"></span><span class="sw-t-text"></span></div>
      <div class="sw-t-title">
        <h1>How to log a group</h1>
        <p>1909 · members · one class, one save</p>
      </div>
    `;
    document.documentElement.appendChild(root);

    const caption = root.querySelector(".sw-t-caption") as HTMLElement;
    const stepEl = root.querySelector(".sw-t-step") as HTMLElement;
    const textEl = root.querySelector(".sw-t-text") as HTMLElement;
    const titleEl = root.querySelector(".sw-t-title") as HTMLElement;
    const spot = root.querySelector(".sw-t-spot") as HTMLElement;
    const ring = root.querySelector(".sw-t-ring") as HTMLElement;
    let lastAvoid: { x: number; y: number; width: number; height: number } | null = null;

    const hits = (
      x: number,
      y: number,
      w: number,
      h: number,
      b: { x: number; y: number; width: number; height: number } | null
    ) => {
      if (!b) return false;
      return !(x + w < b.x || x > b.x + b.width || y + h < b.y || y > b.y + b.height);
    };

    const placeCaption = (avoid: { x: number; y: number; width: number; height: number } | null) => {
      const width = window.innerWidth - 28;
      const height = Math.max(caption.offsetHeight || 52, 52);
      const x = 14;
      const pad = 14;
      const topY = pad;
      const bottomY = window.innerHeight - height - pad;
      const zone = avoid
        ? { x: avoid.x - 16, y: avoid.y - 16, width: avoid.width + 32, height: avoid.height + 32 }
        : null;
      const current = Number.parseFloat(caption.style.top || String(bottomY));
      let y = Math.abs(current - bottomY) <= Math.abs(current - topY) ? bottomY : topY;
      if (zone && zone.height > window.innerHeight * 0.45) {
        y = bottomY;
      } else if (hits(x, y, width, height, zone)) {
        const other = y === bottomY ? topY : bottomY;
        if (!hits(x, other, width, height, zone)) y = other;
        else {
          const spaceTop = zone ? zone.y : window.innerHeight;
          const spaceBottom = zone ? window.innerHeight - (zone.y + zone.height) : 0;
          y = spaceBottom >= spaceTop ? bottomY : topY;
        }
      }
      caption.style.left = "14px";
      caption.style.right = "14px";
      caption.style.top = `${y}px`;
      caption.style.bottom = "auto";
    };

    window.__swTutorial = {
      hideTitle() {
        titleEl.style.opacity = "0";
        setTimeout(() => {
          titleEl.style.display = "none";
        }, 450);
      },
      say(step, total, text) {
        stepEl.textContent = `${step}/${total}`;
        textEl.textContent = text;
        caption.classList.add("on");
        requestAnimationFrame(() => placeCaption(lastAvoid));
      },
      highlight(box, circle) {
        const pad = 8;
        lastAvoid = box;
        spot.style.display = "block";
        spot.style.left = `${box.x - pad}px`;
        spot.style.top = `${box.y - pad}px`;
        spot.style.width = `${box.width + pad * 2}px`;
        spot.style.height = `${box.height + pad * 2}px`;
        if (circle && Math.max(box.width, box.height) < 220) {
          const size = Math.max(box.width, box.height) + 28;
          ring.style.display = "block";
          ring.style.width = `${size}px`;
          ring.style.height = `${size}px`;
          ring.style.left = `${box.x + box.width / 2 - size / 2}px`;
          ring.style.top = `${box.y + box.height / 2 - size / 2}px`;
        } else {
          ring.style.display = "none";
        }
        placeCaption(box);
      },
      clearHighlight() {
        lastAvoid = null;
        spot.style.display = "none";
        ring.style.display = "none";
        placeCaption(null);
      },
      clear() {
        lastAvoid = null;
        caption.classList.remove("on");
        spot.style.display = "none";
        ring.style.display = "none";
        titleEl.style.display = "none";
      },
    };
  });
}

async function title(page: Page, heading: string, sub: string) {
  await page.evaluate(
    ({ heading, sub }) => {
      const h = document.querySelector("#sw-tutorial .sw-t-title h1");
      const p = document.querySelector("#sw-tutorial .sw-t-title p");
      if (h) h.textContent = heading;
      if (p) p.textContent = sub;
    },
    { heading, sub }
  );
}

async function say(page: Page, step: number, text: string) {
  await page.evaluate(
    ({ step, total, text }) => window.__swTutorial?.say(step, total, text),
    { step, total: TOTAL, text }
  );
}

async function highlight(page: Page, locator: Locator, opts?: { circle?: boolean }) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) return;
  await page.evaluate(
    ({ box, circle }) => window.__swTutorial?.highlight(box, circle),
    { box, circle: opts?.circle ?? true }
  );
}

async function typeInto(page: Page, locator: Locator, value: string, delay = 95) {
  await locator.click();
  await locator.fill("");
  await locator.pressSequentially(value, { delay });
}

async function hold(page: Page, ms: number) {
  await page.waitForTimeout(ms);
}
