"use client";
import { leaveTo } from "@/components/camp/leave";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { cedisToPesewas, feeFor, formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import { Busy } from "@/components/camp/brand";
import { ErrorText, Field, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { payAction } from "../actions";

/** Any amount up to the balance. Shows the fee before sending the attendee to Paystack. */
export function PayForm({ slug, balance, feeBps, dueOn }: { slug: string; balance: number; feeBps: number; dueOn: string }) {
  const [amount, setAmount] = useState(pesewasToCedisInput(balance));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  let pesewas: number | null = null;
  try {
    pesewas = cedisToPesewas(amount);
  } catch {
    // shown as no total until it parses
  }
  const valid = pesewas !== null && pesewas >= 100 && pesewas <= balance;
  const fee = valid ? feeFor(pesewas!, feeBps) : 0;

  // Quick picks: half, the rest. Only offered when they make sense.
  const half = Math.round(balance / 2 / 100) * 100;
  const quick = [
    ...(half >= 100 && half < balance ? [{ label: "Half", value: half }] : []),
    { label: "All of it", value: balance },
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await payAction(slug, amount);
      if (!result.ok) return setError(result.error);
      await leaveTo(result.data.url);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <Field label="How much?" hint={`Up to ${formatCedis(balance)}, by ${dueOn}`}>
        <span className="flex h-12 items-center gap-2 rounded-[6px] border border-stone-muted bg-white px-3.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-cyan-signal">
          <span className="text-warm-gray">GHS</span>
          <input
            required
            inputMode="decimal"
            className="h-full min-w-0 flex-1 bg-transparent text-lg tabular-nums outline-none"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </span>
      </Field>
      <div className="flex gap-2">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setAmount(pesewasToCedisInput(q.value))}
            className={cn(
              "cm-press h-10 flex-1 rounded-full border text-sm",
              pesewas === q.value ? "border-soot bg-soot text-white" : "border-stone-border bg-white",
            )}
          >
            {q.label} · {formatCedis(q.value)}
          </button>
        ))}
      </div>
      <dl className="flex flex-col gap-1.5 rounded-[10px] bg-stone-canvas p-4 text-sm tabular-nums">
        <div className="flex justify-between">
          <dt className="text-warm-gray">Payment</dt>
          <dd>{valid ? formatCedis(pesewas!) : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-warm-gray">Paystack fee</dt>
          <dd>{valid ? formatCedis(fee) : "—"}</dd>
        </div>
        <div className="flex justify-between border-t border-stone-border pt-1.5 font-medium">
          <dt>You pay</dt>
          <dd>{valid ? formatCedis(pesewas! + fee) : "—"}</dd>
        </div>
      </dl>
      {!valid && <p className="text-[13px] text-warm-gray">Enter an amount from GHS 1.00 to {formatCedis(balance)}.</p>}
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending || !valid} aria-busy={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
        <Busy pending={pending} text="Opening Paystack…">{valid ? `Pay ${formatCedis(pesewas! + fee)}` : "Pay"}</Busy>
      </button>
      <p className="flex items-center justify-center gap-1.5 text-[13px] text-warm-gray">
        <Lock className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" /> MoMo or card · secured by Paystack
      </p>
    </form>
  );
}
