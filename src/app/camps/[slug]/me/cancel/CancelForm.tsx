"use client";

import { Busy } from "@/components/camp/brand";
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
      <section role="status" className="flex flex-col gap-2 rounded-2xl border border-stone-border bg-white p-5 shadow-seline-card">
        <p className="flex items-center gap-2.5 text-[17px] font-semibold">
          <Clock className="h-5 w-5 flex-none" strokeWidth={1.7} aria-hidden="true" /> Waiting for a coordinator
        </p>
        <p className="text-[15px] leading-relaxed text-warm-gray">You asked for {formatCedis(waiting.amount)} back. We&apos;ll text you the answer.</p>
        <span className="self-start">
          <WithdrawRequest slug={slug} requestId={waiting.id} />
        </span>
      </section>
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
    ...(!cancelled ? ([["cancel", "I can't come", paid > 0 ? `Cancel my place and ask for my ${formatCedis(paid)} back.` : "Cancel my place."]] as [Choice, string, string][]) : []),
    ...(paid > 0
      ? ([[ "part", cancelled ? "Ask for money back" : "I'm still coming", cancelled ? `You paid ${formatCedis(paid)}. Say how much you'd like back.` : "Ask for part of my money back."]] as [Choice, string, string][])
      : []),
    ...(!cancelled ? ([["delete", "Remove me completely", "Cancel my place and delete my details."]] as [Choice, string, string][]) : []),
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
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-xl tracking-[-0.017em]" id="what">
        What would you like to do?
      </h2>
      <div role="radiogroup" aria-labelledby="what" className="flex flex-col gap-2.5">
        {options.map(([v, label, sub]) => (
          <label
            key={v}
            className={cn(
              "cm-press flex min-h-[72px] cursor-pointer items-center gap-3.5 rounded-2xl bg-white px-4 py-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal",
              choice === v ? "border-2 border-soot" : "border border-stone-border",
            )}
          >
            <input type="radio" name="what" checked={choice === v} onChange={() => { setChoice(v); setConfirm(false); }} className="h-5 w-5 flex-none accent-soot" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[17px] font-medium">{label}</span>
              {sub && <span className="text-sm leading-normal text-warm-gray">{sub}</span>}
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
      <Field label={choice === "part" ? "Tell us why" : "Tell us why (you can skip this)"}>
        <textarea rows={3} className={`${inputClass} h-auto py-2.5 leading-relaxed`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
      <ErrorText>{error}</ErrorText>
      {choice !== "part" && confirm ? (
        <div role="alertdialog" aria-label="Confirm" className="cm-pop flex flex-col gap-3 rounded-[12px] border-2 border-soot p-4">
          <p className="text-[17px] font-semibold">{choice === "delete" ? "Remove everything about you?" : "Cancel your place at camp?"}</p>
          <p className="text-sm leading-relaxed">
            {choice === "delete"
              ? "You'll lose your place and your roommate group, and your details are deleted. This can't be undone."
              : `You'll lose your place and your roommate group.${paid > 0 ? " Your refund request goes to a coordinator." : ""}`}
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" disabled={pending} onClick={submit} className="cm-press h-12 w-full rounded-full bg-soot px-4 text-[15px] font-medium text-white">
              <Busy pending={pending} text="Cancelling…">{choice === "delete" ? "Yes, remove me" : "Yes, cancel my place"}</Busy>
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="cm-press h-12 w-full rounded-full border border-stone-border bg-white px-4 text-[15px] font-medium">
              No, keep my place
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
          <Busy pending={pending} text="Sending…">{choice === "part" ? "Ask for money back" : choice === "delete" ? "Remove me" : "Cancel my place"}</Busy>
        </button>
      )}
    </section>
  );
}
