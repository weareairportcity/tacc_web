import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listPublicCamps } from "@/lib/camp/camps";
import { CommuneLogo } from "@/components/camp/brand";
import { formatDate } from "@/components/camp/ui";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in · Commune" };

/** The camp photo (people at camp, golden hour). Cropped to keep the faces. */
const PHOTO = "/commune/sign-in-camp.webp";

/**
 * Commune's coordinator sign-in. Wide screens: the form in one centred
 * column on the left (logo, heading, form and the other sign-ins all on one
 * left edge), the camp photo filling the right. Phones: the photo is a band
 * at the top and the form sits on a card that overlaps it.
 */
export default async function CoordinatorSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only paths inside Commune's coordinator app.
  const to = next && /^\/admin\/camp(\/|$|\?)/.test(next) ? next : "/admin/camp";
  const camps = await listPublicCamps().catch(() => []);
  const today = new Date().toISOString().slice(0, 10);
  const camp = camps.find((c) => c.ends_on >= today && c.status !== "archived");

  return (
    <div className="flex min-h-dvh flex-col bg-stone-canvas md:flex-row">
      {/* The photo: a band on phones, the right half on wide screens. */}
      <figure className="relative h-[34dvh] min-h-[220px] overflow-hidden md:order-2 md:m-3 md:h-auto md:min-h-0 md:flex-[1_1_50%] md:rounded-[28px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local, already-sized photo */}
        <img src={PHOTO} alt="Friends at camp taking a selfie together" className="absolute inset-0 h-full w-full object-cover object-[50%_28%]" fetchPriority="high" />
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-black/20 md:to-transparent" />
        {/* Phones: the logo sits on the photo. */}
        <span className="absolute left-5 top-5 flex items-center gap-2 text-white md:hidden">
          <CommuneLogo size={28} label={null} />
          <span className="text-[15px] font-medium">commune</span>
        </span>
        <figcaption className="absolute inset-x-6 bottom-6 hidden flex-col gap-1.5 text-white md:flex lg:inset-x-9 lg:bottom-9">
          <span className="max-w-[16ch] font-display text-[clamp(28px,3.2vw,44px)] leading-[1.08] tracking-[-0.025em] [text-wrap:balance]">
            Camp is better together.
          </span>
          {camp && (
            <span className="text-[14px] text-white/85">
              Next up: {camp.name} · {formatDate(camp.starts_on)} – {formatDate(camp.ends_on)}
            </span>
          )}
        </figcaption>
      </figure>

      {/* The form side. On phones a card lifted over the photo. */}
      <section className="relative z-10 -mt-6 flex flex-1 flex-col rounded-t-[28px] bg-stone-canvas px-5 pb-8 pt-8 md:mt-0 md:flex-[1_1_50%] md:rounded-none md:px-10 md:py-9">
        <div className="mx-auto flex w-full min-w-0 max-w-[400px] flex-1 flex-col">
          <header className="hidden items-center gap-2.5 md:flex">
            <CommuneLogo size={32} label={null} />
            <span className="flex flex-col leading-tight">
              <span className="text-base font-medium">commune</span>
              <span className="text-[13px] text-warm-gray">for coordinators</span>
            </span>
          </header>

          <main className="flex flex-1 flex-col justify-center gap-7 md:py-12">
            <div className="flex flex-col gap-2">
              <h1 className="cm-rise font-display text-[clamp(34px,4vw,44px)] leading-[1.06] tracking-[-0.025em]">
                Welcome <span className="text-cyan-edge">back</span>
              </h1>
              <p className="text-[15px] leading-relaxed text-warm-gray">Sign in to run your camps.</p>
            </div>
            <SignInForm next={to} />
          </main>

          {/* Everyone else signs in somewhere else. */}
          <nav aria-labelledby="others" className="flex flex-col border-t border-stone-border pt-5">
            <h2 id="others" className="mb-1 text-[13px] text-warm-gray">
              Not a coordinator?
            </h2>
            <OtherSignIn href="/camps" title="Coming to camp" action="Attendee sign-in" />
            <OtherSignIn href="/leaders" title="Fellowship or PFCC leader" action="Leader code" />
          </nav>
        </div>
      </section>
    </div>
  );
}

function OtherSignIn({ href, title, action }: { href: string; title: string; action: string }) {
  return (
    <Link href={href} className="group flex min-h-12 items-center justify-between gap-3 border-b border-stone-border/70 py-1.5 text-[15px] last:border-b-0">
      <span className="min-w-0 text-warm-gray">{title}</span>
      <span className="flex flex-none items-center gap-1.5 font-medium text-ink-black">
        {action}
        <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.8} aria-hidden="true" />
      </span>
    </Link>
  );
}
