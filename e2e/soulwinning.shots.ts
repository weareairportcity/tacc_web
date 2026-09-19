import { expect, type Page, test } from "@playwright/test";
import path from "path";

const ORIGIN = "http://127.0.0.1:3000";
const SHOTS = path.join(process.cwd(), "docs/soulwinning/shots");
const PHOTO = path.join(process.cwd(), "public/1909/shots/sample-soul.jpg");

async function snap(page: Page, name: string, fullPage = false) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({
    path: path.join(SHOTS, `${name}.png`),
    animations: "allow",
    caret: "hide",
    fullPage,
  });
}

async function grantLocation(page: Page) {
  await page.context().grantPermissions(["geolocation"], { origin: ORIGIN });
  await page.context().setGeolocation({ latitude: 5.6037, longitude: -0.187 });
}

async function becomeMember(page: Page, name: string, extras?: { fellowship?: string }) {
  await page.goto("/1909/shots/entry");
  await expect(page.getByRole("button", { name: "Start new" })).toBeVisible();
  await page.getByRole("button", { name: "Start new" }).click();
  await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByLabel("Fellowship").selectOption(extras?.fellowship ?? "Qadash");
  await page.getByRole("textbox", { name: "Number" }).fill("0244123456");
  await page.getByRole("button", { name: "Start logging" }).click();

  const enable = page.getByRole("button", { name: "Enable location" });
  if (await enable.isVisible().catch(() => false)) {
    await enable.click();
  }

  await expect(page.getByPlaceholder("Name")).toBeVisible();
}

async function enqueueSouls(page: Page, souls: Array<Record<string, unknown>>) {
  await page.waitForFunction(() => typeof window.__swEnqueueSoul === "function");
  await page.evaluate((items) => {
    for (const soul of items) window.__swEnqueueSoul?.(soul as never);
  }, souls);
}

async function waitForCardInView(page: Page, name: string, hasPhoto = false) {
  await page.waitForFunction(
    ({ soulName, wantsPhoto }) => {
      const el = document.querySelector(`[data-soul-name="${soulName}"]`);
      if (!el) return false;
      const box = el.getBoundingClientRect();
      const onScreen = box.left > window.innerWidth * 0.08 && box.left < window.innerWidth * 0.52;
      if (!onScreen) return false;
      if (!wantsPhoto) return true;
      const canvas = el.querySelector("canvas");
      return !!canvas && getComputedStyle(canvas).opacity === "1";
    },
    { soulName: name, wantsPhoto: hasPhoto },
    { timeout: 20_000 }
  );
}

test.describe("soul winning shots", () => {
  test("member onboarding filled", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/1909/shots/entry");
    await page.getByRole("button", { name: "Start new" }).click();
    await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
    await page.getByRole("textbox", { name: "Name" }).fill("Kofi Mensah");
    await page.getByLabel("Fellowship").selectOption("Qadash");
    await page.getByRole("textbox", { name: "Number" }).fill("0244123456");
    await snap(page, "01-member-onboarding");
  });

  test("location prompt", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/1909/shots/entry");
    await page.getByRole("button", { name: "Start new" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill("Kofi Mensah");
    await page.getByLabel("Fellowship").selectOption("Qadash");
    await page.getByRole("textbox", { name: "Number" }).fill("0244123456");
    await page.getByRole("button", { name: "Start logging" }).click();
    await expect(page.getByRole("heading", { name: "Turn on location" })).toBeVisible();
    await snap(page, "02-location-prompt");
  });

  test("entry form without photo, then counter floats that name", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: 5.6037, longitude: -0.187 },
      permissions: ["geolocation"],
    });
    const entry = await context.newPage();
    await becomeMember(entry, "Kofi Mensah");

    await entry.getByPlaceholder("Name").fill("Ama Boateng");
    await entry.getByPlaceholder("Phone").fill("0209988776");
    await entry.getByRole("switch", { name: "Spoke in tongues" }).click();
    await entry.getByRole("switch", { name: "Coming to church" }).click();
    await expect(entry.getByText(/Location captured|Getting location|No location yet/)).toBeVisible();
    await snap(entry, "03-log-soul-without-photo");

    const counter = await context.newPage();
    await counter.setViewportSize({ width: 1440, height: 900 });
    await counter.goto("/1909/shots/counter");
    await expect(counter.getByText("souls won for Christ")).toBeVisible();

    await enqueueSouls(counter, [
      {
        name: "Ama Boateng",
        photoPath: null,
        delay: 0,
        duration: 10,
        lane: 26,
        scale: 1.08,
        inFront: true,
        spokeInTongues: true,
        comingToChurch: true,
      },
      {
        name: "Yaw",
        photoPath: null,
        delay: 0.35,
        duration: 11,
        lane: 6,
        scale: 0.82,
        inFront: false,
      },
      {
        name: "Akosua",
        photoPath: null,
        delay: 0.7,
        duration: 12,
        lane: 58,
        scale: 0.9,
        inFront: true,
      },
    ]);

    await waitForCardInView(counter, "Ama Boateng");
    await snap(counter, "04-counter-floating-names");
    await context.close();
  });

  test("entry form with photo, then counter floats the photo card", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: 5.6037, longitude: -0.187 },
      permissions: ["geolocation"],
    });
    const entry = await context.newPage();
    await becomeMember(entry, "Kofi Mensah");

    await entry.getByPlaceholder("Name").fill("Kwame Mensah");
    await entry.getByPlaceholder("Phone").fill("0244001122");
    await entry.getByLabel("Upload photo for soul 1").setInputFiles(PHOTO);
    await expect(entry.getByText("Photo added")).toBeVisible();
    await entry.getByRole("switch", { name: "Spoke in tongues" }).click();
    await entry.getByRole("switch", { name: "Coming to church" }).click();
    await snap(entry, "05-log-soul-with-photo");

    const counter = await context.newPage();
    await counter.setViewportSize({ width: 1440, height: 900 });
    await counter.goto("/1909/shots/counter");
    await expect(counter.getByText("souls won for Christ")).toBeVisible();

    await enqueueSouls(counter, [
      {
        name: "Kwame Mensah",
        photoPath: "/1909/shots/sample-soul.jpg",
        delay: 0,
        duration: 10,
        lane: 18,
        scale: 1.05,
        inFront: true,
        spokeInTongues: true,
        comingToChurch: true,
      },
      {
        name: "Ama",
        photoPath: null,
        delay: 0.4,
        duration: 11,
        lane: 62,
        scale: 0.88,
        inFront: false,
      },
    ]);

    await waitForCardInView(counter, "Kwame Mensah", true);
    await snap(counter, "06-counter-floating-photo");
    await context.close();
  });

  test("group of souls and member switcher", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await grantLocation(page);
    await becomeMember(page, "Kofi Mensah");

    await page.getByPlaceholder("Name").fill("Emmanuel Tetteh");
    await page.getByPlaceholder("Phone").fill("0244111222");
    await page.getByRole("switch", { name: "Coming to church" }).click();
    await page.getByRole("button", { name: "Add another soul" }).click();
    await page.getByPlaceholder("Name").nth(1).fill("Grace Adjei");
    await page.getByPlaceholder("Phone").nth(1).fill("0203344556");
    await page.getByRole("switch", { name: "Spoke in tongues" }).nth(1).click();
    await snap(page, "07-log-soul-group", true);

    await page.getByRole("button", { name: /Kofi Mensah/ }).click();
    await expect(page.getByRole("heading", { name: "Switch member" })).toBeVisible();
    await page.getByRole("button", { name: "Add another member on this phone" }).click();
    await page.getByRole("button", { name: "Start new" }).click();
    await expect(page.getByRole("heading", { name: "New member" })).toBeVisible();
    await page.getByLabel("Name").fill("Ama Boateng");
    await page.getByLabel("Fellowship").selectOption("Chosen");
    await page.getByLabel("Number").fill("0277008899");
    await page.getByRole("button", { name: "Start logging" }).click();
    await page.getByRole("button", { name: /Ama Boateng/ }).click();
    await expect(page.getByRole("heading", { name: "Switch member" })).toBeVisible();
    await expect(page.getByText("Kofi Mensah")).toBeVisible();
    await snap(page, "08-member-switcher");
  });

  test("my souls tab lists who this member entered", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await grantLocation(page);
    await becomeMember(page, "Kofi Mensah");

    await page.getByPlaceholder("Name").fill("Ama Serwaa");
    await page.getByPlaceholder("Phone").fill("0209988776");
    await expect(page.getByRole("button", { name: "Save soul" })).toBeEnabled({ timeout: 12_000 });
    await page.getByRole("button", { name: "Save soul" }).click();
    await expect(page.getByRole("heading", { name: "Successful" })).toBeVisible();

    await page.getByRole("button", { name: /My souls/ }).click();
    await expect(page.getByText("Ama Serwaa")).toBeVisible();
    await expect(page.getByText(/0209988776/)).toBeVisible();
  });

  test("big screen with floating cards", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/1909/shots/screen");
    await expect(page.getByText("souls won for Christ")).toBeVisible();
    await enqueueSouls(page, [
      {
        name: "Kwame Mensah",
        photoPath: "/1909/shots/sample-soul.jpg",
        delay: 0,
        duration: 10,
        lane: 20,
        scale: 1,
        inFront: true,
        spokeInTongues: true,
        comingToChurch: true,
      },
      {
        name: "Ama Boateng",
        photoPath: null,
        delay: 0.3,
        duration: 11,
        lane: 52,
        scale: 0.9,
        inFront: true,
      },
    ]);
    await waitForCardInView(page, "Kwame Mensah", true);
    await page.locator("[data-photo-marquee] img").first().waitFor({ state: "visible" });
    await snap(page, "09-big-screen");
  });

  test("admin photo wall", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/1909/shots/admin?view=wall");
    await expect(page.getByRole("button", { name: "Wall" })).toBeVisible();
    await expect(page.locator("[data-wall-tile]").first()).toBeVisible();
    await page.locator("[data-wall-tile] img").first().waitFor({ state: "visible" });
    await snap(page, "13-admin-wall");
    await page.locator('[data-wall-tile="Kwame Mensah"]').click();
    await expect(page.locator("[data-wall-detail]").getByRole("heading", { name: "Kwame Mensah" })).toBeVisible();
    await snap(page, "14-admin-wall-detail");
  });

  test("admin overview with rankings", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/1909/shots/admin?view=overview");
    await expect(page.getByText("Members entering")).toBeVisible();
    await expect(page.getByText("Kofi Mensah")).toBeVisible();
    await page.getByText("Souls per hour").hover();
    await snap(page, "10-admin-overview");
  });

  test("duplicate review queue", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/1909/shots/admin?view=duplicates");
    await expect(page.getByText("Emmanuel Tetteh")).toBeVisible();
    await expect(page.getByRole("button", { name: "Separate soul" }).first()).toBeVisible();
    await snap(page, "11-admin-duplicates");
  });

  test("map with pins and a member popup", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/1909/shots/admin?view=map");
    await expect(page.getByPlaceholder("Search a soul, a member, or a place")).toBeVisible({
      timeout: 45_000,
    });
    await page.waitForSelector(".leaflet-container");
    await page.waitForTimeout(2500);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (await page.locator("[data-map-popup]").isVisible()) break;
      await page.locator(".leaflet-marker-icon, .leaflet-interactive").nth(attempt).click({ force: true });
      await page.waitForTimeout(700);
    }
    await expect(page.locator("[data-map-popup]")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("[data-map-popup]").getByText("Won by", { exact: false })).toBeVisible();
    await page.waitForTimeout(800);
    await snap(page, "12-admin-map");
  });
});
