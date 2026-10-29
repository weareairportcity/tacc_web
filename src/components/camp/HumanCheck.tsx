"use client";

import { useEffect, useRef } from "react";

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
 * Cloudflare's "are you a person" check. Most people never see it; when Cloudflare isn't
 * sure, a box to tick appears here. Shows nothing until the site key is set.
 * `round` changes after each try, since a pass works once.
 */
export function HumanCheck({ onToken, round }: { onToken: (token: string) => void; round: number }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const latest = useRef(onToken);
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
          callback: (t: string) => latest.current(t),
          "expired-callback": () => latest.current(""),
          "error-callback": () => latest.current(""),
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
      window.turnstile?.reset(id.current);
    }
  }, [round]);

  if (!SITE_KEY) return null;
  return <div ref={box} className="min-h-0 empty:hidden" />;
}
