"use client";
import { leaveTo } from "@/components/camp/leave";

import { useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { Lock } from "lucide-react";
import { cedisToPesewas, feeFor, formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import { Busy } from "@/components/camp/brand";
import { ErrorText, Field, primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { payAction } from "../actions";

/**
 * Pay all (the one big button), or "Pay part now" for an amount box. Most people never see
 * the box. The fee is shown before anyone is sent to Paystack.
 */
export function PayForm({ slug, balance, feeBps, dueOn }: { slug: string; balance: number; feeBps: number; dueOn: string }) {
  const [part, setPart] = useState(false);
  const [amount, setAmount] = useState(pesewasToCedisInput(Math.round(balance / 2 / 100) * 100 || balance));
  const [error, setError] = useState("");
  const [pending, startTransition] = useOneAtATime();

  let pesewas: number | null = null;
  try {
    pesewas = part ? cedisToPesewas(amount) : balance;
  } catch {
    // shown as no total until it parses
  }
  const valid = pesewas !== null && pesewas >= 100 && pesewas <= balance;
  const fee = valid ? feeFor(pesewas!, feeBps) : 0;
  const allFee = feeFor(balance, feeBps);

  // Quick picks for part: half, or all of it after all.
  const half = Math.round(balance / 2 / 100) * 100;
  const quick = [
    ...(half >= 100 && half < balance ? [{ label: "Half", value: half }] : []),
    { label: "All of it", value: balance },
  ];

  const pay = (value: string) =>
    startTransition(async () => {
      setError("");
      const result = await payAction(slug, value);
      if (!result.ok) return setError(result.error);
      await leaveTo(result.data.url);
    });

  if (!part) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" disabled={pending} aria-busy={pending} onClick={() => pay(pesewasToCedisInput(balance))} className={`${primaryButtonClass} h-14 w-full text-[17px]`}>
          <Busy pending={pending} text="Opening Paystack…">Pay all {formatCedis(balance)}</Busy>
        </button>
        <p className="text-center text-[13px] text-warm-gray">
          {allFee > 0 ? `Plus ${formatCedis(allFee)} Paystack fee: ${formatCedis(balance + allFee)} in total. ` : ""}MoMo or card.
        </p>
        <ErrorText>{error}</ErrorText>
        {balance >= 200 && (
          <button type="button" disabled={pending} onClick={() => setPart(true)} className={`${secondaryButtonClass} h-12 w-full text-[15px]`}>
            Pay part now, the rest later
          </button>
        )}
        <p className="flex items-center justify-center gap-1.5 text-[13px] text-warm-gray">
          <Lock className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" /> Secured by Paystack
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        pay(amount);
      }}
      className="flex flex-col gap-3.5"
    >
      <Field label="How much now?" hint={`Up to ${formatCedis(balance)}. Pay the rest by ${dueOn}.`}>
        <span className="flex h-12 items-center gap-2 rounded-[6px] border border-stone-muted bg-white px-3.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-cyan-signal">
          <span className="text-warm-gray">GHS</span>
          <input
            required
            autoFocus
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
          <dt>You pay now</dt>
          <dd>{valid ? formatCedis(pesewas! + fee) : "—"}</dd>
        </div>
      </dl>
      {!valid && <p className="text-[13px] text-warm-gray">Enter an amount from GHS 1.00 to {formatCedis(balance)}.</p>}
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending || !valid} aria-busy={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
        <Busy pending={pending} text="Opening Paystack…">{valid ? `Pay ${formatCedis(pesewas! + fee)}` : "Pay"}</Busy>
      </button>
      <button type="button" disabled={pending} onClick={() => setPart(false)} className="self-center text-[14px] text-warm-gray underline underline-offset-[3px]">
        Pay all instead
      </button>
      <p className="flex items-center justify-center gap-1.5 text-[13px] text-warm-gray">
        <Lock className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" /> MoMo or card · secured by Paystack
      </p>
    </form>
  );
}
