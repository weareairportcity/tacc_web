"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { parseUserAgent } from "@/lib/camp/device";
import { screenOf, takeTapTimes } from "./count";

/**
 * Counts a visit: the screens in order, which buttons were used, how long things took to
 * show, and errors. Nothing is sent while the visit goes on; when the phone puts the page
 * away (or the tab closes) the whole visit goes in one small request. No cookie, no name,
 * no sign-in: a visit can't be tied to a person, so it needs no "do you agree" box.
 * Anyone can switch it off on the privacy page ("Don't count my visits").
 */

export type CountArea = "attendee" | "leader" | "coordinator";
export const COUNT_OFF_KEY = "cm_count_off";

// Only the live site counts by default, so the local demo can't add to the real numbers.
const URL_BASE =
  process.env.NEXT_PUBLIC_COMMUNE_STATS_URL ||
  (typeof location !== "undefined" && location.hostname === "commune.theairportcitychurch.com" ? (process.env.NEXT_PUBLIC_SW_API_URL ?? "") : "");

type Visit = {
  start: number;
  flow: string[];
  camp: string;
  taps: Record<string, number>;
  errors: { screen: string; message: string; stack: string }[];
  navs: number[];
  perf: { ttfb?: number; load?: number; lcp?: number };
  sent: boolean;
};

let visit: Visit | null = null;
let navStart = 0;
let current = "";
let currentCamp = "";
let source = "";

const off = () => {
  try {
    return localStorage.getItem(COUNT_OFF_KEY) === "1";
  } catch {
    return false;
  }
};

const newVisit = (): Visit => ({ start: Date.now(), flow: current ? [current] : [], camp: currentCamp, taps: {}, errors: [], navs: [], perf: {}, sent: false });
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined);

/** Where they came from: ?src=flyer on the link, or the site that sent them. */
function sourceOf() {
  const params = new URLSearchParams(location.search);
  const tagged = params.get("src") || params.get("utm_source");
  if (tagged) return tagged.slice(0, 40);
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : "";
    if (!host || host === location.hostname) return "";
    return /whatsapp/.test(host) ? "whatsapp" : /facebook|fb\./.test(host) ? "facebook" : /instagram/.test(host) ? "instagram" : /google\./.test(host) ? "google" : host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function deviceInfo() {
  const d = parseUserAgent(navigator.userAgent);
  // iPads ask for the computer version of sites and say they're Macs.
  if (d.os === "macOS" && navigator.maxTouchPoints > 1) Object.assign(d, { os: "iOS", device: "tablet", osVersion: "" });
  let model = "";
  type Hints = { getHighEntropyValues: (h: string[]) => Promise<{ model?: string; platformVersion?: string }> };
  const hints = (navigator as Navigator & { userAgentData?: Hints }).userAgentData;
  if (hints) {
    // Chrome hides the real Android version and phone model in its user agent; it tells pages that ask.
    const v = await hints.getHighEntropyValues(["model", "platformVersion"]).catch(() => ({}) as { model?: string; platformVersion?: string });
    model = v.model ?? "";
    if (d.os === "Android" && v.platformVersion) d.osVersion = v.platformVersion.split(".")[0];
  }
  type Connection = { type?: string; effectiveType?: string };
  const c = (navigator as Navigator & { connection?: Connection }).connection;
  const conn = c?.type === "wifi" ? "wifi" : (c?.effectiveType ?? "");
  return { ...d, model, conn, lang: navigator.language };
}

let device: Awaited<ReturnType<typeof deviceInfo>> | null = null;

function send(area: CountArea) {
  const v = visit;
  if (!v || v.sent || !URL_BASE || off()) return;
  v.sent = true;
  const dur = Date.now() - v.start;
  if (!v.flow.length || dur < 1000) return;
  const body = JSON.stringify({
    area,
    camp: v.camp,
    dur,
    flow: v.flow,
    taps: v.taps,
    errors: v.errors,
    perf: { ...v.perf, nav: avg(v.navs), tap: avg(takeTapTimes()) },
    dev: device ?? {},
    src: source,
  });
  // text/plain, so the browser sends it without asking the server first.
  navigator.sendBeacon?.(`${URL_BASE}/v1/c/v`, new Blob([body], { type: "text/plain" }));
}

/** What a tap was on, in a few words; nothing from inside a list or table, where names live. */
function tapLabel(el: Element): string | null {
  if (el.closest("li, tr, [data-no-count]")) return null;
  if (el instanceof HTMLAnchorElement) {
    try {
      const url = new URL(el.href);
      return url.hostname === location.hostname ? `→ ${screenOf(url.pathname).screen}` : `→ ${url.hostname.replace(/^www\./, "")}`;
    } catch {
      return null;
    }
  }
  const text = (el.getAttribute("data-count") || el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
  return text && text.length <= 40 ? text : null;
}

export function Collector({ area }: { area: CountArea }) {
  const pathname = usePathname();

  useEffect(() => {
    const { screen, camp } = screenOf(pathname);
    if (screen === current) return;
    current = screen;
    if (camp) currentCamp = camp;
    if (!visit) return;
    if (navStart) {
      visit.navs.push(Math.round(performance.now() - navStart));
      navStart = 0;
    }
    if (camp) visit.camp = camp;
    if (visit.flow.length < 40) visit.flow.push(screen);
  }, [pathname]);

  useEffect(() => {
    if (!URL_BASE || off()) return;
    source = sourceOf();
    ({ screen: current, camp: currentCamp } = screenOf(location.pathname));
    visit = newVisit();
    void deviceInfo().then((d) => (device = d));

    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const readLoad = () => {
      if (nav && visit) visit.perf = { ...visit.perf, ttfb: Math.round(nav.responseStart), load: Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd) || undefined };
    };
    if (document.readyState === "complete") readLoad();
    else addEventListener("load", () => setTimeout(readLoad), { once: true });
    let lcp: PerformanceObserver | null = null;
    try {
      lcp = new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        // Only the first screen's: later ones aren't fresh page loads.
        if (last && visit && visit.flow.length <= 1) visit.perf.lcp = Math.round(last.startTime);
      });
      lcp.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // Safari before 17 has no largest-contentful-paint.
    }

    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("a[href], button, summary, [role=button]");
      if (!el || !visit) return;
      if (el instanceof HTMLAnchorElement && el.origin === location.origin) navStart = performance.now();
      const label = tapLabel(el);
      if (!label) return;
      const key = `${current} · ${label}`;
      if (Object.keys(visit.taps).length < 40 || key in visit.taps) visit.taps[key] = (visit.taps[key] ?? 0) + 1;
    };
    const onError = (message: string, stack: string) => {
      if (visit && visit.errors.length < 5) visit.errors.push({ screen: current, message: message.slice(0, 200), stack: stack.slice(0, 1500) });
    };
    const onWindowError = (e: ErrorEvent) => onError(e.message || "Error", e.error?.stack ?? `${e.filename}:${e.lineno}`);
    const onRejection = (e: PromiseRejectionEvent) => onError(String(e.reason?.message ?? e.reason ?? "Unhandled promise"), String(e.reason?.stack ?? ""));
    const onHide = () => {
      if (document.visibilityState === "hidden") send(area);
      else if (visit?.sent) visit = newVisit();
    };
    const onPageHide = () => send(area);

    addEventListener("click", onClick, true);
    addEventListener("error", onWindowError);
    addEventListener("unhandledrejection", onRejection);
    document.addEventListener("visibilitychange", onHide);
    addEventListener("pagehide", onPageHide);
    return () => {
      lcp?.disconnect();
      removeEventListener("click", onClick, true);
      removeEventListener("error", onWindowError);
      removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("visibilitychange", onHide);
      removeEventListener("pagehide", onPageHide);
    };
  }, [area]);

  return null;
}
