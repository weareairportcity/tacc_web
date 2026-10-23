"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cedisToPesewas, feeFor, formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import { ErrorText, Field, buttonClass, inputClass } from "@/components/camp/ui";
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await payAction(slug, amount);
      if (!result.ok) return setError(result.error);
      window.location.assign(result.data.url);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={`Amount in GHS (up to ${formatCedis(balance)})`}>
        <input
          required
          inputMode="decimal"
          className={inputClass}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      {valid ? (
        <p className="text-sm text-slate-600">
          {formatCedis(pesewas!)} + {formatCedis(fee)} Paystack fee ={" "}
          <span className="font-semibold text-slate-900">{formatCedis(pesewas! + fee)}</span>
        </p>
      ) : (
        <p className="text-sm text-slate-500">Enter an amount from GHS 1.00 to {formatCedis(balance)}.</p>
      )}
      <p className="text-sm text-slate-500">Pay in parts if you like. The full amount is due by {dueOn}.</p>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending || !valid} className={`${buttonClass} w-full py-3 text-base`}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Pay with Paystack
      </button>
    </form>
  );
}
