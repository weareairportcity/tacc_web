"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageUp, Trash2 } from "lucide-react";
import type { Camp, CampPhoto } from "@/lib/camp/types";
import { CommuneLoader } from "@/components/camp/brand";
import { ErrorText, inputClass, secondaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { saveCampPhotoAction, uploadCampPhotoAction } from "../../actions";

const SLOTS: { kind: CampPhoto; label: string; hint: string; shape: string }[] = [
  { kind: "logo", label: "Logo", hint: "Square, at least 256 px. Shown beside the back button, on camp cards and in this sidebar.", shape: "h-20 w-20 rounded-[22%]" },
  { kind: "banner", label: "Banner", hint: "Wide, about 3:1, at least 1200 px across. Across the top of the camp page and on each attendee's pass.", shape: "h-24 w-full max-w-72 rounded-[10px]" },
  { kind: "venue_photo", label: "Venue photo", hint: "The place itself. Shown under “Where we'll be” and after someone pays.", shape: "h-24 w-full max-w-72 rounded-[10px]" },
];

function Slot({ camp, kind, label, hint, shape }: { camp: Camp } & (typeof SLOTS)[number]) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const url = camp[`${kind}_url`];
  const [credit, setCredit] = useState(camp[`${kind}_credit`]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const upload = (file: File | undefined) => {
    if (!file) return;
    setError("");
    setSaved(false);
    const form = new FormData();
    form.set("file", file);
    form.set("credit", credit);
    startTransition(async () => {
      const result = await uploadCampPhotoAction(camp.id, kind, form);
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  };

  const save = (nextUrl: string) => {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const result = await saveCampPhotoAction(camp.id, kind, nextUrl, nextUrl ? credit : "");
      if (!result.ok) return setError(result.error);
      if (!nextUrl) setCredit("");
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-start gap-4 border-t border-stone-border pt-4 first:border-t-0 first:pt-0">
      <div className={cn("relative flex flex-none items-center justify-center overflow-hidden border border-stone-border bg-stone-canvas", shape, !url && "border-dashed")}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- camp image on the church's R2 media host
          <img src={url} alt={`${label} for ${camp.name}`} className="h-full w-full object-cover" />
        ) : (
          <ImageUp className="h-5 w-5 text-ash-gray" strokeWidth={1.5} aria-hidden="true" />
        )}
        {pending && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <CommuneLoader size={26} label="Uploading" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[13px] leading-snug text-warm-gray">{hint}</span>
        <input
          aria-label={`${label} credit`}
          placeholder="Credit, e.g. Photo by Ama Mensah, CC BY-SA 4.0"
          className={cn(inputClass, "h-10 text-sm")}
          value={credit}
          onChange={(e) => {
            setCredit(e.target.value);
            setSaved(false);
          }}
          onBlur={() => url && credit !== camp[`${kind}_credit`] && save(url)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className={secondaryButtonClass}>
            <ImageUp className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
            {url ? "Replace" : "Upload"}
          </button>
          {url && (
            <button type="button" disabled={pending} onClick={() => save("")} className="cm-press inline-flex h-10 items-center gap-1.5 px-2 text-sm text-warm-gray hover:text-ink-black">
              <Trash2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Remove
            </button>
          )}
          {saved && (
            <span role="status" className="flex items-center gap-1 text-[13px]">
              <Check className="h-4 w-4" aria-hidden="true" /> Saved
            </span>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  );
}

/** The camp's logo, banner and venue photo, each with a credit line. */
export function CampPhotos({ camp }: { camp: Camp }) {
  return (
    <div className="flex flex-col gap-4">
      {SLOTS.map((slot) => (
        <Slot key={slot.kind} camp={camp} {...slot} />
      ))}
    </div>
  );
}
