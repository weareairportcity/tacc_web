"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, MessageCircle, Phone, ShieldCheck, Wallet } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import { CommuneLoader } from "@/components/camp/brand";
import { headlineClass, primaryButtonClass, secondaryButtonClass, titleClass } from "@/components/camp/ui";
import { checkPaymentAction, type PaymentCheck } from "../actions";

const POLL_MS = 4000;
const GIVE_UP_MS = 2 * 60 * 1000;

export function Processing({ slug, reference }: { slug: string; reference: string }) {
  const [check, setCheck] = useState<PaymentCheck | null>(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      const result = await checkPaymentAction(slug, reference).catch(() => null);
      if (stopped) return;
      if (result?.ok && result.data.status !== "pending") return setCheck(result.data);
      if (Date.now() - started > GIVE_UP_MS) return setWaitedTooLong(true);
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [slug, reference]);

  if (check?.status === "success") return <Success slug={slug} reference={reference} check={check} />;
  if (check?.status === "failed") return <Failed slug={slug} reference={reference} check={check} />;

  return (
    <div role="status" aria-live="polite" className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <CommuneLoader label={null} />
      <h1 className={`${titleClass} text-[26px]`}>Checking your payment</h1>
      <p className="max-w-xs text-[15px] leading-relaxed text-warm-gray">
        {waitedTooLong
          ? "Still processing. Mobile money can take a while. You can close this page: your balance updates by itself once Paystack confirms."
          : "Waiting for Paystack to confirm. If you paid by MoMo, approve the prompt on your phone."}
      </p>
      <Link href={`/camps/${slug}/me`} className={`${secondaryButtonClass} h-12 px-6`}>
        Back to your registration
      </Link>
    </div>
  );
}

const SPARKS = [
  ["#3ba6f1", -46, -30],
  ["#1c1917", 48, -24],
  ["#a8a29e", -40, 38],
  ["#3ba6f1", 44, 40],
  ["#1c1917", 0, -54],
  ["#3ba6f1", -6, 56],
] as const;

function Success({ slug, reference, check }: { slug: string; reference: string; check: PaymentCheck }) {
  const full = check.paid >= check.price;
  return (
    <div className="flex flex-col gap-8 pt-8">
      <section role="status" className="flex flex-col items-center gap-4 text-center">
        <div className="relative h-[88px] w-[88px]">
          <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
            <circle className="cm-ring" pathLength={1} cx="44" cy="44" r="36" fill="none" stroke="#1c1917" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 44 44)" />
            <path className="cm-tick" pathLength={1} d="M30 45l9.5 9.5L59 35" fill="none" stroke="#3ba6f1" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {full &&
            SPARKS.map(([color, dx, dy], i) => (
              <span key={i} className="cm-spark" style={{ background: color, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` }} />
            ))}
        </div>
        <h1 className={`cm-rise ${headlineClass}`} style={{ animationDelay: "700ms" }}>
          {full ? (
            <>
              You&apos;re <span className="text-cyan-edge">fully paid</span>
            </>
          ) : (
            <>
              Payment <span className="text-cyan-edge">received</span>
            </>
          )}
        </h1>
        <p className="cm-rise max-w-[300px] text-[15px] leading-relaxed text-warm-gray" style={{ animationDelay: "800ms" }}>
          We received <span className="font-medium text-ink-black">{formatCedis(check.amount)}</span>.{" "}
          {full ? "Your place is secure." : `${formatCedis(check.price - check.paid)} left to pay.`}
        </p>
      </section>

      <section className="cm-rise flex flex-col gap-3.5 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card" style={{ animationDelay: "900ms" }}>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-border" role="img" aria-label={`${formatCedis(check.paid)} of ${formatCedis(check.price)} paid`}>
          <div className="cm-grow h-full rounded-full bg-soot" style={{ width: `${Math.min(100, Math.round((check.paid / check.price) * 100))}%`, animationDelay: "1100ms" }} />
        </div>
        <dl className="flex flex-col gap-2 text-sm tabular-nums">
          <div className="flex justify-between gap-3">
            <dt className="text-warm-gray">This payment</dt>
            <dd>
              {formatCedis(check.amount)} + {formatCedis(check.fee)} fee
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-warm-gray">Paid in total</dt>
            <dd>
              {formatCedis(check.paid)} of {formatCedis(check.price)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-warm-gray">Reference</dt>
            <dd className="font-mono text-xs">{reference}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-col gap-3">
        {full ? (
          <>
            <Link href={`/camps/${slug}/roommates`} className={`${primaryButtonClass} h-[52px] w-full`}>
              Next: choose roommates
            </Link>
            <Link href={`/camps/${slug}/me`} className={`${secondaryButtonClass} h-12 w-full`}>
              Back to your registration
            </Link>
          </>
        ) : (
          <Link href={`/camps/${slug}/me`} className={`${primaryButtonClass} h-[52px] w-full`}>
            Back to your registration
          </Link>
        )}
      </div>
    </div>
  );
}

function Failed({ slug, reference, check }: { slug: string; reference: string; check: PaymentCheck }) {
  return (
    <div className="flex flex-col gap-8 pt-6">
      <section role="alert" className="flex flex-col items-center gap-4 text-center">
        <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
          <circle className="cm-ring" pathLength={1} cx="44" cy="44" r="36" fill="none" stroke="#1c1917" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 44 44)" />
          <g className="cm-drop">
            <path d="M44 28v20" stroke="#1c1917" strokeWidth="4" strokeLinecap="round" />
            <circle cx="44" cy="58" r="2.6" fill="#1c1917" />
          </g>
        </svg>
        <h1 className={`cm-rise ${headlineClass}`} style={{ animationDelay: "500ms" }}>
          Payment <span className="text-cyan-edge">didn&apos;t go through</span>
        </h1>
        <p className="cm-rise max-w-[310px] text-[15px] leading-relaxed text-warm-gray" style={{ animationDelay: "580ms" }}>
          <span className="font-medium text-ink-black">Nothing was added to your balance.</span> Your registration is safe.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-seline-hero">
        <dl className="flex flex-col gap-2 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-warm-gray">Tried to pay</dt>
            <dd>
              {formatCedis(check.amount)} + {formatCedis(check.fee)} fee
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-warm-gray">Still to pay</dt>
            <dd className="font-medium">{formatCedis(check.price - check.paid)}</dd>
          </div>
        </dl>
        <Link href={`/camps/${slug}/me`} className={`${primaryButtonClass} h-[52px] w-full`}>
          Try again
        </Link>
      </section>

      <section className="flex flex-col">
        <h2 className={`${titleClass} mb-1.5`}>Before you try again</h2>
        <ul className="flex flex-col">
          {[
            [Phone, "Look for the MoMo prompt", "It closes after about a minute. Approve it with your PIN."],
            [Wallet, "Check your balance", `You need ${formatCedis(check.amount + check.fee)} in your wallet, fee included.`],
            [CreditCard, "Or pay by card", "Visa and Mastercard work too. Pick Card on the Paystack screen."],
          ].map(([Icon, title, text], i) => {
            const I = Icon as typeof Phone;
            return (
              <li key={i} className="flex gap-3.5 border-t border-stone-border py-3.5">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-stone-border bg-white">
                  <I className="h-[17px] w-[17px]" strokeWidth={1.6} aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{title as string}</span>
                  <span className="text-sm leading-relaxed text-warm-gray">{text as string}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-[10px] border border-stone-border bg-white p-5 text-sm leading-relaxed">
        <p className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-[18px] w-[18px] flex-none" strokeWidth={1.6} aria-hidden="true" />
          <span>
            If money did leave your account, it shows on your registration as soon as Paystack confirms it.{" "}
            <span className="text-warm-gray">You won&apos;t be charged twice for the same payment.</span>
          </span>
        </p>
        <p className="flex items-center gap-2.5 border-t border-stone-border pt-3 text-warm-gray">
          <MessageCircle className="h-[18px] w-[18px] flex-none text-ink-black" strokeWidth={1.6} aria-hidden="true" />
          Still stuck? Tell a camp coordinator this reference: <span className="font-mono text-xs text-ink-black">{reference}</span>
        </p>
      </section>
    </div>
  );
}
