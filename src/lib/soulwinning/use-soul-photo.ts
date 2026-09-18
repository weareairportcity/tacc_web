"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, string>();

function isDirectPath(photoPath: string) {
  return (
    photoPath.startsWith("/") ||
    photoPath.startsWith("blob:") ||
    photoPath.startsWith("http://") ||
    photoPath.startsWith("https://")
  );
}

/** Resolves a storage path or a local/shots URL to something an <img> can load. */
export function useSoulPhoto(photoPath: string | null) {
  const [url, setUrl] = useState<string | null>(() => {
    if (!photoPath) return null;
    if (isDirectPath(photoPath)) return photoPath;
    return cache.get(photoPath) ?? null;
  });

  useEffect(() => {
    if (!photoPath) {
      setUrl(null);
      return;
    }
    if (isDirectPath(photoPath)) {
      setUrl(photoPath);
      return;
    }
    const cached = cache.get(photoPath);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/soulwinning/photo?path=${encodeURIComponent(photoPath)}`);
        if (!response.ok) return;
        const signed = (await response.json()) as { url?: string };
        if (!signed.url || cancelled) return;
        cache.set(photoPath, signed.url);
        setUrl(signed.url);
      } catch {
        // A missing photo just leaves the tile empty.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  return url;
}
