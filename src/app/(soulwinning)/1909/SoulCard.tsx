"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The card that drifts across the counter — a photo above, the name beneath,
 * the church mark at the foot.
 *
 * The photo is drawn into a <canvas> rather than an <img>: there is no element
 * with a copyable src, nothing to drag to the desktop, and the address it was
 * drawn from is a signed URL that expires in a minute. Right-click and drag are
 * suppressed too. None of this stops a screenshot — nothing can — but the image
 * has no reusable address.
 */

interface Props {
  name: string;
  photoPath: string | null;
  /** 0-1, scales the whole card. */
  scale: number;
  isProjector: boolean;
}

export function SoulCard({ name, photoPath, scale, isProjector }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasPhoto, setHasPhoto] = useState(false);

  const base = isProjector ? 300 : 190;
  const width = Math.round(base * scale);
  const photoSize = width - 20;

  useEffect(() => {
    if (!photoPath) return;
    let cancelled = false;

    void (async () => {
      try {
        const isDirect =
          photoPath.startsWith("/") ||
          photoPath.startsWith("blob:") ||
          photoPath.startsWith("http://") ||
          photoPath.startsWith("https://");

        let url = photoPath;
        if (!isDirect) {
          const response = await fetch(`/api/soulwinning/photo?path=${encodeURIComponent(photoPath)}`);
          if (!response.ok) return;
          const signed = (await response.json()) as { url: string };
          url = signed.url;
        }

        const image = new Image();
        if (!isDirect) image.crossOrigin = "anonymous";
        image.onload = () => {
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (!canvas) return;

          const ratio = window.devicePixelRatio || 1;
          canvas.width = photoSize * ratio;
          canvas.height = photoSize * ratio;
          const context = canvas.getContext("2d");
          if (!context) return;

          // Cover-fit the square.
          const side = Math.min(image.width, image.height);
          context.drawImage(
            image,
            (image.width - side) / 2,
            (image.height - side) / 2,
            side,
            side,
            0,
            0,
            photoSize * ratio,
            photoSize * ratio
          );
          setHasPhoto(true);
        };
        image.src = url;
      } catch {
        // A missing photo is not worth interrupting the celebration for.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [photoPath, photoSize]);

  return (
    <div
      className="select-none rounded-[14px] bg-white p-[10px] shadow-[0_18px_50px_-12px_rgba(12,10,9,0.35)]"
      style={{ width }}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      {photoPath && (
        <canvas
          ref={canvasRef}
          className="block rounded-[8px] bg-[#f2f2f2]"
          style={{
            width: photoSize,
            height: photoSize,
            opacity: hasPhoto ? 1 : 0,
            transition: "opacity 400ms",
          }}
        />
      )}

      {/* Long single-word names ("Akosuaserwaabonsu") would wrap and burst the
          card, so the type steps down as the name grows. */}
      <p
        className="mt-2 font-roobert leading-tight tracking-[-0.03em] text-[#0c0a09]"
        style={{
          fontSize: Math.round(width * (name.length > 14 ? 0.082 : name.length > 10 ? 0.1 : 0.135)),
          overflowWrap: "anywhere",
        }}
      >
        {name} <span className="text-[#3398e1]">for Christ</span>
      </p>

      <p
        className="mt-1.5 font-medium uppercase tracking-[0.16em] text-[#a8a29e]"
        style={{ fontSize: Math.max(7, Math.round(width * 0.042)) }}
      >
        The Airport City Church
      </p>
    </div>
  );
}
