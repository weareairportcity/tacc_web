"use client";

/**
 * Browser side of app notifications and installing Commune. iPhones only
 * allow notifications for apps added to the Home Screen (iOS 16.4+);
 * Android and computers allow them in the browser too.
 */

export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let installEvent: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e as InstallEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    listeners.forEach((f) => f());
  });
}

export const onInstallChange = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export const canPromptInstall = () => installEvent !== null;
export async function promptInstall() {
  const e = installEvent;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  installEvent = null;
  listeners.forEach((f) => f());
  return outcome === "accepted";
}

export type Platform = "ios" | "android" | "desktop";
export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  const ownHost = location.hostname.startsWith("commune.");
  await navigator.serviceWorker.register("/camps/sw.js", { scope: ownHost ? "/" : "/camps/" });
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const keyBytes = (base64url: string) => {
  const s = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((base64url.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Asks for permission (must follow a tap) and subscribes this phone. */
export async function subscribe(key: string): Promise<PushSubscriptionJSON | "denied"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  return sub.toJSON();
}
