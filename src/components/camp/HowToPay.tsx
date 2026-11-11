"use client";

import { useId, useState } from "react";
import { CreditCard, Smartphone } from "lucide-react";
import { rateFor, type PayMethod } from "@/lib/camp/money";

export type Fees = { fee_bps: number; momo_fee_bps: number };

/**
 * MoMo or card, asked before going to expressPay, because the two cost
 * different fees and the payer covers the fee. expressPay's page still offers
 * both; the hint asks them to pick the same there.
 */
export function useHowToPay(fees: Fees) {
  const [method, setMethod] = useState<PayMethod>("momo");
  return { method, setMethod, rate: rateFor(method, fees) };
}

export type HowToPayState = ReturnType<typeof useHowToPay>;

const pill =
  "cm-press flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full text-sm has-[:checked]:bg-soot has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal";

const WAYS = [
  ["momo", "Mobile money", Smartphone],
  ["card", "Card", CreditCard],
] as const;

/** The Mobile money / Card choice. */
export function HowToPayPicker({ state, disabled }: { state: HowToPayState; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" id={`${id}-how`}>
        Pay with
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-how`} aria-describedby={`${id}-hint`} className="grid grid-cols-2 gap-1 rounded-full border border-stone-border bg-stone-canvas p-1">
        {WAYS.map(([value, label, Icon]) => (
          <label key={value} className={pill}>
            <input type="radio" name={`${id}-method`} value={value} checked={state.method === value} disabled={disabled} onChange={() => state.setMethod(value)} className="sr-only" />
            <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
            {label}
          </label>
        ))}
      </div>
      <span id={`${id}-hint`} className="text-[13px] text-warm-gray">
        Choose {state.method === "momo" ? "Mobile money" : "Card"} again on expressPay&apos;s page.
      </span>
    </div>
  );
}

/** Who takes the payment, for the line under the button. */
export function PaidThrough({ state }: { state: HowToPayState }) {
  return <span>{state.method === "momo" ? "MoMo" : "Visa or Mastercard"} on expressPay&apos;s secure page</span>;
}
