"use client";
import { leaveTo } from "@/components/camp/leave";

import { Busy } from "@/components/camp/brand";
import { HowToPayPicker, PaidThrough, useHowToPay, type Fees } from "@/components/camp/HowToPay";
import { useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { Lock } from "lucide-react";
import { cedisToPesewas, feeFor, formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { payViaLinkAction } from "../../actions";

export function PayForSomeone({ slug, token, balance, fees, momoDirect }: { slug: string; token: string; balance: number; fees: Fees; momoDirect: boolean }) {
  // Their own MoMo number, not the attendee's, so nothing is filled in.
  const how = useHowToPay(fees, momoDirect);
  const feeBps = how.rate;
  const [amount, setAmount] = useState(pesewasToCedisInput(balance));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
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
          if (!how.ready) return setError(how.problem || "Check how you're paying.");
          const r = await payViaLinkAction(slug, token, amount, name, email, how.how);
          if (!r.ok) return setError(r.error);
          await leaveTo(r.data);
        });
      }}
    >
      <HowToPayPicker state={how} disabled={pending} />
      <Field label="How much?" hint={valid ? `+ ${formatCedis(fee)} fee` : `Up to ${formatCedis(balance)}`}>
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
        <Busy pending={pending} text={how.method === "momo" ? "Sending the prompt…" : "Opening expressPay…"}>{valid ? `Pay ${formatCedis(pesewas! + fee)}` : "Enter an amount"}</Busy>
      </button>
      <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-warm-gray">
        <Lock className="h-3.5 w-3.5 flex-none" strokeWidth={1.6} aria-hidden="true" />
        <PaidThrough state={how} />
      </p>
    </form>
  );
}
