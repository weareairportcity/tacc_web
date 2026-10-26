import type { Metadata } from "next";
import { listPublicCamps } from "@/lib/camp/camps";
import { CommuneLogo } from "@/components/camp/brand";
import { formatDate, headlineClass } from "@/components/camp/ui";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in · Commune" };

/** Commune's own coordinator sign-in, separate from the church admin portal. The next camp's photo fills the right. */
export default async function CoordinatorSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only paths inside Commune's coordinator app.
  const to = next && /^\/admin\/camp(\/|$|\?)/.test(next) ? next : "/admin/camp";
  const camps = await listPublicCamps().catch(() => []);
  const today = new Date().toISOString().slice(0, 10);
  const camp = camps.find((c) => c.banner_url && c.ends_on >= today) ?? camps.find((c) => c.banner_url);

  return (
    <div className="flex min-h-dvh flex-wrap">
      <section className="flex min-h-dvh flex-[1_1_420px] flex-col justify-between gap-10 px-6 py-8 sm:px-12 sm:py-10">
        <span className="flex items-center gap-2">
          <CommuneLogo size={32} label={null} />
          <span className="flex flex-col leading-tight">
            <span className="text-base font-medium">commune</span>
            <span className="text-xs text-warm-gray">for coordinators</span>
          </span>
        </span>
        <main className="flex w-full max-w-[380px] flex-col gap-5">
          <h1 className={`cm-rise ${headlineClass}`}>
            Welcome <span className="text-cyan-edge">back</span>
          </h1>
          <SignInForm next={to} />
        </main>
        <span aria-hidden="true" />
      </section>
      {!camp && (
        // No camp photo yet: the Commune mark holds the space instead.
        <div aria-hidden="true" className="relative m-4 hidden min-h-[560px] flex-[1_1_420px] items-center justify-center overflow-hidden rounded-2xl bg-stone-rail md:flex">
          <CommuneLogo size={180} label={null} className="cm-rise" />
        </div>
      )}
      {camp && (
        <figure className="relative m-4 hidden min-h-[560px] flex-[1_1_420px] overflow-hidden rounded-2xl bg-stone-border md:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={camp.banner_url} alt="" className="cm-ken absolute inset-0 h-full w-full object-cover" />
          <figcaption className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
            <span className="flex flex-col gap-1">
              <span className="font-display text-2xl tracking-[-0.015em]">{camp.name}</span>
              <span className="text-[13px]">
                {formatDate(camp.starts_on)} – {formatDate(camp.ends_on)}
              </span>
            </span>
            {camp.banner_credit && <span className="text-[11px] opacity-90">Photo: {camp.banner_credit}</span>}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
