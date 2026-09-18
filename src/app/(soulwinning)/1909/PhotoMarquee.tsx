"use client";

import { useState } from "react";
import { useSoulPhoto } from "@/lib/soulwinning/use-soul-photo";

const ROW_COUNT = 4;
const SPEEDS = ["72s", "108s", "58s", "96s"];
const COPIES = 14;

function rowPaths(paths: string[], row: number) {
  const offset = (row * 3) % paths.length;
  const rotated = paths.slice(offset).concat(paths.slice(0, offset));
  return Array.from({ length: Math.max(COPIES, rotated.length) }, (_, index) => rotated[index % rotated.length]);
}

export function PhotoMarquee({ paths }: { paths: string[] }) {
  const unique = paths.filter(Boolean);
  if (unique.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      data-photo-marquee
      aria-hidden
    >
      <div className="flex h-full flex-col justify-center gap-[clamp(0.4rem,1.2vh,0.85rem)] py-[clamp(0.35rem,1vh,0.7rem)]">
        {Array.from({ length: ROW_COUNT }, (_, row) => {
          const tiles = rowPaths(unique, row);
          const loop = [...tiles, ...tiles];
          return (
            <div key={row} className="flex h-[clamp(5.25rem,19svh,10.75rem)] overflow-hidden">
              <div
                className="sw-marquee-track flex h-full w-max items-center gap-[clamp(0.4rem,0.9vw,0.7rem)]"
                style={{
                  animationDuration: SPEEDS[row],
                  animationDirection: row % 2 === 0 ? "normal" : "reverse",
                }}
              >
                {loop.map((path, index) => (
                  <MarqueeTile key={`${row}-${index}-${path}`} path={path} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sw-vignette absolute inset-0" />
    </div>
  );
}

function MarqueeTile({ path }: { path: string }) {
  const url = useSoulPhoto(path);
  const [landscape, setLandscape] = useState(false);

  return (
    <div
      className="relative h-[92%] shrink-0 overflow-hidden rounded-[1.15rem] bg-[#eceae8]"
      style={{ aspectRatio: landscape ? "4 / 3" : "3 / 4" }}
    >
      {url && (
        // Signed / local demo URLs — ambient, low-opacity, not a saveable card.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          className="h-full w-full object-cover opacity-[0.72]"
          onLoad={(event) => {
            const image = event.currentTarget;
            setLandscape(image.naturalWidth > image.naturalHeight);
          }}
        />
      )}
    </div>
  );
}
