"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { ErrorText, inputClass } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { formatCedis } from "@/lib/camp/money";
import { cn } from "@/lib/utils";
import { deleteMyDetailsAction } from "../actions";

const REASONS = ["I can't come any more", "I registered by mistake", "I don't want my details kept", "Something else"];
const WORD = "DELETE";

/**
 * Removing someone completely, in three deliberate steps so it never happens
 * by accident: why (required), what they'll lose (first confirmation), then
 * typing DELETE (second confirmation). Esc or "Keep" backs out at any step.
 */
export function DeleteMe({ slug, cancelled, paid, startOpen = false }: { slug: string; cancelled: boolean; paid: number; startOpen?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [step, setStep] = useState<"closed" | "why" | "sure" | "type">(startOpen ? "why" : "closed");
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();

  const why = reason === "Something else" ? other.trim() : reason;
  const close = () => {
    setStep("closed");
    setTyped("");
    setError("");
  };

  if (step === "closed") {
    return (
      <button type="button" onClick={() => setStep("why")} className="cm-press inline-flex h-12 items-center gap-2 self-start rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
        <Trash2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> {cancelled ? "Delete my details" : "Remove me completely"}
      </button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      className="cm-pop flex flex-col gap-4 rounded-[14px] border-2 border-soot bg-white p-4 sm:p-5"
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <p className="flex items-center gap-2 text-[13px] font-medium text-warm-gray">
        Step {step === "why" ? 1 : step === "sure" ? 2 : 3} of 3
      </p>

      {step === "why" && (
        <>
          <h3 id={`${id}-title`} className="text-[17px] font-semibold">
            Why are you leaving?
          </h3>
          <div role="radiogroup" aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
            {REASONS.map((r) => (
              <label
                key={r}
                className={cn(
                  "cm-press flex min-h-12 cursor-pointer items-center gap-3 rounded-[12px] px-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal",
                  reason === r ? "border-2 border-soot" : "border border-stone-border",
                )}
              >
                <input type="radio" name={`${id}-reason`} checked={reason === r} onChange={() => setReason(r)} className="h-5 w-5 flex-none accent-soot" />
                <span className="text-[15px]">{r}</span>
              </label>
            ))}
          </div>
          {reason === "Something else" && (
            <textarea
              rows={2}
              autoFocus
              aria-label="Tell us why"
              placeholder="Tell us why, in a few words"
              className={`${inputClass} h-auto py-2.5 leading-relaxed`}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              maxLength={300}
            />
          )}
          <Buttons
            next={{ label: "Continue", disabled: why.length < 3, onClick: () => setStep("sure") }}
            back={{ label: "Keep my registration", onClick: close }}
          />
        </>
      )}

      {step === "sure" && (
        <>
          <h3 id={`${id}-title`} className="flex items-center gap-2 text-[17px] font-semibold">
            <AlertTriangle className="h-5 w-5 flex-none" strokeWidth={1.8} aria-hidden="true" /> This removes everything about you
          </h3>
          <ul className="flex flex-col gap-1.5 pl-5 text-[15px] leading-relaxed [&_li]:list-disc">
            {!cancelled && <li>You lose your place at camp and your roommate group.</li>}
            <li>Your name, phone, email and health notes are deleted.</li>
            <li>Your sign-in code stops working.</li>
            {!cancelled && paid > 0 && <li>We ask a coordinator to refund your {formatCedis(paid)}.</li>}
            <li>This can&apos;t be undone.</li>
          </ul>
          <Buttons next={{ label: "Yes, continue", onClick: () => setStep("type") }} back={{ label: "No, keep my registration", onClick: close }} />
        </>
      )}

      {step === "type" && (
        <>
          <h3 id={`${id}-title`} className="text-[17px] font-semibold">
            Last step: type {WORD} to confirm
          </h3>
          <input
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-label={`Type ${WORD} to confirm`}
            className={`${inputClass} font-mono tracking-[0.12em]`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <ErrorText>{error}</ErrorText>
          <Buttons
            danger
            pending={pending}
            next={{
              label: "Delete everything",
              disabled: typed.trim().toUpperCase() !== WORD,
              onClick: () =>
                start(async () => {
                  setError("");
                  const r = await deleteMyDetailsAction(slug, why);
                  if (!r.ok) return setError(r.error);
                  router.replace(`/camps/${slug}`);
                }),
            }}
            back={{ label: "No, keep my registration", onClick: close }}
          />
        </>
      )}
    </div>
  );
}

function Buttons({
  next,
  back,
  danger,
  pending,
}: {
  next: { label: string; onClick: () => void; disabled?: boolean };
  back: { label: string; onClick: () => void };
  danger?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={next.disabled || pending}
        aria-busy={pending}
        onClick={next.onClick}
        className={cn("cm-press h-12 w-full rounded-full px-4 text-[15px] font-medium text-white disabled:opacity-40", danger ? "bg-ink-black" : "bg-soot")}
      >
        <Busy pending={!!pending} text="Deleting…">
          {next.label}
        </Busy>
      </button>
      {/* The safe choice is the easy one: full width, always there. */}
      <button type="button" onClick={back.onClick} className="cm-press h-12 w-full rounded-full border border-stone-border bg-white px-4 text-[15px] font-medium">
        {back.label}
      </button>
    </div>
  );
}
