"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { HumanCheck } from "@/components/camp/HumanCheck";
import { Busy } from "@/components/camp/brand";
import { ErrorText, Field, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";
import { forgotCodeAction, signInAction } from "./actions";

/** The code, big and easy to type; then "Lost your code?" with a new one by text. `next`: where to go after, e.g. a group join link. */
export function SignIn({ slug, next }: { slug: string; next?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [lostError, setLostError] = useState("");
  const [human, setHuman] = useState("");
  const [round, setRound] = useState(0);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const [sending, startSend] = useTransition();
  const lost = useRef<HTMLInputElement>(null);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          start(async () => {
            const r = await signInAction(slug, code);
            if (!r.ok) return setError(r.error);
            router.push(next ?? `/camps/${slug}/me`);
          });
        }}
        className="cm-rise order-1 flex flex-col gap-3.5 rounded-2xl border border-stone-border bg-white p-5 shadow-seline-card"
        style={{ animationDelay: "60ms" }}
      >
        <Field label="Your sign-in code" hint="8 letters and numbers. Dashes and spaces are fine.">
          <input
            required
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            className={`${inputClass} h-[60px] text-center font-mono text-[22px] tracking-[0.14em] uppercase sm:h-[60px] sm:text-[22px]`}
            placeholder="ABCD-EFGH"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButtonClass} h-14 w-full text-[17px]`}>
          <Busy pending={pending} text="Signing in…">Sign in</Busy>
        </button>
        <button
          type="button"
          onClick={() => {
            lost.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            lost.current?.focus({ preventScroll: true });
          }}
          className={`${secondaryButtonClass} h-12 w-full text-[15px]`}
        >
          I&apos;ve lost my code
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setLostError("");
          startSend(async () => {
            const r = await forgotCodeAction(slug, phone, human);
            setRound((n) => n + 1);
            if (!r.ok) return setLostError(r.error);
            setSent(true);
          });
        }}
        className="order-3 flex flex-col gap-2.5 border-t border-stone-border pt-6"
        aria-labelledby="lost-code"
      >
        <h2 id="lost-code" className="font-display text-xl tracking-[-0.017em]">
          Lost your code?
        </h2>
        <p className="text-[15px] leading-relaxed text-warm-gray">Type the phone number you registered with. We&apos;ll text you a new code, and the old one stops working.</p>
        <Field label="Phone number">
          <input ref={lost} required type="tel" inputMode="tel" autoComplete="tel" className={`${inputClass} h-[52px] sm:h-[52px] sm:text-base`} placeholder="055 111 2222" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <ErrorText>{lostError}</ErrorText>
        {sent && (
          <p role="status" className="flex items-start gap-2 text-[15px] leading-snug">
            <CircleCheck className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.8} aria-hidden="true" />
            If that number is registered, we&apos;ve texted it a new code. Your old code no longer works.
          </p>
        )}
        <HumanCheck onToken={setHuman} round={round} />
        <button type="submit" disabled={sending} aria-busy={sending} className={`${secondaryButtonClass} h-[52px] w-full text-[15px]`}>
          <Busy pending={sending} text="Sending…">Text me a new code</Busy>
        </button>
      </form>
    </>
  );
}
