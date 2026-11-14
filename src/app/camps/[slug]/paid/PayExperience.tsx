"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { Sheet } from "@/components/camp/sheet";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { ErrorText, Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { ratePayExperienceAction } from "../actions";

const LABELS = ["Poor", "Okay", "Good", "Great", "Excellent"] as const;
const SKIP_KEY = (slug: string) => `camp-pay-xp:${slug}`;

/**
 * After a full payment lands, ask how checkout went. 1–2 stars open an
 * optional comment. Skip is always allowed; we don't ask again this session.
 */
export function PayExperience({ slug, rated }: { slug: string; rated: boolean }) {
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(rated);
  const [pending, start] = useOneAtATime();

  useEffect(() => {
    if (done) return;
    try {
      if (sessionStorage.getItem(SKIP_KEY(slug))) return;
    } catch {
      // private mode
    }
    const timer = setTimeout(() => setOpen(true), 1400);
    return () => clearTimeout(timer);
  }, [done, slug]);

  const skip = () => {
    try {
      sessionStorage.setItem(SKIP_KEY(slug), "1");
    } catch {
      // private mode
    }
    setDone(true);
    setOpen(false);
  };

  const send = () => {
    if (!stars) return setError("Choose 1 to 5 stars.");
    start(async () => {
      setError("");
      const r = await ratePayExperienceAction(slug, stars, comment);
      if (!r.ok) return setError(r.error);
      setDone(true);
      setOpen(false);
    });
  };

  return (
    <Sheet
      open={open}
      onClose={skip}
      title="Rate your experience"
      subtitle="How did paying go? It takes a second."
      footer={
        <>
          <button type="button" onClick={skip} className={`${secondaryButtonClass} h-12 flex-1`}>
            Not now
          </button>
          <button type="button" onClick={send} disabled={pending || !stars} aria-busy={pending} className={`${primaryButtonClass} h-12 flex-[1.4]`}>
            <Busy pending={pending} text="Sending…">
              Send
            </Busy>
          </button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Tap a star</legend>
        <div className="flex justify-between gap-1" role="radiogroup" aria-label="Rating from 1 to 5 stars">
          {LABELS.map((word, i) => {
            const n = i + 1;
            const on = stars >= n;
            return (
              <button
                key={word}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} ${n === 1 ? "star" : "stars"}, ${word}`}
                onClick={() => {
                  setStars(n);
                  setError("");
                }}
                className="cm-press flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-[12px] border border-transparent hover:bg-stone-canvas"
              >
                <Star
                  className={cn("h-8 w-8", on ? "fill-[#f5c518] text-[#f5c518]" : "text-stone-muted")}
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                <span className={cn("text-[11px]", stars === n ? "font-medium text-ink-black" : "text-warm-gray")}>{word}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {stars > 0 && stars <= 2 && (
        <Field label="What went wrong? (optional)" hint="Only if you want to tell us. Skip is fine.">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="The page was slow, MoMo didn't prompt…"
            className={`${inputClass} h-auto py-2.5 sm:h-auto`}
          />
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
