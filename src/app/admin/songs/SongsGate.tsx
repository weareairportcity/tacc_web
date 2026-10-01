"use client";

import { useActionState } from "react";
import { Music } from "lucide-react";
import { unlockSongsAdmin, type UnlockState } from "./actions";

export function SongsGate() {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlockSongsAdmin, { error: null });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#fafaf9] px-6 text-center font-sans">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
        <Music className="h-5 w-5 text-[#0c0a09]" />
      </div>
      <h1 className="mt-5 text-2xl font-medium tracking-[-0.02em] text-[#0c0a09]">Song of the Week admin</h1>
      <p className="mt-2 max-w-xs text-sm text-[#78716c]">Enter the songs admin code to continue.</p>
      <form action={action} className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <label htmlFor="code" className="sr-only">
          Songs admin code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          required
          placeholder="Admin code"
          className="rounded-lg border border-[#e8e6e5] bg-white px-4 py-3 text-center text-lg tracking-[0.25em] text-[#0c0a09] outline-none placeholder:tracking-normal placeholder:text-[#a8a29e] focus:border-[#3ba6f1]"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#0c0a09] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Checking…" : "Open songs admin"}
        </button>
        {state.error && <p className="text-sm text-[#f54911]">{state.error}</p>}
      </form>
    </main>
  );
}
