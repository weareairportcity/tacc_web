import type { Metadata } from "next";
import Link from "next/link";
import { CommuneLogo } from "@/components/camp/brand";
import { LeaderSignIn } from "./LeaderSignIn";

export const metadata: Metadata = { title: "Leaders · Commune" };

/**
 * Fellowship and PFCC leaders sign in here, with the code the camp admin gave
 * them. Its own page and its own look (dark), so nobody mixes it up with the
 * coordinators' email and password sign-in.
 */
export default function LeadersSignInPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-soot px-6 py-8 text-white selection:bg-cyan-signal selection:text-ink-black sm:px-12 sm:py-10">
      <span className="flex items-center gap-2.5">
        <span className="rounded-[10px] ring-1 ring-white/20">
          <CommuneLogo size={32} label={null} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-base font-medium">commune</span>
          <span className="text-xs text-stone-muted">for fellowship and PFCC leaders</span>
        </span>
      </span>
      <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center gap-6 py-10">
        <h1 className="cm-rise font-display text-[40px] font-normal leading-[1.1] tracking-[-0.022em]">
          Your <span className="text-cyan-signal">people</span>, at a glance
        </h1>
        <LeaderSignIn />
      </main>
      <p className="text-center text-[13px] text-stone-muted">
        Coordinator?{" "}
        <Link href="/admin/camp/sign-in" className="text-white underline decoration-white/40 underline-offset-[3px]">
          Sign in with your email
        </Link>
      </p>
    </div>
  );
}
