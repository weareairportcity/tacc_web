"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { CommuneLoader } from "@/components/camp/brand";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPending(true);
    const { error: failed } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (failed) {
      setPending(false);
      return setError(failed.message === "Invalid login credentials" ? "That email and password don't match." : failed.message);
    }
    router.replace(next);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="cm-rise flex flex-col gap-4" style={{ animationDelay: "60ms" }}>
      <Field label="Email">
        <input type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <span className="relative flex">
          <input
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            className={`${inputClass} pr-12`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-warm-gray"
          >
            {show ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.6} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.6} />}
          </button>
        </span>
      </Field>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
        {pending && <CommuneLoader size={22} label={null} />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-[13px] text-warm-gray">Forgot your password? Ask a camp admin.</p>
    </form>
  );
}
