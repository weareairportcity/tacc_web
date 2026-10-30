"use client";

import { useSyncExternalStore } from "react";

const KEY = "commune.text";
const ATTR = "data-cm-text";

// Read before the first paint by the inline script in the camps layout, so pages don't jump.
export const biggerTextScript = `try{if(localStorage.getItem("${KEY}")==="big")document.documentElement.setAttribute("${ATTR}","big")}catch(e){}`;

const subscribe = (on: () => void) => {
  const watch = new MutationObserver(on);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });
  return () => watch.disconnect();
};

/** "Bigger text": everything one step larger, remembered on this phone. */
export function BiggerText() {
  const big = useSyncExternalStore(subscribe, () => document.documentElement.getAttribute(ATTR) === "big", () => false);
  return (
    <button
      type="button"
      aria-pressed={big}
      onClick={() => {
        const next = !big;
        if (next) document.documentElement.setAttribute(ATTR, "big");
        else document.documentElement.removeAttribute(ATTR);
        try {
          localStorage.setItem(KEY, next ? "big" : "normal");
        } catch {}
      }}
      className="cm-press inline-flex h-10 items-center gap-1.5 rounded-full border border-stone-border bg-white px-3.5 text-[13px] font-medium"
    >
      <span aria-hidden="true" className="font-display text-[15px] leading-none">
        A<span className="text-[19px]">A</span>
      </span>
      {big ? "Normal text" : "Bigger text"}
    </button>
  );
}
