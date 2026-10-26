"use client";

import { useState, useTransition } from "react";
import { CreditCard, Lock, Smartphone } from "lucide-react";
import { cedisToPesewas, feeFor, formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { payViaLinkAction } from "../../actions";

export function PayForSomeone({ slug, token, balance, feeBps }: { slug: string; token: string; balance: number; feeBps: number }) {
  const [amount, setAmount] = useState(pesewasToCedisInput(balance));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  let pesewas: number | null = null;
  try {
    pesewas = cedisToPesewas(amount);
  } catch {}
  const valid = pesewas !== null && pesewas >= 100 && pesewas <= balance;
  const fee = valid ? feeFor(pesewas!, feeBps) : 0;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError("");
          const r = await payViaLinkAction(slug, token, amount, name, email);
          if (!r.ok) return setError(r.error);
          window.location.assign(r.data);
        });
      }}
    >
      <Field label="How much?" hint={valid ? `+ ${formatCedis(fee)} Paystack fee` : `Up to ${formatCedis(balance)}`}>
        <span className="relative flex">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-warm-gray">GHS</span>
          <input required inputMode="decimal" className={`${inputClass} pl-12 text-lg tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </span>
      </Field>
      <Field label="Your name (optional)">
        <input autoComplete="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Your email">
        <input required type="email" autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending || !valid} aria-busy={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
        {pending ? "Opening Paystack…" : valid ? `Pay ${formatCedis(pesewas! + fee)}` : "Enter an amount"}
      </button>
      <p className="flex justify-center gap-3 text-[13px] text-warm-gray">
        <span className="flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />Mobile money</span>
        <span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />Card</span>
        <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />Paystack</span>
      </p>
    </form>
  );
}
