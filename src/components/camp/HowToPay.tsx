"use client";

import { useId, useState } from "react";
import { CreditCard, Smartphone } from "lucide-react";
import { MOMO_NETWORKS, guessNetwork, momoNumber, rateFor, type MomoNetwork, type PayMethod } from "@/lib/camp/money";
import type { HowToPay } from "@/lib/camp/payments";
import { inputClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";

export type Fees = { fee_bps: number; momo_fee_bps: number };

/**
 * How someone pays, and the fee rate that goes with it. Only when expressPay's
 * Direct API is on (`direct`) is there a choice: MoMo is then charged from
 * Commune with its own fee, so we know the method before charging. Otherwise
 * everyone goes to expressPay's page, where they pick MoMo or card, at one rate.
 */
export function useHowToPay(fees: Fees, direct: boolean, phone = "") {
  const [method, setMethod] = useState<PayMethod>(direct ? "momo" : "card");
  const [number, setNumber] = useState(phone ? toLocal(phone) : "");
  const [network, setNetwork] = useState<MomoNetwork | null>(guessNetwork(phone));
  const momo = direct && method === "momo";
  const validNumber = momoNumber(number) !== null;
  const how: HowToPay = momo ? { method: "momo", number, network: network ?? "mtn" } : { method: "card" };
  return {
    direct,
    method: momo ? ("momo" as const) : ("card" as const),
    setMethod,
    number,
    setNumber: (value: string) => {
      setNumber(value);
      // Follow the number's range until they pick a network themselves.
      const guess = guessNetwork(value);
      if (guess) setNetwork(guess);
    },
    network,
    setNetwork,
    how,
    rate: rateFor(momo ? "momo" : "card", fees, direct),
    /** Ready to pay: card always; MoMo needs a Ghana number and a network. */
    ready: !momo || (validNumber && network !== null),
    problem: momo && number.trim() && !validNumber ? "Enter a Ghana MoMo number, like 024 123 4567." : momo && !network ? "Pick the network." : "",
  };
}

export type HowToPayState = ReturnType<typeof useHowToPay>;

/** 233244123456 → "024 412 3456". */
function toLocal(phone: string) {
  const n = momoNumber(phone);
  return n ? `0${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8)}` : phone;
}

const pill =
  "cm-press flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full text-sm has-[:checked]:bg-soot has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal";

/** The MoMo / Card choice and, for MoMo, the number and network. Renders nothing when there's no choice. */
export function HowToPayPicker({ state, disabled }: { state: HowToPayState; disabled?: boolean }) {
  const id = useId();
  if (!state.direct) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id={`${id}-how`}>
          Pay with
        </span>
        <div role="radiogroup" aria-labelledby={`${id}-how`} className="grid grid-cols-2 gap-1 rounded-full border border-stone-border bg-stone-canvas p-1">
          {(
            [
              ["momo", "Mobile money", Smartphone],
              ["card", "Card", CreditCard],
            ] as const
          ).map(([value, label, Icon]) => (
            <label key={value} className={pill}>
              <input type="radio" name={`${id}-method`} value={value} checked={state.method === value} disabled={disabled} onChange={() => state.setMethod(value)} className="sr-only" />
              <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {state.method === "momo" && (
        <div className="cm-rise flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">MoMo number</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="024 123 4567"
              disabled={disabled}
              className={`${inputClass} tabular-nums`}
              value={state.number}
              onChange={(e) => state.setNumber(e.target.value)}
              aria-describedby={`${id}-momo-hint`}
            />
            <span id={`${id}-momo-hint`} className="text-[13px] text-warm-gray">
              The approval prompt comes to this phone.
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" id={`${id}-net`}>
              Network
            </span>
            <div role="radiogroup" aria-labelledby={`${id}-net`} className="grid grid-cols-3 gap-1.5">
              {MOMO_NETWORKS.map((n) => (
                <label key={n.id} className={cn(pill, "border border-stone-border bg-white has-[:checked]:border-soot")}>
                  <input type="radio" name={`${id}-network`} value={n.id} checked={state.network === n.id} disabled={disabled} onChange={() => state.setNetwork(n.id)} className="sr-only" />
                  {n.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Mobile money or card" under the button, naming who takes the payment. */
export function PaidThrough({ state }: { state: HowToPayState }) {
  return (
    <span>
      {!state.direct ? "MoMo or card, on expressPay's secure page" : state.method === "momo" ? "Approve the prompt on your phone" : "Visa or Mastercard, on expressPay's secure page"}
    </span>
  );
}
