"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Plus, X } from "lucide-react";
import {
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  MAX_WORDS,
  countWords,
  isHeic,
  isImage,
} from "@/lib/grace/rules";
import { POSES, Polaroid } from "./Polaroid";
import { MESSAGES, SendError, sendNote } from "./upload";

type Photo = {
  id: string;
  file: File;
  // Null while a HEIC file is still being converted for the preview.
  previewUrl: string | null;
  // The browser couldn't decode it, so there's nothing to put on the wall.
  failed?: boolean;
};

type Stage =
  | { kind: "editing" }
  // progress is null until the upload sessions are open and bytes start moving.
  | { kind: "sending"; progress: number | null }
  | { kind: "error"; message: string }
  | { kind: "sent"; name: string };

function canDisplay(url: string) {
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// Safari shows HEIC natively; everywhere else we convert a copy just for the
// preview. The original file is what gets uploaded.
async function previewFor(file: File) {
  const url = URL.createObjectURL(file);
  if (!isHeic(file) || (await canDisplay(url))) return url;
  URL.revokeObjectURL(url);
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 });
  return URL.createObjectURL(Array.isArray(out) ? out[0] : out);
}

// Cuts the text off before the word past the limit, so a paste can't overflow.
function clampWords(text: string, max: number) {
  const re = /\S+/g;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (++n > max) return text.slice(0, m.index);
  }
  return text;
}

export function BirthdayForm() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [front, setFront] = useState(0);
  const [name, setName] = useState("");
  const [letter, setLetter] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "editing" });
  const [notice, setNotice] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const letterRef = useRef<HTMLTextAreaElement>(null);

  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => photosRef.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl)),
    [],
  );

  // Let the letter grow with the writing instead of scrolling inside itself.
  useEffect(() => {
    const el = letterRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [letter]);

  function loadPreview(photo: Photo) {
    previewFor(photo.file)
      .then((url) =>
        setPhotos((ps) => ps.map((p) => (p.id === photo.id ? { ...p, previewUrl: url } : p))),
      )
      .catch(() =>
        setPhotos((ps) => ps.map((p) => (p.id === photo.id ? { ...p, failed: true } : p))),
      );
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const all = Array.from(files);
    const picked = all.filter(isImage);
    const fits = picked.filter((f) => f.size <= MAX_PHOTO_BYTES);
    setNotice(
      picked.length < all.length
        ? "Only photos can be added, so we left out the other files."
        : fits.length < picked.length
          ? "Some photos were too big (over 50 MB), so we left them out."
          : fits.length > room
            ? `You can add up to ${MAX_PHOTOS} photos, so we left out the extras.`
            : null,
    );
    const added = fits
      .slice(0, room)
      .map((file) => ({ id: crypto.randomUUID(), file, previewUrl: null }));
    if (!added.length) return;
    setPhotos((ps) => [...ps, ...added]);
    setFront(photos.length + added.length - 1);
    added.forEach(loadPreview);
  }

  function replaceFront(files: FileList | null) {
    const file = files?.[0];
    const old = photos[front];
    if (!file || !old) return;
    if (!isImage(file)) {
      setNotice("That file is not a photo. Please choose a photo.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setNotice("That photo is too big. Please choose one under 50 MB.");
      return;
    }
    setNotice(null);
    if (old.previewUrl) URL.revokeObjectURL(old.previewUrl);
    const next = { id: crypto.randomUUID(), file, previewUrl: null };
    setPhotos((ps) => ps.map((p) => (p.id === old.id ? next : p)));
    loadPreview(next);
  }

  function removeFront() {
    const old = photos[front];
    if (!old) return;
    if (old.previewUrl) URL.revokeObjectURL(old.previewUrl);
    setPhotos((ps) => ps.filter((p) => p.id !== old.id));
    setFront(Math.max(0, front - 1));
  }

  const words = countWords(letter);
  const preparing = photos.some((p) => !p.previewUrl && !p.failed);
  const unreadable = photos.some((p) => p.failed);
  const ready = photos.length > 0 && name.trim() !== "" && words > 0 && !preparing && !unreadable;
  const missing = [
    !photos.length && "a photo",
    !name.trim() && "your name",
    !words && "a note",
  ].filter(Boolean) as string[];
  const sending = stage.kind === "sending";

  // Closing the tab mid-upload would leave a half-sent note.
  useEffect(() => {
    if (!sending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sending]);

  async function send() {
    if (!ready || sending) return;
    setStage({ kind: "sending", progress: null });
    try {
      await sendNote(
        {
          name: name.trim(),
          letter: letter.trim(),
          photos: photos.map((p) => ({ file: p.file, previewUrl: p.previewUrl! })),
        },
        (progress) => setStage({ kind: "sending", progress }),
      );
      photos.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
      setPhotos([]);
      setFront(0);
      setLetter("");
      setNotice(null);
      setStage({ kind: "sent", name: name.trim() });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setStage({
        kind: "error",
        message: err instanceof SendError ? err.message : MESSAGES.server,
      });
    }
  }

  if (stage.kind === "sent") {
    return (
      <div className="mt-14 flex w-full max-w-md flex-col items-center text-center">
        <p className="font-[family-name:var(--font-hand)] text-4xl text-[#2f2c2a]">
          Thank you, {stage.name.split(" ")[0]}!
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-[#7a746d]">
          Your photos and note are on their way to Pastor.
        </p>
        <button
          type="button"
          onClick={() => setStage({ kind: "editing" })}
          className="mt-8 rounded-full border border-[#dcd7cf] bg-white/70 px-6 py-3 text-[15px] text-[#3a3633] transition-colors hover:bg-white"
        >
          Send another note
        </button>
      </div>
    );
  }

  const poses = POSES[Math.max(1, photos.length)];

  return (
    <div className="mt-12 flex w-full flex-col items-center sm:mt-16" inert={sending}>
      <input
        ref={addInput}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={replaceInput}
        type="file"
        accept="image/*,.heic,.heif"
        className="sr-only"
        onChange={(e) => {
          replaceFront(e.target.files);
          e.target.value = "";
        }}
      />

      {/* The pile */}
      <div className="w-full overflow-x-clip py-4">
        <div className="relative mx-auto aspect-[1/1.3] w-[min(56vw,270px)]">
          {photos.length === 0 ? (
            <Polaroid pose={poses[0]} z={1}>
              <button
                type="button"
                onClick={() => addInput.current?.click()}
                className="flex aspect-square w-full flex-col items-center justify-center gap-2 border border-dashed border-[#cfc9c1] bg-[#f3f1ec] text-[#8a847d] transition-colors hover:bg-[#ece9e2]"
              >
                <ImagePlus className="h-7 w-7" strokeWidth={1.5} />
                <span className="text-sm">Add a photo</span>
              </button>
              <NameStrip value={name} onChange={setName} editable />
            </Polaroid>
          ) : (
            photos.map((photo, i) => {
              const isFront = i === front;
              const slot = isFront ? photos.length - 1 : i < front ? i : i - 1;
              return (
                <Polaroid
                  key={photo.id}
                  pose={poses[slot]}
                  z={isFront ? 10 : i + 1}
                  onBringForward={isFront ? undefined : () => setFront(i)}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-[#e9e6e0]">
                    {photo.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                      <img
                        src={photo.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-[#9a948c]">
                        {photo.failed
                          ? "We could not open this photo. Tap ✕ to remove it and pick another."
                          : isHeic(photo.file)
                            ? "Preparing photo…"
                            : "Loading photo…"}
                      </div>
                    )}
                    {isFront && (
                      <button
                        type="button"
                        aria-label="Change this photo"
                        onClick={() => replaceInput.current?.click()}
                        className="absolute inset-0"
                      />
                    )}
                  </div>
                  <NameStrip value={name} onChange={setName} editable={isFront} />
                  {isFront && (
                    <button
                      type="button"
                      aria-label="Remove this photo"
                      onClick={removeFront}
                      className="absolute -right-2.5 -top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#2b2724] text-white shadow-md transition-transform hover:scale-105"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  )}
                </Polaroid>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-6 flex min-h-9 flex-col items-center gap-2 text-sm text-[#8a847d]">
        {photos.length > 0 && photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => addInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#dcd7cf] bg-white/70 px-4 py-2 text-[#3a3633] transition-colors hover:bg-white"
          >
            <Plus className="h-4 w-4" />
            Add another photo
            <span className="text-[#a39d95]">
              · {photos.length} of {MAX_PHOTOS}
            </span>
          </button>
        )}
        {photos.length > 1 && <p>Tap a photo to bring it to the front.</p>}
        {notice && <p className="text-[#b4562e]">{notice}</p>}
      </div>

      {/* The letter */}
      <section className="mt-12 w-full max-w-xl">
        <div className="rounded-[3px] bg-white px-6 py-7 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_40px_-20px_rgba(0,0,0,0.18)] sm:px-10 sm:py-10">
          <label htmlFor="letter" className="sr-only">
            Your note to Pastor
          </label>
          <textarea
            id="letter"
            ref={letterRef}
            value={letter}
            onChange={(e) => setLetter(clampWords(e.target.value, MAX_WORDS))}
            placeholder="Dear Pastor,"
            rows={8}
            className="block min-h-64 w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-[family-name:var(--font-hand)] text-[1.7rem] leading-[1.45] text-[#2f2c2a] outline-none placeholder:text-[#c9c4bd] focus:ring-0"
          />
        </div>
        <p
          className={`mt-2 text-right text-xs tabular-nums ${
            words >= MAX_WORDS ? "text-[#b4562e]" : "text-[#9a948c]"
          }`}
        >
          {words >= MAX_WORDS ? `You have reached the ${MAX_WORDS}-word limit.` : `${words} / ${MAX_WORDS} words`}
        </p>
      </section>

      <div className="mt-8 flex w-full max-w-xl flex-col items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={!ready || sending}
          className="relative w-full overflow-hidden rounded-full bg-[#2b2724] px-6 py-4 text-[15px] font-medium text-white transition-opacity disabled:opacity-35 sm:w-auto sm:min-w-64 [&:disabled[aria-busy=true]]:opacity-100"
          aria-busy={sending}
        >
          {sending && (
            <span
              className="absolute inset-y-0 left-0 bg-white/15 transition-[width] duration-200"
              style={{ width: `${Math.round((stage.progress ?? 0) * 100)}%` }}
            />
          )}
          <span className="relative">
            {sending
              ? stage.progress === null
                ? "Getting ready…"
                : `Sending… ${Math.round(stage.progress * 100)}%`
              : stage.kind === "error"
                ? "Try again"
                : "Send to Pastor"}
          </span>
        </button>
        {stage.kind === "error" && <p className="text-center text-sm text-[#b4562e]">{stage.message}</p>}
        {sending && <p className="text-sm text-[#9a948c]">Keep this page open until it finishes.</p>}
        {!ready && !sending && (
          <p className="text-sm text-[#9a948c]">
            {missing.length
              ? `Add ${listWords(missing)} to send.`
              : unreadable
                ? "Please remove the photo we could not open, then tap Send."
                : "Getting your photos ready…"}
          </p>
        )}
      </div>
    </div>
  );
}

function listWords(items: string[]) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function NameStrip({
  value,
  onChange,
  editable,
}: {
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
}) {
  const text = "font-[family-name:var(--font-hand)] text-[clamp(1.35rem,5.5vw,1.85rem)] text-[#4a4643]";
  return (
    <div className="flex h-[clamp(3.6rem,15vw,4.6rem)] items-center justify-center">
      {editable ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={40}
          placeholder="Your name"
          aria-label="Your name"
          className={`${text} w-full bg-transparent text-center outline-none placeholder:text-[#c4bfb8]`}
        />
      ) : (
        <span className={`${text} truncate ${value ? "" : "text-[#c4bfb8]"}`}>
          {value || "Your name"}
        </span>
      )}
    </div>
  );
}
