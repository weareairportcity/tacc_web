"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ErrorText, Field, buttonClass, inputClass } from "@/components/camp/ui";
import { forgotCodeAction, signInAction } from "./actions";

export function SignIn({ slug }: { slug: string }) {
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
        router.push(`/camps/${slug}/me`);
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
    <form onSubmit={submit} className="space-y-3">
      {mode === "code" ? (
        <Field label="Your sign-in code">
          <input
            required
            autoComplete="off"
            autoCapitalize="characters"
            className={`${inputClass} font-mono uppercase tracking-widest`}
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
            className={inputClass}
            placeholder="055 111 2222"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
      {sent && (
        <p className="text-sm text-emerald-700">
          If that number is registered, we&apos;ve texted it a new code. Your old code no longer works.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "code" ? "Sign in" : "Text me a new code"}
        </button>
        <button
          type="button"
          onClick={() => switchTo(mode === "code" ? "forgot" : "code")}
          className="text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          {mode === "code" ? "Forgot your code?" : "I have my code"}
        </button>
      </div>
    </form>
  );
}
