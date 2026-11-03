import Link from "next/link";
import { headlineClass } from "./ui";
import { LEGAL } from "@/lib/camp/legal";

/** The layout the privacy policy, terms and cookie pages share: a title, then plain sections. */
export function LegalPage({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-6 pt-4">
      <header className="flex flex-col gap-2">
        <h1 className={`${headlineClass} text-[34px]`}>{title}</h1>
        <p className="text-[15px] leading-relaxed text-warm-gray">{lead}</p>
        <p className="text-[13px] text-warm-gray">Last updated {LEGAL.updated}</p>
      </header>
      <div className="flex flex-col gap-6 text-[15px] leading-relaxed [&_h2]:text-[17px] [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_section]:flex [&_section]:flex-col [&_section]:gap-2 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
      <nav aria-label="Legal" className="flex flex-wrap gap-4 border-t border-stone-border pt-4 text-sm">
        <Link href="/camps/privacy" className="underline decoration-stone-muted underline-offset-[3px]">Privacy</Link>
        <Link href="/camps/terms" className="underline decoration-stone-muted underline-offset-[3px]">Terms</Link>
        <Link href="/camps/cookies" className="underline decoration-stone-muted underline-offset-[3px]">Cookies</Link>
      </nav>
    </article>
  );
}
