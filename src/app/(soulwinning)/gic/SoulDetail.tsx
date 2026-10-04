"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSoulPhoto } from "@/lib/soulwinning/use-soul-photo";

export type SoulDetailData = {
  name: string;
  phone: string | null;
  photoUrl?: string | null;
  photoPath?: string | null;
  createdAt: string;
  bulk: boolean;
  souls: number;
  tongues: number;
  church: number;
  member?: string | null;
  fellowship?: string | null;
  pfcc?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function SoulDetail({
  data,
  onClose,
}: {
  data: SoulDetailData;
  onClose: () => void;
}) {
  const signed = useSoulPhoto(data.photoPath ?? null);
  const url = data.photoUrl || signed;
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const when = new Date(data.createdAt).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const location =
    data.latitude != null && data.longitude != null
      ? `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`
      : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0c0a09]/35 p-4 backdrop-blur-[6px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sw-soul-detail-title"
      data-soul-detail
      onClick={onClose}
    >
      <article
        className="relative w-full overflow-hidden rounded-[1.5rem] bg-white shadow-[0_28px_80px_-24px_rgba(12,10,9,0.5)]"
        style={{ maxWidth: landscape ? "28rem" : "22rem" }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-[#78716c] shadow-sm"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            className="block max-h-[52vh] w-full object-cover"
            onLoad={(event) => {
              const image = event.currentTarget;
              setLandscape(image.naturalWidth > image.naturalHeight);
            }}
          />
        ) : (
          <div className="flex h-36 items-center justify-center bg-[#f2f2f2] text-4xl font-medium text-[#a8a29e]">
            {data.name.slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="px-5 pb-6 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#a8a29e]">
            {data.bulk ? `Group · ${data.souls} souls` : "Soul"}
          </p>
          <h2
            id="sw-soul-detail-title"
            className="mt-1 font-display text-[1.65rem] leading-none text-[#0c0a09]"
          >
            {data.name}
          </h2>
          {data.phone ? (
            <p className="mt-2 text-sm tabular-nums text-[#57534e]">{data.phone}</p>
          ) : (
            <p className="mt-2 text-sm text-[#a8a29e]">No phone</p>
          )}

          {(data.member || data.fellowship || data.pfcc) && (
            <p className="mt-2 text-sm text-[#78716c]">
              {data.member ? `Won by ${data.member}` : "Won in the field"}
              {data.fellowship ? ` · ${data.fellowship}` : ""}
              {data.pfcc ? ` · ${data.pfcc}` : ""}
            </p>
          )}

          <p className="mt-1 text-xs text-[#a8a29e]">{when}</p>
          {location && <p className="mt-0.5 text-xs tabular-nums text-[#a8a29e]">{location}</p>}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Spoke in tongues" value={data.bulk ? `${data.tongues} of ${data.souls}` : data.tongues ? "Yes" : "No"} />
            <Stat label="Coming to church" value={data.bulk ? `${data.church} of ${data.souls}` : data.church ? "Yes" : "No"} />
          </div>
        </div>
      </article>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#fafaf9] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#a8a29e]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#0c0a09]">{value}</p>
    </div>
  );
}
