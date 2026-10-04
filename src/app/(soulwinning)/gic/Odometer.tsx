"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A rolling-digit counter.
 *
 * Each place is a strip of 0-9 shifted by a *continuous* position derived from
 * the animated value, so during the count-up the ones place spins while the
 * thousands place barely creeps — the way a real odometer behaves. Animating
 * the value rather than the digits gives both behaviours from one number:
 * the load count-up and every live increment during the event.
 */

const LOAD_MS = 1600;
const TICK_MS = 550;

/** Wide enough for every digit in the display face at any size, so the
 *  clipping window only ever cuts vertically (which is the point of an
 *  odometer) and never shaves the side of a glyph. */
const BOX_WIDTH = "0.72em";

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function useAnimatedValue(target: number): { value: number; bumped: boolean } {
  const [value, setValue] = useState(0);
  const [bumped, setBumped] = useState(false);

  const fromRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const isFirstRef = useRef(true);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;

    const isLoad = isFirstRef.current;
    isFirstRef.current = false;
    const duration = isLoad ? LOAD_MS : TICK_MS;
    const start = performance.now();

    // A live increment gets a brief pop; the load count-up does not need one.
    if (!isLoad && target > from) {
      setBumped(true);
      setTimeout(() => setBumped(false), 420);
    }

    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const next = from + (target - from) * easeOutCubic(progress);
      setValue(next);
      fromRef.current = next;

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
        setValue(target);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  return { value, bumped };
}

interface Props {
  value: number;
  className?: string;
  style?: React.CSSProperties;
  /** Digits below this are dimmed to nothing, so 0,042 reads as 42. */
  accentClassName?: string;
  /** Advance between digits. The clipping box is always wider than this; the
   *  tightening comes from a negative margin, so a glyph is never sliced. */
  digitWidth?: string;
}

export function Odometer({
  value: target,
  className,
  style,
  accentClassName,
  digitWidth = "0.58em",
}: Props) {
  const { value, bumped } = useAnimatedValue(target);

  const places = Math.max(String(Math.round(target)).length, 1);
  const shown = Math.floor(value);
  const significant = Math.max(String(shown).length, 1);

  const cells: React.ReactNode[] = [];

  for (let place = places - 1; place >= 0; place -= 1) {
    const magnitude = 10 ** place;
    const isVisible = place < significant;

    // Mechanical odometer behaviour. The ones wheel spins continuously; every
    // wheel above it sits still on its digit and only turns as the wheel below
    // rolls through 9 into 0. That matters because a wheel mapped continuously
    // parks between two digits at rest — a settled "12" would show the tens
    // wheel a fifth of the way past the 1.
    // Higher wheels stay on their digit until the last 1.0 of this place —
    // 399 must sit on a flat 3, not 90% of the way to 4 (which is what a
    // "start turning at .9" rule did, and why 199/299/399 looked staggered).
    const remainder = value % magnitude;
    const digit = Math.floor(value / magnitude) % 10;
    const carry = Math.max(0, remainder - (magnitude - 1));
    const position = digit + carry;

    cells.push(
      <span
        key={`d${place}`}
        className="relative inline-block overflow-hidden align-top transition-all duration-300"
        style={{
          height: "1.3em",
          // The box is the glyph's full advance so nothing is ever sliced;
          // tighter spacing is pulled in with a negative margin instead.
          // A hidden leading digit collapses to no width as well as no ink, so
          // the number does not sit off-centre for the whole count-up.
          width: isVisible ? BOX_WIDTH : "0em",
          marginRight: isVisible ? `calc(${digitWidth} - ${BOX_WIDTH})` : "0em",
          opacity: isVisible ? 1 : 0,
        }}
        aria-hidden
      >
        <span
          className="absolute inset-x-0 top-0 flex flex-col items-center"
          // Each strip cell is 1.3em to match the window, so the translate
          // steps by 1.3em per digit position.
          style={{ transform: `translateY(${-position * 1.3}em)` }}
        >
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((digit, index) => (
            <span
              key={index}
              className="block text-center"
              style={{ height: "1.3em", lineHeight: "1.3em" }}
            >
              {digit}
            </span>
          ))}
        </span>
      </span>
    );

    // Thousands separators, hidden until the number has grown past them.
    if (place > 0 && place % 3 === 0) {
      cells.push(
        <span
          key={`c${place}`}
          className="inline-block overflow-hidden align-top transition-all duration-300"
          style={{
            height: "1.3em",
            lineHeight: "1.3em",
            width: place < significant ? "0.3em" : "0em",
            opacity: place < significant ? 1 : 0,
          }}
          aria-hidden
        >
          ,
        </span>
      );
    }
  }

  return (
    <span
      className={`inline-flex items-center tabular-nums transition-transform duration-300 ${
        bumped ? "scale-[1.06]" : "scale-100"
      } ${className ?? ""} ${accentClassName ?? ""}`}
      style={style}
    >
      {/* Screen readers get the real number, not eleven stacked digits. */}
      <span className="sr-only">{target.toLocaleString()}</span>
      {cells}
    </span>
  );
}
