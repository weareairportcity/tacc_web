"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Busy } from "@/components/camp/brand";
import { leaderSignInAction } from "../session";

export function LeaderSignIn({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="cm-rise flex flex-col gap-4"
      style={{ animationDelay: "60ms" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setPending(true);
        const r = await leaderSignInAction(code);
        if (!r.ok) {
          setPending(false);
          return setError(r.error);
        }
        router.replace(next);
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Your leader code</span>
        <input
          required
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCDE-FGHJK"
          aria-describedby="code-hint"
          className="h-16 w-full rounded-[12px] border border-white/20 bg-white/5 px-4 text-center font-mono text-2xl uppercase tracking-[0.18em] text-white placeholder:text-white/30 focus:outline-2 focus:outline-offset-2 focus:outline-cyan-signal"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <span id="code-hint" className="text-[13px] text-stone-muted">
          From the camp admin. Dashes and spaces are fine.
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-white">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="cm-press inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full border border-cyan-edge bg-cyan-signal text-base font-medium text-ink-black disabled:opacity-60"
      >
        <Busy pending={pending} text="Signing in…">Sign in</Busy>
      </button>
    </form>
  );
}
