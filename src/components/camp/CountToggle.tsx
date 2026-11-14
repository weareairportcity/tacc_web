"use client";

import { useEffect, useState } from "react";
import { COUNT_OFF_KEY } from "./Collector";

/** "Don't count my visits", remembered on this phone. */
export function CountToggle() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    try {
      setOff(localStorage.getItem(COUNT_OFF_KEY) === "1");
    } catch {
      setOff(false);
    }
  }, []);
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-stone-border bg-white px-4 py-3">
      <input
        type="checkbox"
        className="h-5 w-5 accent-cyan-edge"
        checked={off}
        onChange={(e) => {
          try {
            if (e.target.checked) localStorage.setItem(COUNT_OFF_KEY, "1");
            else localStorage.removeItem(COUNT_OFF_KEY);
          } catch {
            // No storage here: visits from this browser can't be remembered either way.
          }
          setOff(e.target.checked);
        }}
      />
      <span className="flex flex-col">
        <span className="font-medium">Don&apos;t count my visits</span>
        <span className="text-[13px] text-warm-gray">On this phone or computer. Signing in and the camp itself work the same.</span>
      </span>
    </label>
  );
}
