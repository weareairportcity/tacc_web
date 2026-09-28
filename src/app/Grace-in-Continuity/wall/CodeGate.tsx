"use client";

import { useActionState } from "react";
import { unlock, type UnlockState } from "./actions";

export function CodeGate() {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlock, { error: null });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-[family-name:var(--font-card-serif)] text-sm uppercase tracking-[0.3em] text-[#8a847d]">
        Grace in Continuity
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-card-serif)] text-4xl font-medium text-[#2b2724]">
        Birthday Wall
      </h1>
      <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-[#7a746d]">
        This page is private. Please enter your code to see the notes.
      </p>
      <form action={action} className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <label htmlFor="code" className="sr-only">
          Code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          required
          placeholder="Enter code"
          className="rounded-full border border-[#dcd7cf] bg-white px-5 py-3.5 text-center text-lg tracking-[0.3em] text-[#2b2724] outline-none placeholder:tracking-normal placeholder:text-[#b5afa7] focus:border-[#8a847d]"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[#2b2724] px-6 py-3.5 text-[15px] font-medium text-white transition-opacity disabled:opacity-50"
        >
          {pending ? "Checking…" : "Open the wall"}
        </button>
        {state.error && (
          <p role="alert" className="text-sm text-[#b4562e]">
            {state.error}
          </p>
        )}
      </form>
    </main>
  );
}
