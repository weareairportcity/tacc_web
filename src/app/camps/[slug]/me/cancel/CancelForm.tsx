"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { askRefundAction, cancelMineAction } from "../../actions";
import { WithdrawRequest } from "../MeControls";

type Choice = "cancel" | "part" | "delete";

export function CancelForm({ slug, paid, cancelled, waiting }: { slug: string; paid: number; cancelled: boolean; waiting: { id: string; amount: number } | null }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>(cancelled ? "part" : "cancel");
  const [amount, setAmount] = useState(pesewasToCedisInput(paid));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (waiting) {
    return (
      <p role="status" className="flex items-center gap-3 rounded-[10px] border border-stone-border bg-white px-4 py-3 text-[15px]">
        <Clock className="h-4 w-4 flex-none" strokeWidth={1.7} aria-hidden="true" />
        <span className="flex-1">Refund of {formatCedis(waiting.amount)} asked. We&apos;ll text you.</span>
        <WithdrawRequest slug={slug} requestId={waiting.id} />
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="cm-rise flex items-center gap-2.5 rounded-[10px] border border-stone-border bg-white px-4 py-3.5 text-[15px]">
        <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" /> {done}
      </p>
    );
  }

  const options: [Choice, string, string][] = [
    ...(!cancelled ? ([["cancel", "Cancel and ask for a refund", paid > 0 ? `You've paid ${formatCedis(paid)}` : "Nothing to refund"]] as [Choice, string, string][]) : []),
    ...(paid > 0 ? ([["part", cancelled ? "Ask for a refund" : "I'm still coming, refund part of it", ""]] as [Choice, string, string][]) : []),
    ...(!cancelled ? ([["delete", "Cancel and delete my details", ""]] as [Choice, string, string][]) : []),
  ];

  const submit = () =>
    start(async () => {
      setError("");
      if (choice === "part") {
        const r = await askRefundAction(slug, amount, reason);
        if (!r.ok) return setError(r.error);
        setDone("Sent. We'll text you.");
        return router.refresh();
      }
      const r = await cancelMineAction(slug, reason, choice === "delete");
      if (!r.ok) {
        setConfirm(false);
        return setError(r.error);
      }
      if (choice === "delete") return router.replace(`/camps/${slug}`);
      setDone(r.data.refundRequested ? "Cancelled. Your refund request is with the coordinators." : "Cancelled.");
      router.refresh();
    });

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-seline-hero">
      <div role="radiogroup" aria-label="What would you like?" className="flex flex-col gap-2">
        {options.map(([v, label, sub]) => (
          <label key={v} className={cn("flex cursor-pointer gap-3 rounded-[10px] px-4 py-3.5", choice === v ? "border-2 border-soot bg-stone-canvas" : "border border-stone-border")}>
            <input type="radio" name="what" checked={choice === v} onChange={() => { setChoice(v); setConfirm(false); }} className="mt-0.5 h-[18px] w-[18px] accent-soot" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-medium">{label}</span>
              {sub && <span className="text-[13px] text-warm-gray">{sub}</span>}
            </span>
          </label>
        ))}
      </div>
      {choice === "part" && (
        <Field label="How much back?" hint={`Up to ${formatCedis(paid)}`}>
          <span className="relative flex">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-warm-gray">GHS</span>
            <input inputMode="decimal" className={`${inputClass} pl-12 text-base tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </span>
        </Field>
      )}
      <Field label={choice === "part" ? "Why?" : "Why? (optional)"}>
        <textarea rows={3} className={`${inputClass} h-auto py-2.5 leading-relaxed`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
      <ErrorText>{error}</ErrorText>
      {choice !== "part" && confirm ? (
        <div role="alertdialog" aria-label="Confirm" className="cm-pop flex flex-col gap-3 rounded-[12px] border-2 border-soot p-4">
          <p className="text-[15px] font-semibold">{choice === "delete" ? "Cancel and delete your details? This can't be undone." : "Cancel your registration?"}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirm(false)} className="cm-press h-12 rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
              Keep my place
            </button>
            <button type="button" disabled={pending} onClick={submit} className="cm-press h-12 flex-1 rounded-full bg-soot px-4 text-sm font-medium text-white">
              {pending ? "Cancelling…" : "Yes, cancel"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => (choice === "part" ? submit() : setConfirm(true))}
          className={choice === "part" ? `${primaryButtonClass} h-[52px] w-full` : "cm-press h-[52px] w-full rounded-full bg-soot text-base font-medium text-white"}
        >
          {pending ? "Sending…" : choice === "part" ? "Ask for a refund" : "Cancel my registration"}
        </button>
      )}
    </section>
  );
}
