import { describe, expect, it } from "vitest";
import { screenOf } from "@/components/camp/count";
import { describeDevice, parseUserAgent } from "@/lib/camp/device";

// What a visit says about where someone was and on what: no names, ids or codes.

describe("screens", () => {
  it("names a camp's screens without the camp, and keeps the camp apart", () => {
    expect(screenOf("/camps/youth-camp-2026/me/details")).toEqual({ screen: "/:camp/me/details", camp: "youth-camp-2026" });
    expect(screenOf("/youth-camp-2026")).toEqual({ screen: "/:camp", camp: "youth-camp-2026" });
    expect(screenOf("/")).toEqual({ screen: "/", camp: "" });
    expect(screenOf("/privacy")).toEqual({ screen: "/privacy", camp: "" });
    expect(screenOf("/camps/privacy")).toEqual({ screen: "/privacy", camp: "" });
  });

  it("takes out pay-link tokens, ids and numbers", () => {
    expect(screenOf("/camps/youth-camp-2026/pay/aB3dE5fG7hJ9kL1mN3pQ").screen).toBe("/:camp/pay/:token");
    expect(screenOf("/admin/camp/057882c0-df50-462b-ad20-64b60642676f/people").screen).toBe("/admin/:camp/people");
    expect(screenOf("/leaders/057882c0-df50-462b-ad20-64b60642676f/people").camp).toBe("057882c0-df50-462b-ad20-64b60642676f");
    expect(screenOf("/camps/c/join/4831220716").screen).toBe("/:camp/join/:n");
  });
});

describe("devices", () => {
  it("reads phones, systems and browsers", () => {
    const iphone = parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1");
    expect(iphone).toEqual({ device: "phone", os: "iOS", osVersion: "18", browser: "Safari" });
    expect(describeDevice(iphone)).toBe("iPhone · iOS 18 · Safari");
    const android = parseUserAgent("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36");
    // Chrome's "Android 10; K" is the same on every phone: no version is better than a wrong one.
    expect(describeDevice(android)).toBe("Android · Chrome");
    expect(describeDevice(parseUserAgent("Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36"))).toBe("Android 13 · Samsung Internet");
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36").device).toBe("computer");
    expect(parseUserAgent("").device).toBe("");
  });
});
