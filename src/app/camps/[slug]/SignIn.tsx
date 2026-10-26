"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { ErrorText, Field, inputClass, secondaryButtonClass } from "@/components/camp/ui";
import { forgotCodeAction, signInAction } from "./actions";

/** `next`: where to go after signing in, e.g. a group join link. */
export function SignIn({ slug, next }: { slug: string; next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"code" | "forgot">("code");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      if (mode === "code") {
        const result = await signInAction(slug, value);
        if (!result.ok) return setError(result.error);
        router.push(next ?? `/camps/${slug}/me`);
      } else {
        const result = await forgotCodeAction(slug, value);
        if (!result.ok) return setError(result.error);
        setSent(true);
      }
    });
  };

  const switchTo = (next: "code" | "forgot") => {
    setMode(next);
    setValue("");
    setError("");
    setSent(false);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      {mode === "code" ? (
        <Field label="Your sign-in code">
          <input
            required
            autoComplete="one-time-code"
            autoCapitalize="characters"
            className={`${inputClass} font-mono uppercase tracking-[0.15em]`}
            placeholder="ABCD-EFGH"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      ) : (
        <Field label="The phone number you registered with">
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={inputClass}
            placeholder="055 111 2222"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
      {sent && (
        <p role="status" className="flex items-start gap-2 text-sm leading-snug">
          <CircleCheck className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.8} aria-hidden="true" />
          If that number is registered, we&apos;ve texted it a new code. Your old code no longer works.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className={`${secondaryButtonClass} h-11 px-5`}>
          <Busy pending={pending} text={mode === "code" ? "Signing in…" : "Sending…"}>{mode === "code" ? "Sign in" : "Text me a new code"}</Busy>
        </button>
        <button
          type="button"
          onClick={() => switchTo(mode === "code" ? "forgot" : "code")}
          className="min-h-11 text-sm text-warm-gray underline decoration-stone-muted underline-offset-[3px] hover:text-ink-black"
        >
          {mode === "code" ? "Forgot your code?" : "I have my code"}
        </button>
      </div>
    </form>
  );
}
