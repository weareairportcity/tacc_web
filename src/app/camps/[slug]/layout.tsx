import { MessageCircle, Phone } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";

/**
 * Every page of one camp ends with a way to ask a person: Call or WhatsApp the camp's help
 * number (Settings → Help for attendees). Nothing shows until a number is set.
 */
export default async function CampLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  const phone = camp?.help_phone ?? "";
  return (
    <>
      {children}
      {phone && (
        <aside aria-label="Help" className="mt-10 flex flex-wrap items-center gap-3 rounded-2xl bg-stone-rail p-4">
          <span className="flex min-w-[180px] flex-1 flex-col">
            <span className="text-[15px] font-medium">Need help?</span>
            <span className="text-[13px] text-warm-gray">
              Talk to a coordinator: 0{phone.slice(3, 5)} {phone.slice(5, 8)} {phone.slice(8)}
            </span>
          </span>
          <span className="flex gap-2">
            <a href={`tel:+${phone}`} className="cm-press inline-flex h-11 items-center gap-1.5 rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
              <Phone className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Call
            </a>
            <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener" className="cm-press inline-flex h-11 items-center gap-1.5 rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
              <MessageCircle className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> WhatsApp
            </a>
          </span>
        </aside>
      )}
    </>
  );
}
