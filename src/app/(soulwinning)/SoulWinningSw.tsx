"use client";

import { useSoulWinningServiceWorker } from "@/lib/soulwinning/register-sw";

/** Lives in the soul-winning layout so the hall screen and the field app both poll. */
export function SoulWinningSw() {
  useSoulWinningServiceWorker();
  return null;
}
