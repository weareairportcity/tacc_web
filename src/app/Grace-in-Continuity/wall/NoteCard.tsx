"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { POSES, Polaroid } from "../Polaroid";
import { DeleteNoteButton } from "./DeleteNoteButton";

// Roughly five lines of handwriting before "View more".
const COLLAPSED_PX = 180;

// When a note opens, its pile fans out so every photo can be seen.
const OPEN_POSES: Record<number, { x: number; y: number; r: number }[]> = {
  1: [{ x: 0, y: 0, r: 0 }],
  2: [
    { x: -30, y: 2, r: -5 },
    { x: 30, y: 0, r: 4 },
  ],
  3: [
    { x: -40, y: 4, r: -7 },
    { x: 40, y: 4, r: 6 },
    { x: 0, y: -2, r: 0 },
  ],
};

export type WallCardNote = {
  id: string;
  name: string;
  letter: string;
  sent: string;
  photoUrls: string[];
};

export function NoteCard({ note, canDelete }: { note: WallCardNote; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [fullHeight, setFullHeight] = useState<number | null>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);

  // Measure the whole letter, and again whenever the font loads or the column
  // width changes, so the open height is always exact.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => setFullHeight(el.scrollHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const long = fullHeight !== null && fullHeight > COLLAPSED_PX + 24;
  const height = !long ? fullHeight ?? undefined : open ? fullHeight! : COLLAPSED_PX;

  function toggle() {
    const closing = open;
    setOpen(!open);
    // Closing a long note can leave its top above the screen; bring it back.
    if (closing) {
      const top = cardRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const count = Math.max(1, Math.min(note.photoUrls.length, 3));
  const poses = (open ? OPEN_POSES : POSES)[count];

  return (
    <article ref={cardRef} className="flex scroll-mt-6 flex-col items-center">
      <div className="w-full py-3">
        <div
          className={`relative mx-auto aspect-[1/1.3] w-[min(52vw,210px)] transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${
            open ? "scale-[1.04]" : ""
          }`}
        >
          {note.photoUrls.map((url, i) => (
            // The last photo sits in front, in the centre pose.
            <Polaroid key={url} pose={poses[i]} z={i + 1}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private, cookie-gated route */}
              <img
                src={url}
                alt={`Photo from ${note.name}`}
                loading="lazy"
                className="aspect-square w-full bg-[#e9e6e0] object-cover"
              />
              <div className="flex h-[clamp(3rem,13vw,3.8rem)] items-center justify-center">
                <span className="truncate px-1 font-[family-name:var(--font-hand)] text-[clamp(1.2rem,5vw,1.55rem)] text-[#4a4643]">
                  {note.name}
                </span>
              </div>
            </Polaroid>
          ))}
        </div>
      </div>

      <div
        className={`mt-6 w-full rounded-[3px] bg-white px-6 py-6 transition-shadow duration-500 ${
          open
            ? "shadow-[0_1px_2px_rgba(0,0,0,0.06),0_28px_60px_-24px_rgba(0,0,0,0.3)]"
            : "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_40px_-20px_rgba(0,0,0,0.18)]"
        }`}
      >
        <div
          className="relative overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
          // Until measured, clamp without animating so the page doesn't jump.
          style={fullHeight === null ? { maxHeight: COLLAPSED_PX } : { height }}
        >
          <div
            ref={textRef}
            className="whitespace-pre-line font-[family-name:var(--font-hand)] text-[1.45rem] leading-[1.45] text-[#2f2c2a]"
          >
            {note.letter}
          </div>
          {long && (
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-white/0 transition-opacity duration-500 ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          {long ? (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className="inline-flex items-center gap-1 rounded-full border border-[#e4dfd7] px-3 py-1.5 text-sm text-[#5a5550] transition-colors hover:bg-[#f7f6f3]"
            >
              {open ? "Show less" : "View more"}
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-500 ${open ? "rotate-180" : ""}`}
              />
            </button>
          ) : (
            <span />
          )}
          <p className="truncate font-[family-name:var(--font-hand)] text-xl text-[#6b6560]">
            — {note.name}
          </p>
        </div>
      </div>

      <div className="mt-2 flex w-full items-center justify-between text-xs text-[#9a948c]">
        <span>{note.sent}</span>
        {canDelete && <DeleteNoteButton id={note.id} name={note.name} />}
      </div>
    </article>
  );
}
