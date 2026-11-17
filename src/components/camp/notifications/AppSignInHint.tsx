"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { isInstalled } from "./push-client";

/** Opened from the Home Screen for the first time: say why they're asked to sign in again. */
export function AppSignInHint() {
  const [app, setApp] = useState(false);
  useEffect(() => {
    // Only the browser knows it's the Home Screen app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApp(isInstalled());
  }, []);
  if (!app) return null;
  return (
    <p role="status" className="cm-pop flex items-start gap-3 rounded-[14px] bg-cyan-tint px-4 py-3.5 text-[15px] leading-relaxed">
      <Smartphone className="mt-0.5 h-5 w-5 flex-none text-cyan-deep" strokeWidth={1.6} aria-hidden="true" />
      <span>
        <strong className="font-semibold">You&apos;re in the Commune app.</strong> Sign in once more with the code from your registration text. It&apos;ll
        remember you after this.
      </span>
    </p>
  );
}
