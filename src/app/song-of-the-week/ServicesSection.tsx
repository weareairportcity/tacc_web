import Link from "next/link";
import { ListMusic, Music } from "lucide-react";
import type { ServiceWithSongs } from "@/lib/services-db";

export const formatServiceDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Live Services: one album-style card per service, linking to its playlist. */
export default function ServicesSection({ services }: { services: ServiceWithSongs[] }) {
  if (services.length === 0) return null;

  return (
    <div id="services" className="space-y-6">
      <div className="border-b border-[#e8e6e5] pb-4">
        <h2 className="text-2xl font-roobert font-normal tracking-[-0.021em] text-[#0c0a09]">Live Services</h2>
        <p className="text-xs text-[#78716c] mt-1 font-normal">
          The songs for each service, in the order we&apos;ll sing them. Follow along live.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5">
        {services.map((service) => {
          const live = service.songs.some((s) => s.status === "live");
          const done = service.songs.length > 0 && service.songs.every((s) => s.status === "sung");
          return (
            <Link
              key={service.id}
              href={`/song-of-the-week/services/${service.id}`}
              className={`group flex flex-col rounded-[10px] border bg-white p-[14px] shadow-[0_4px_16px_rgba(0,0,0,0.05)] transition-all duration-200 ${
                live ? "border-[#ef4444] ring-2 ring-[#ef4444]/15" : "border-[#e8e6e5] hover:border-[#d6d3d1]"
              }`}
            >
              <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-[8px] border border-[#e8e6e5] bg-[#0c0a09]">
                {service.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote cover art
                  <img
                    src={service.cover_image_url}
                    alt={service.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music className="h-6 w-6 text-white/40" />
                  </div>
                )}
                {live ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-[#ef4444] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE NOW
                  </span>
                ) : done ? (
                  <span className="absolute left-2 top-2 rounded-full border border-[#e8e6e5] bg-white/90 px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#78716c] backdrop-blur-sm">
                    Ended
                  </span>
                ) : null}
              </div>
              <h3 className="truncate font-roobert text-sm leading-snug tracking-[-0.017em] text-[#0c0a09] transition-colors group-hover:text-[#3398e1]">
                {service.title}
              </h3>
              <p className="mt-0.5 truncate text-xs text-[#78716c]">{formatServiceDate(service.service_date)}</p>
              <p className="mt-3 flex items-center gap-1.5 border-t border-[#e8e6e5] pt-2 text-[11px] text-[#a8a29e]">
                <ListMusic className="h-3.5 w-3.5" />
                {service.songs.length} {service.songs.length === 1 ? "song" : "songs"}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
