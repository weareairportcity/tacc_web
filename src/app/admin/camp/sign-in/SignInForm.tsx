"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { noteStaffSignInAction } from "../session";
import { Busy } from "@/components/camp/brand";
import { ErrorText, inputClass, primaryButtonClass } from "@/components/camp/ui";

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPending(true);
    // No answer within 20 s counts as a failure, so the button never spins for ever.
    const { error: failed } = await Promise.race([
      createClient().auth.signInWithPassword({ email: email.trim(), password }),
      new Promise<{ error: { message: string } }>((resolve) => setTimeout(() => resolve({ error: { message: "Couldn't reach the sign-in service. Check your connection and try again." } }), 20_000)),
    ]).catch(() => ({ error: { message: "Couldn't reach the sign-in service. Check your connection and try again." } }));
    if (failed) {
      setPending(false);
      if (failed.message === "Invalid login credentials") void noteStaffSignInAction(false, email).catch(() => {});
      return setError(failed.message === "Invalid login credentials" ? "That email and password don't match." : failed.message);
    }
    // For the sign-in log, sent before leaving; the page doesn't wait for it.
    void noteStaffSignInAction(true).catch(() => {});
    // A full page load, not an in-app switch: the new session cookie goes with it for certain,
    // and it always ends on a page (on some iPhones the in-app switch never finished).
    window.location.replace(next);
  };

  return (
    <form onSubmit={submit} className="cm-rise flex flex-col gap-5" style={{ animationDelay: "60ms" }}>
      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-medium">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@theairportcitychurch.com"
          className={`${inputClass} h-12 text-base`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-[15px] font-medium">
          Password
        </label>
        <span className="relative flex">
          <input
            id="password"
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            aria-describedby="password-hint"
            className={`${inputClass} h-12 pr-12 text-base`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="cm-press absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-warm-gray hover:text-ink-black"
          >
            {show ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.6} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.6} />}
          </button>
        </span>
        <span id="password-hint" className="text-[13px] text-warm-gray">
          Forgotten it? Ask a camp admin to reset it.
        </span>
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButtonClass} mt-1 h-[52px] w-full text-base`}>
        <Busy pending={pending} text="Signing in…">Sign in</Busy>
      </button>
    </form>
  );
}
