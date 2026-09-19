"use client";

import { useEffect, useState } from "react";

const SIGNED_TTL_MS = 45_000;
const MISS_TTL_MS = 45_000;

type CachedUrl = { url: string; expiresAt: number };

const urlCache = new Map<string, CachedUrl>();
const missUntil = new Map<string, number>();
const inflight = new Map<string, Promise<string | null>>();

function isDirectPath(photoPath: string) {
  return (
    photoPath.startsWith("/") ||
    photoPath.startsWith("blob:") ||
    photoPath.startsWith("http://") ||
    photoPath.startsWith("https://")
  );
}

/**
 * One in-flight request per storage path. The marquee repeats the same photo
 * dozens of times; without this, a missing object 404s once per tile.
 */
export function resolveSoulPhoto(photoPath: string): Promise<string | null> {
  if (isDirectPath(photoPath)) return Promise.resolve(photoPath);

  const now = Date.now();
  const cached = urlCache.get(photoPath);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.url);

  const blocked = missUntil.get(photoPath);
  if (blocked && blocked > now) return Promise.resolve(null);

  const pending = inflight.get(photoPath);
  if (pending) return pending;

  const request = (async () => {
    try {
      const response = await fetch(`/api/soulwinning/photo?path=${encodeURIComponent(photoPath)}`);
      if (response.status === 404) {
        missUntil.set(photoPath, Date.now() + MISS_TTL_MS);
        return null;
      }
      if (!response.ok) return null;
      const signed = (await response.json()) as { url?: string };
      if (!signed.url) return null;
      urlCache.set(photoPath, { url: signed.url, expiresAt: Date.now() + SIGNED_TTL_MS });
      missUntil.delete(photoPath);
      return signed.url;
    } catch {
      return null;
    } finally {
      inflight.delete(photoPath);
    }
  })();

  inflight.set(photoPath, request);
  return request;
}

/** Resolves a storage path or a local/shots URL to something an <img> can load. */
export function useSoulPhoto(photoPath: string | null) {
  const [url, setUrl] = useState<string | null>(() => {
    if (!photoPath) return null;
    if (isDirectPath(photoPath)) return photoPath;
    const cached = urlCache.get(photoPath);
    return cached && cached.expiresAt > Date.now() ? cached.url : null;
  });

  useEffect(() => {
    if (!photoPath) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    void resolveSoulPhoto(photoPath).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });

    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  return url;
}

/** Unique storage paths that already have a signed (or local) URL. */
export function useResolvedPhotoUrls(paths: string[]) {
  const unique = paths.filter(Boolean).filter((path, index, all) => all.indexOf(path) === index);
  const key = unique.join("\0");
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    if (unique.length === 0) {
      setUrls([]);
      return;
    }

    let cancelled = false;
    void Promise.all(unique.map(resolveSoulPhoto)).then((resolved) => {
      if (!cancelled) setUrls(resolved.filter((item): item is string => Boolean(item)));
    });

    return () => {
      cancelled = true;
    };
    // key is the stable fingerprint of `unique`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
