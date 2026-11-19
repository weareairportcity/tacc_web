"use client";

import { useEffect, useRef } from "react";

export const HUMAN_CHECK_ON = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<void> | null = null;
const load = () =>
  (loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile failed to load"));
    document.head.appendChild(s);
  }));

/**
 * Wait briefly for a pass if the widget is still working. With none, the form
 * goes anyway: the server lets them through under a tighter limit.
 */
export async function waitForHuman(current: () => string, retry: () => void, ms = 5_000) {
  if (!HUMAN_CHECK_ON) return "";
  const have = current();
  if (have) return have;
  retry();
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    const next = current();
    if (next) return next;
  }
  return "";
}

/**
 * Cloudflare's "are you a person" check. Most people never see it; when Cloudflare isn't
 * sure, a box to tick appears here. Shows nothing until the site key is set.
 * `round` changes after each try, since a pass works once.
 */
export function HumanCheck({ onToken, round }: { onToken: (token: string) => void; round: number }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const latest = useRef(onToken);
  const errors = useRef(0);
  useEffect(() => {
    latest.current = onToken;
  });

  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    let gone = false;
    load()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return;
        id.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          size: "flexible",
          retry: "auto",
          callback: (t: string) => {
            errors.current = 0;
            latest.current(t);
          },
          "expired-callback": () => {
            latest.current("");
            if (id.current) window.turnstile?.reset(id.current);
          },
          "error-callback": () => {
            latest.current("");
            errors.current += 1;
            if (id.current && errors.current < 3) {
              const widget = id.current;
              setTimeout(() => window.turnstile?.reset(widget), 1500 * errors.current);
            }
          },
        });
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, []);

  useEffect(() => {
    if (round && id.current) {
      latest.current("");
      errors.current = 0;
      window.turnstile?.reset(id.current);
    }
  }, [round]);

  if (!SITE_KEY) return null;
  return <div ref={box} className="min-h-0 empty:hidden" />;
}
