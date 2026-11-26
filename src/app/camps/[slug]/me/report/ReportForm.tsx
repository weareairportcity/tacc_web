"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, X } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { downsizePhoto } from "@/components/camp/downsize";
import { ErrorText, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { MAX_COMPLAINT } from "@/lib/camp/complaints-shared";
import { submitComplaintAction } from "../../actions";

/** Words, and a photo if they like (shrunk on the phone before it's sent). */
export function ReportForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useOneAtATime();
  const file = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    setReading(true);
    const blob = await downsizePhoto(f);
    setReading(false);
    if (!blob) return setError("Couldn't read that photo. Try another, or send without one.");
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto({ blob, url: URL.createObjectURL(blob) });
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-stone-border bg-white p-5 shadow-seline-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim().length < 3) return setError("Tell us what the problem is.");
        setError("");
        start(async () => {
          const form = new FormData();
          form.set("body", body);
          if (photo) form.set("photo", new File([photo.blob], "photo.jpg", { type: "image/jpeg" }));
          const r = await submitComplaintAction(slug, form);
          if (!r.ok) return setError(r.error);
          setBody("");
          if (photo) URL.revokeObjectURL(photo.url);
          setPhoto(null);
          setSent(true);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        What happened?
        <textarea
          rows={5}
          value={body}
          maxLength={MAX_COMPLAINT}
          onChange={(e) => {
            setBody(e.target.value);
            setSent(false);
          }}
          placeholder="Tell us what's wrong, and where"
          className={`${inputClass} h-auto py-2.5 leading-relaxed`}
        />
      </label>
      <div className="flex flex-col gap-2">
        <input ref={file} type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        {photo ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="The photo you're sending" className="h-24 w-auto rounded-[10px] border border-stone-border" />
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(photo.url);
                setPhoto(null);
                if (file.current) file.current.value = "";
              }}
              className="cm-press inline-flex h-10 items-center gap-1.5 rounded-full border border-stone-border bg-white px-3 text-sm font-medium"
            >
              <X className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Remove
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => file.current?.click()} disabled={reading} className={`${secondaryButtonClass} h-12 self-start px-5 text-[15px]`}>
            <Camera className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" /> {reading ? "Getting the photo ready…" : "Add a photo (optional)"}
          </button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending || reading} aria-busy={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
        <Busy pending={pending} text="Sending…">Send report</Busy>
      </button>
      {sent && (
        <p role="status" className="cm-rise flex items-center justify-center gap-2 text-sm">
          <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" /> Sent. The coordinators and your leaders have been told.
        </p>
      )}
    </form>
  );
}
