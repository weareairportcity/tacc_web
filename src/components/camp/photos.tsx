import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Camp } from "@/lib/camp/types";
import { cn } from "@/lib/utils";

/**
 * A camp's own images. They live on R2 (media.theairportcitychurch.com), so
 * they're plain <img> tags rather than next/image. Credits sit on the image,
 * as the free licences most venue photos come with require.
 */

type CampImages = Pick<Camp, "name" | "logo_url" | "banner_url" | "banner_credit" | "venue_photo_url" | "venue_photo_credit" | "venue">;

function Credit({ text, right }: { text: string; right?: boolean }) {
  if (!text) return null;
  return (
    <figcaption
      className={cn(
        "pointer-events-none absolute bottom-2 truncate text-[10px] text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,.5)]",
        // On a banner the logo can sit over the bottom-left corner, so its credit goes right.
        right ? "left-24 right-3 text-right" : "left-3 right-3",
      )}
    >
      Photo: {text}
    </figcaption>
  );
}

/** The wide image across the top. Nothing at all when the camp has none. */
export function CampBanner({ camp, className, settle = true }: { camp: CampImages; className?: string; settle?: boolean }) {
  if (!camp.banner_url) return null;
  return (
    <figure className={cn("relative m-0 overflow-hidden bg-stone-border", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- camp image on the church's R2 media host */}
      <img src={camp.banner_url} alt="" className={cn("h-full w-full object-cover", settle && "cm-ken")} />
      <Credit text={camp.banner_credit} right />
    </figure>
  );
}

export function VenuePhoto({ camp, className, children }: { camp: CampImages; className?: string; children?: React.ReactNode }) {
  if (!camp.venue_photo_url) return null;
  return (
    <figure className={cn("relative m-0 overflow-hidden rounded-2xl bg-stone-border", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- camp image on the church's R2 media host */}
      <img src={camp.venue_photo_url} alt={camp.venue ? `${camp.venue}` : ""} className="h-full w-full object-cover" />
      {children}
      <Credit text={camp.venue_photo_credit} />
    </figure>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** The camp's logo, or its initials on a dark tile until one is uploaded. */
export function CampLogo({ camp, size = 28, className }: { camp: CampImages; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (camp.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- camp logo on the church's R2 media host
      <img src={camp.logo_url} alt="" style={style} className={cn("flex-none rounded-[22%] bg-white object-cover", className)} />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.max(9, Math.round(size * 0.34)) }}
      className={cn("flex flex-none items-center justify-center rounded-[22%] bg-soot font-medium tracking-[0.02em] text-white", className)}
    >
      {initials(camp.name)}
    </span>
  );
}

/** "← [logo] Camp name": the back link on attendee pages, with the camp's logo beside it. */
export function CampBackLink({ href, camp, label }: { href: string; camp: CampImages; label?: string }) {
  return (
    <Link href={href} className="cm-press -ml-1 inline-flex min-h-11 items-center gap-2 self-start text-sm text-ink-black">
      <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
      <CampLogo camp={camp} size={26} />
      <span>{label ?? camp.name}</span>
    </Link>
  );
}
