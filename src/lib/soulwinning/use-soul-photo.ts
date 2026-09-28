"use client";

import { useMemo } from "react";

/**
 * Campaign photos arrive already signed: the live feed and the admin actions
 * hand out expiring links from the Cloudflare API, and the screenshot pages use
 * local files. Anything else (a bare storage path from 1909's Supabase era) has
 * nothing left to resolve it, so it shows as no photo.
 */
function isDirectPath(photoPath: string) {
  return (
    photoPath.startsWith("/") ||
    photoPath.startsWith("blob:") ||
    photoPath.startsWith("http://") ||
    photoPath.startsWith("https://")
  );
}

export function resolveSoulPhoto(photoPath: string): Promise<string | null> {
  return Promise.resolve(isDirectPath(photoPath) ? photoPath : null);
}

/** A storage link or local/shots URL an <img> can load, or null. */
export function useSoulPhoto(photoPath: string | null) {
  return photoPath && isDirectPath(photoPath) ? photoPath : null;
}

/** Loadable, de-duplicated links for the marquee. */
export function useResolvedPhotoUrls(paths: string[]) {
  return useMemo(() => [...new Set(paths.filter(isDirectPath))], [paths]);
}
