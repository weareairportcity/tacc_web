import { expect, type Locator, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ORIGIN = "http://127.0.0.1:3000";
const VIEWPORT = { width: 2056, height: 1329 };
const OUT_DIR = path.join(process.cwd(), "docs/soulwinning");
const VIDEO_DIR = path.join(OUT_DIR, ".admin-tutorial-video");
const TOTAL = 10;
const SAMPLE_PHOTO = "/1909/shots/sample-soul.jpg";

test.describe.configure({ timeout: 420_000 });

test("admin and screen tutorial video", async ({ browser }) => {
  fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  const context = await browser.newContext({
    baseURL: ORIGIN,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    recordVideo: {
      dir: VIDEO_DIR,
      size: VIEWPORT,
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

  await page.goto("/1909/shots/screen");
  await page.addStyleTag({
    content: "nextjs-portal,[data-next-badge-root]{display:none!important}",
  });
  await expect(page.getByText("souls won for Christ")).toBeVisible();
  await page.waitForFunction(() => typeof window.__swEnqueueSoul === "function");
  await installHud(page);

  await title(page, "The screen and admin", "1909 · entries · wall · map");
  await hold(page, 4200);
  await page.evaluate(() => window.__swTutorial?.hideTitle());
  await hold(page, 900);

  await say(page, 1, "The hall screen. Photos of souls drift behind the count — always moving.");
  await page.locator("[data-photo-marquee] img").first().waitFor({ state: "visible" });
  await hold(page, 4200);
  await highlight(page, page.getByText("Spoke in tongues").locator(".."), { circle: false });
  await hold(page, 1400);
  await highlight(page, page.getByText("Coming to church").locator(".."), { circle: false });
  await hold(page, 1800);
  await page.evaluate(() => window.__swTutorial?.clearHighlight());
  await hold(page, 600);

  await enqueue(page, {
    name: "Ama Serwaa",
    photoPath: null,
    delay: 0,
    duration: 22,
    lane: 16,
    scale: 1.18,
    inFront: true,
    spokeInTongues: true,
    comingToChurch: true,
  });
  await waitForCard(page, "Ama Serwaa", false);
  await say(page, 2, "Ama Serwaa — just a name. Photos are optional.");
  await follow(page, '[data-soul-name="Ama Serwaa"]', true);
  await hold(page, 5200);

  await enqueue(page, {
    name: "Kwame Mensah",
    photoPath: SAMPLE_PHOTO,
    delay: 0,
    duration: 22,
    lane: 40,
    scale: 1.02,
    inFront: true,
    spokeInTongues: true,
    comingToChurch: true,
  });
  await waitForCard(page, "Kwame Mensah", true);
  await say(page, 3, "Kwame Mensah — same card, with the photo attached in the field.");
  await follow(page, '[data-soul-name="Kwame Mensah"]', true);
  await hold(page, 5600);

  await page.evaluate(() => window.__swTutorial?.clearHighlight());
  await hold(page, 800);

  await page.goto("/1909/shots/admin?view=entries");
  await page.addStyleTag({
    content: "nextjs-portal,[data-next-badge-root]{display:none!important}",
  });
  await expect(page.getByRole("heading", { name: "Soul Winning admin" })).toBeVisible();
  await expect(page.getByText("Kwame Mensah")).toBeVisible();
  await expect(page.getByPlaceholder("Search name, phone, member, fellowship or PFCC")).toBeVisible();
  await installHud(page);

  await say(page, 4, "Entries — every soul, with name, phone and who won them.");
  await highlight(page, page.getByRole("button", { name: "Entries" }), { circle: true });
  await hold(page, 2200);
  await page.evaluate(() => window.__swTutorial?.clearHighlight());
  await hold(page, 2800);

  const kwame = page.getByRole("row").filter({ hasText: "Kwame Mensah" });
  await highlight(page, kwame, { circle: false });
  await say(page, 5, "Kwame has a photo badge. Same person who just crossed the screen.");
  await hold(page, 4200);

  const ama = page.getByRole("row").filter({ hasText: "Ama Serwaa" });
  await ama.scrollIntoViewIfNeeded();
  await highlight(page, ama, { circle: false });
  await say(page, 5, "Ama has no photo — still counted, still in the list.");
  await hold(page, 4200);

  await page.evaluate(() => window.__swTutorial?.clear());
  await hold(page, 600);

  await page.goto("/1909/shots/admin?view=wall");
  await page.addStyleTag({
    content: "nextjs-portal,[data-next-badge-root]{display:none!important}",
  });
  await expect(page.getByRole("heading", { name: "Soul Winning admin" })).toBeVisible();
  await expect(page.locator("[data-wall-tile]").first()).toBeVisible();
  await page.locator("[data-wall-tile] img").first().waitFor({ state: "visible" });
  await installHud(page);

  await say(page, 6, "The wall — every photo, packed like a studio board.");
  await highlight(page, page.getByRole("button", { name: "Wall" }), { circle: true });
  await hold(page, 2200);
  await page.evaluate(() => window.__swTutorial?.clearHighlight());
  await hold(page, 2800);

  await say(page, 7, "Filter by PFCC, fellowship, or the member who logged them.");
  await highlight(page, page.locator("[data-wall-filters]"), { circle: false });
  await hold(page, 2200);
  await page.locator('[data-wall-filter-pfcc="PFCC 2"]').click();
  await highlight(page, page.locator('[data-wall-filter-pfcc="PFCC 2"]'), { circle: true });
  await hold(page, 2400);
  await page.locator("[data-wall-fellowship]").selectOption("Qadash");
  await highlight(page, page.locator("[data-wall-fellowship]"), { circle: true });
  await hold(page, 2800);

  await page.evaluate(() => window.__swTutorial?.clearHighlight());
  const kwameTile = page.locator('[data-wall-tile="Kwame Mensah"]');
  await kwameTile.scrollIntoViewIfNeeded();
  await highlight(page, kwameTile, { circle: true });
  await say(page, 8, "Tap a print — name, who won them, fellowship, phone.");
  await hold(page, 2200);
  await kwameTile.click();
  const detail = page.locator("[data-wall-detail]");
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Kwame Mensah" })).toBeVisible();
  await expect(detail.getByText("Won by Kofi Mensah")).toBeVisible();
  await highlight(page, detail.locator("article"), { circle: false });
  await hold(page, 5200);

  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__swTutorial?.clear());
  await hold(page, 600);

  await page.goto("/1909/shots/admin?view=map");
  await page.addStyleTag({
    content: "nextjs-portal,[data-next-badge-root]{display:none!important}",
  });
  await expect(page.getByRole("heading", { name: "Soul Winning admin" })).toBeVisible();
  await expect(page.getByPlaceholder("Search a soul, a member, or a place")).toBeVisible();
  await page.waitForSelector(".leaflet-container");
  await page.waitForSelector(".leaflet-marker-icon");
  await page.waitForFunction(() => Boolean(window.__swLeafletMap));
  await hold(page, 1400);
  await installHud(page);

  await say(page, 9, "The map opens with every located soul in view — nothing off-screen.");
  await highlight(page, page.getByRole("button", { name: "Map" }), { circle: true });
  await hold(page, 2200);
  await page.evaluate(() => window.__swTutorial?.clearHighlight());
  await hold(page, 4200);

  await say(page, 10, "Zoom in, then tap a pin for the photo, name and who won them.");
  await zoomMap(page, 1);
  await hold(page, 1600);
  await zoomMap(page, 1);
  await hold(page, 1800);
  await clickMapPin(page);
  await expect(page.locator("[data-map-popup]")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("[data-map-popup]").getByText("Won by", { exact: false })).toBeVisible();
  await highlight(page, page.locator("[data-map-popup]"), { circle: false });
  await hold(page, 4200);

  await page.evaluate(() => window.__swTutorial?.clearHighlight());
  await page.locator(".leaflet-container").click({ position: { x: 80, y: 200 } });
  await hold(page, 700);
  await zoomMap(page, 1);
  await hold(page, 1400);
  await clickMapPin(page);
  await expect(page.locator("[data-map-popup]")).toBeVisible({ timeout: 8000 });
  await hold(page, 3600);

  await page.locator(".leaflet-container").click({ position: { x: 80, y: 200 } });
  await hold(page, 600);
  await say(page, 10, "Zoom back out and every soul is in the frame again.");
  await zoomMap(page, -2);
  await hold(page, 1400);
  await page.evaluate(() => window.__swLeafletFitAll?.());
  await hold(page, 3600);

  await page.evaluate(() => window.__swTutorial?.clear());
  await hold(page, 1200);
  await context.close();

  const recorded = fs
    .readdirSync(VIDEO_DIR)
    .filter((name) => name.endsWith(".webm"))
    .map((name) => ({ name, t: fs.statSync(path.join(VIDEO_DIR, name)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];

  if (!recorded) throw new Error("Playwright did not write a video");

  const webm = path.join(OUT_DIR, "admin-tutorial.webm");
  const mp4 = path.join(OUT_DIR, "admin-tutorial.mp4");
  fs.renameSync(path.join(VIDEO_DIR, recorded.name), webm);
  fs.rmSync(VIDEO_DIR, { recursive: true, force: true });

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
    __swEnqueueSoul?: (soul: {
      name: string;
      photoPath: string | null;
      duration?: number;
      delay?: number;
      lane?: number;
      scale?: number;
      inFront?: boolean;
      spokeInTongues?: boolean;
      comingToChurch?: boolean;
    }) => void;
    __swTutorial?: {
      hideTitle: () => void;
      say: (step: number, total: number, text: string) => void;
      highlight: (box: { x: number; y: number; width: number; height: number }, circle: boolean) => void;
      follow: (selector: string, circle: boolean) => void;
      clearHighlight: () => void;
      clear: () => void;
    };
    __swLeafletMap?: { setZoom: (zoom: number, options?: { animate?: boolean }) => unknown; getZoom: () => number };
    __swLeafletFitAll?: () => void;
  }
}

async function enqueue(
  page: Page,
  soul: {
    name: string;
    photoPath: string | null;
    duration?: number;
    delay?: number;
    lane?: number;
    scale?: number;
    inFront?: boolean;
    spokeInTongues?: boolean;
    comingToChurch?: boolean;
  }
) {
  await page.evaluate((item) => window.__swEnqueueSoul?.(item), soul);
}

async function waitForCard(page: Page, name: string, hasPhoto: boolean) {
  await page.waitForFunction(
    ({ soulName, wantsPhoto }) => {
      const el = document.querySelector(`[data-soul-name="${soulName}"]`);
      if (!el) return false;
      const box = el.getBoundingClientRect();
      const onScreen = box.left > window.innerWidth * 0.08 && box.left < window.innerWidth * 0.55;
      if (!onScreen) return false;
      if (!wantsPhoto) return true;
      const canvas = el.querySelector("canvas");
      return !!canvas && getComputedStyle(canvas).opacity === "1";
    },
    { soulName: name, wantsPhoto: hasPhoto },
    { timeout: 20_000 }
  );
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
        .sw-t-title h1 { margin: 0; font-size: 48px; letter-spacing: -0.04em; font-weight: 560; }
        .sw-t-title p { margin: 12px 0 0; font-size: 18px; color: #c1e1f7; }
        .sw-t-caption {
          position: fixed; left: 50%; top: auto; bottom: 28px; z-index: 2147483646;
          width: min(640px, calc(100vw - 48px));
          transform: translateX(-50%);
          display: flex; gap: 12px; align-items: flex-start;
          background: #0c0a09; color: #fafaf9; border-radius: 16px;
          padding: 14px 16px; box-shadow: 0 18px 40px rgba(12,10,9,.28);
          font-family: ui-sans-serif, system-ui, sans-serif;
          opacity: 0;
          transition: opacity .25s ease, top .2s ease;
        }
        .sw-t-caption.on { opacity: 1; }
        .sw-t-step {
          flex: none; min-width: 42px; height: 24px; border-radius: 999px;
          background: #3ba6f1; color: white; font-size: 12px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
        }
        .sw-t-text { font-size: 16px; line-height: 1.4; font-weight: 500; }
        .sw-t-spot {
          position: fixed; z-index: 2147483640; border-radius: 18px;
          box-shadow: 0 0 0 9999px rgba(12,10,9,.42);
          outline: 2px solid #3ba6f1;
          transition: left .18s ease, top .18s ease, width .18s ease, height .18s ease;
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
      <div class="sw-t-title" style="display:none">
        <h1></h1>
        <p></p>
      </div>
    `;
    document.documentElement.appendChild(root);

    const caption = root.querySelector(".sw-t-caption") as HTMLElement;
    const stepEl = root.querySelector(".sw-t-step") as HTMLElement;
    const textEl = root.querySelector(".sw-t-text") as HTMLElement;
    const titleEl = root.querySelector(".sw-t-title") as HTMLElement;
    const spot = root.querySelector(".sw-t-spot") as HTMLElement;
    const ring = root.querySelector(".sw-t-ring") as HTMLElement;

    let followRaf = 0;
    let following = false;
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
      const width = Math.min(640, window.innerWidth - 48);
      const height = Math.max(caption.offsetHeight || 56, 56);
      const x = (window.innerWidth - width) / 2;
      const pad = 24;
      const topY = pad;
      const bottomY = window.innerHeight - height - pad;
      const zone = avoid
        ? { x: avoid.x - 20, y: avoid.y - 20, width: avoid.width + 40, height: avoid.height + 40 }
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
      caption.style.width = `${width}px`;
      caption.style.left = "50%";
      caption.style.top = `${y}px`;
      caption.style.bottom = "auto";
      caption.style.transform = "translateX(-50%)";
    };

    const paint = (box: { x: number; y: number; width: number; height: number }, circle: boolean) => {
      const pad = 8;
      lastAvoid = box;
      spot.style.display = "block";
      spot.style.left = `${box.x - pad}px`;
      spot.style.top = `${box.y - pad}px`;
      spot.style.width = `${box.width + pad * 2}px`;
      spot.style.height = `${box.height + pad * 2}px`;
      if (circle && Math.max(box.width, box.height) < 280) {
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
    };

    const stopFollow = () => {
      following = false;
      if (followRaf) cancelAnimationFrame(followRaf);
      followRaf = 0;
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
        stopFollow();
        paint(box, circle);
      },
      follow(selector, circle) {
        stopFollow();
        following = true;
        const tick = () => {
          if (!following) return;
          const el = document.querySelector(selector);
          if (el) {
            const rect = el.getBoundingClientRect();
            paint({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }, circle);
          }
          followRaf = requestAnimationFrame(tick);
        };
        tick();
      },
      clearHighlight() {
        stopFollow();
        lastAvoid = null;
        spot.style.display = "none";
        ring.style.display = "none";
        placeCaption(null);
      },
      clear() {
        stopFollow();
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
      const wrap = document.querySelector("#sw-tutorial .sw-t-title") as HTMLElement | null;
      const h = document.querySelector("#sw-tutorial .sw-t-title h1");
      const p = document.querySelector("#sw-tutorial .sw-t-title p");
      if (wrap) {
        wrap.style.display = "flex";
        wrap.style.opacity = "1";
      }
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

async function follow(page: Page, selector: string, circle: boolean) {
  await page.evaluate(
    ({ selector, circle }) => window.__swTutorial?.follow(selector, circle),
    { selector, circle }
  );
}

async function hold(page: Page, ms: number) {
  await page.waitForTimeout(ms);
}

async function zoomMap(page: Page, delta: number) {
  await page.evaluate((amount) => {
    const map = window.__swLeafletMap;
    if (!map) return;
    map.setZoom(map.getZoom() + amount, { animate: true });
  }, delta);
  await page.waitForTimeout(650);
}

async function clickMapPin(page: Page) {
  for (let round = 0; round < 8; round += 1) {
    if (await page.locator("[data-map-popup]").isVisible()) return;

    const target = await page.evaluate((index) => {
      const mapEl = document.querySelector(".leaflet-container");
      if (!mapEl) return null;
      const mapBox = mapEl.getBoundingClientRect();
      const cx = mapBox.left + mapBox.width / 2;
      const cy = mapBox.top + mapBox.height / 2;
      const icons = [...document.querySelectorAll(".leaflet-marker-icon")] as HTMLElement[];
      const inView = icons
        .map((el) => {
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          return {
            cluster: el.classList.contains("marker-cluster"),
            x,
            y,
            dist: Math.hypot(x - cx, y - cy),
            in:
              x > mapBox.left + 56 &&
              x < mapBox.right - 56 &&
              y > mapBox.top + 100 &&
              y < mapBox.bottom - 56,
          };
        })
        .filter((point) => point.in)
        .sort((a, b) => Number(a.cluster) - Number(b.cluster) || a.dist - b.dist);
      const hit = inView[Math.min(index, Math.max(inView.length - 1, 0))];
      return hit ? { x: hit.x, y: hit.y } : null;
    }, round);

    if (target) await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(800);
  }
}
