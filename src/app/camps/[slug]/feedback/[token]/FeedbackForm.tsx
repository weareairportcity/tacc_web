"use client";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { submitFeedbackAction } from "../../actions";

const RATINGS = ["Poor", "Okay", "Good", "Great", "Excellent"] as const;

export function FeedbackForm({ slug, token }: { slug: string; token: string }) {
  const [rating, setRating] = useState(0);
  const [best, setBest] = useState("");
  const [change, setChange] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p role="status" className="cm-rise text-[17px]">
        Thank you. Your answers help us plan the next camp.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!rating) return setError("Choose how camp was, from 1 to 5.");
        start(async () => {
          setError("");
          const r = await submitFeedbackAction(slug, token, { rating, best, change });
          if (!r.ok) return setError(r.error);
          setDone(true);
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Overall, camp was…</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {RATINGS.map((word, i) => {
            const n = i + 1;
            const on = rating === n;
            return (
              <label
                key={word}
                className={cn(
                  "cm-press flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] border text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-cyan-signal",
                  on ? "border-soot bg-soot text-white" : "border-stone-border bg-white",
                )}
              >
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={on}
                  onChange={() => {
                    setRating(n);
                    setError("");
                  }}
                  className="sr-only"
                />
                <span className="font-display text-[22px] leading-none tabular-nums">{n}</span>
                <span className={cn("text-[11px] sm:text-xs", on ? "text-stone-muted" : "text-warm-gray")}>{word}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Field label="What was the best part? (optional)">
        <textarea value={best} onChange={(e) => setBest(e.target.value)} maxLength={1000} rows={3} className={`${inputClass} h-auto py-2.5 sm:h-auto`} />
      </Field>
      <Field label="What should we change next time? (optional)">
        <textarea value={change} onChange={(e) => setChange(e.target.value)} maxLength={1000} rows={3} className={`${inputClass} h-auto py-2.5 sm:h-auto`} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
        <Busy pending={pending} text="Sending…">Send</Busy>
      </button>
      <p className="flex items-center justify-center gap-1.5 text-[13px] text-warm-gray">
        <Lock className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" /> Your answers are saved without your name.
      </p>
    </form>
  );
}
