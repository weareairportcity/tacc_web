"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RosterPerson, ScanCounts, ScanMode } from "@/lib/camp/checkin";
import { scanRosterAction, syncScansAction } from "../../actions";

/**
 * Scanning with no signal. The phone keeps a copy of the list (names, rooms,
 * sizes, who's done; never phones or health notes) and the scans it couldn't
 * send, both in this browser's storage. When signal comes back the scans go
 * up with the time they happened, oldest first. A scan the server turns down
 * (cancelled, not your people, not a pass) shows up as a problem to look at.
 */

export type Queued = { key: string; target: string; id: string | null; mode: ScanMode; at: string; name: string | null };
export type Problem = { key: string; name: string | null; mode: ScanMode; error: string };

const ROSTER_EVERY = 5 * 60 * 1000;
const SEND_EVERY = 15 * 1000;
const PER_SEND = 25;

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

/** The registration id in a pass link's token (…?t=ID.SIGNATURE), or a bare id. The server checks the signature. */
export function idOf(target: string): string | null {
  const id = target.split(".")[0];
  return /^[0-9a-f-]{36}$/i.test(id) ? id.toLowerCase() : null;
}

const subscribe = (on: () => void) => {
  window.addEventListener("online", on);
  window.addEventListener("offline", on);
  return () => {
    window.removeEventListener("online", on);
    window.removeEventListener("offline", on);
  };
};

/** navigator.onLine, kept current. True on the server. */
export const useOnline = () =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

/** A failed fetch (no signal) rather than an answer from the server. */
export const isNetworkError = (err: unknown) => err instanceof TypeError || (err instanceof Error && /fetch|network|load failed/i.test(err.message));

export function useOfflineScans(campId: string, onSynced: (counts: ScanCounts, results: { name: string | null; mode: ScanMode; error: string | null }[]) => void) {
  const keys = { roster: `commune.roster.${campId}`, queue: `commune.scanQueue.${campId}`, problems: `commune.scanProblems.${campId}` };
  const online = useOnline();
  const [roster, setRoster] = useState<RosterPerson[]>([]);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const queueRef = useRef<Queued[]>([]);
  const synced = useRef(onSynced);
  useEffect(() => {
    synced.current = onSynced;
  });

  // What this phone kept last time comes back first.
  useEffect(() => {
    queueRef.current = read<Queued[]>(keys.queue, []);
    // Browser storage is only readable after the first render.
    setQueue(queueRef.current);
    setRoster(read<RosterPerson[]>(keys.roster, []));
    setProblems(read<Problem[]>(keys.problems, []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campId]);

  const saveQueue = useCallback(
    (next: Queued[]) => {
      queueRef.current = next;
      setQueue(next);
      write(keys.queue, next);
    },
    [keys.queue],
  );

  const saveRoster = useCallback(
    (update: (r: RosterPerson[]) => RosterPerson[]) =>
      setRoster((r) => {
        const next = update(r);
        write(keys.roster, next);
        return next;
      }),
    [keys.roster],
  );

  // A fresh copy of the list now and then, while there's signal.
  useEffect(() => {
    if (!online) return;
    let stop = false;
    const load = async () => {
      const r = await scanRosterAction(campId).catch(() => null);
      if (stop || !r?.ok) return;
      // Scans still waiting to go up stay marked on the fresh copy.
      const waiting = queueRef.current;
      saveRoster(() =>
        r.data.map((p) => {
          const mine = waiting.filter((q) => q.id === p.id);
          if (!mine.length) return p;
          return {
            ...p,
            checked_in_at: p.checked_in_at ?? mine.find((q) => q.mode === "checkin")?.at ?? null,
            shirt_given_at: p.shirt_given_at ?? mine.find((q) => q.mode === "shirt")?.at ?? null,
          };
        }),
      );
    };
    load();
    const timer = setInterval(load, ROSTER_EVERY);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [online, campId, saveRoster]);

  const send = useCallback(async () => {
    if (busy.current || !navigator.onLine || !queueRef.current.length) return;
    busy.current = true;
    setSending(true);
    try {
      while (queueRef.current.length && navigator.onLine) {
        const chunk = queueRef.current.slice(0, PER_SEND);
        const r = await syncScansAction(
          campId,
          chunk.map(({ key, target, mode, at }) => ({ key, target, mode, at })),
        );
        if (!r.ok) break;
        const byKey = new Map(chunk.map((q) => [q.key, q]));
        const done = new Set(r.data.results.map((x) => x.key));
        const failed = r.data.results.filter((x) => !x.ok);
        saveQueue(queueRef.current.filter((q) => !done.has(q.key)));
        if (failed.length) {
          setProblems((p) => {
            const next = [
              ...p,
              ...failed.map((x) => {
                const q = byKey.get(x.key);
                return { key: x.key, name: q?.name ?? null, mode: q?.mode ?? "checkin", error: "error" in x ? x.error : "" } as Problem;
              }),
            ].slice(-50);
            write(keys.problems, next);
            return next;
          });
          // Turned down: the phone's copy shouldn't say they're done.
          const undo = failed.map((x) => byKey.get(x.key)).filter((q): q is Queued => !!q?.id);
          saveRoster((list) =>
            list.map((p) => {
              const mine = undo.filter((q) => q.id === p.id);
              if (!mine.length) return p;
              return {
                ...p,
                checked_in_at: mine.some((q) => q.mode === "checkin") ? null : p.checked_in_at,
                shirt_given_at: mine.some((q) => q.mode === "shirt") ? null : p.shirt_given_at,
              };
            }),
          );
        }
        synced.current(
          r.data.counts,
          r.data.results.map((x) => ({ name: byKey.get(x.key)?.name ?? (x.ok ? x.name : null), mode: byKey.get(x.key)?.mode ?? "checkin", error: x.ok ? null : x.error })),
        );
      }
    } catch {
      // Still no signal: they stay on the phone for next time.
    } finally {
      busy.current = false;
      setSending(false);
    }
  }, [campId, saveQueue, saveRoster, keys.problems]);

  // Send as soon as signal is back, and keep trying while anything waits.
  useEffect(() => {
    if (!online) return;
    send();
    const timer = setInterval(send, SEND_EVERY);
    return () => clearInterval(timer);
  }, [online, send]);

  /** Keeps a scan on the phone. Returns who it is (if the phone's list knows) and whether they were already done. */
  const keep = useCallback(
    (target: string, mode: ScanMode) => {
      const id = idOf(target);
      const person = id ? (roster.find((p) => p.id === id) ?? null) : null;
      const doneAt = person && (mode === "checkin" ? person.checked_in_at : person.shirt_given_at);
      const queued = id ? queueRef.current.some((q) => q.id === id && q.mode === mode) : false;
      if (doneAt || queued) return { person, already: true as const, key: null };
      const key = crypto.randomUUID();
      const at = new Date().toISOString();
      saveQueue([...queueRef.current, { key, target, id, mode, at, name: person?.full_name ?? null }]);
      if (person) saveRoster((list) => list.map((p) => (p.id === person.id ? { ...p, [mode === "checkin" ? "checked_in_at" : "shirt_given_at"]: at } : p)));
      return { person, already: false as const, key };
    },
    [roster, saveQueue, saveRoster],
  );

  /** Undo for a scan that hasn't gone up yet: it's simply dropped. */
  const drop = useCallback(
    (key: string) => {
      const item = queueRef.current.find((q) => q.key === key);
      if (!item) return false;
      saveQueue(queueRef.current.filter((q) => q.key !== key));
      if (item.id) saveRoster((list) => list.map((p) => (p.id === item.id ? { ...p, [item.mode === "checkin" ? "checked_in_at" : "shirt_given_at"]: null } : p)));
      return true;
    },
    [saveQueue, saveRoster],
  );

  const clearProblems = useCallback(() => {
    setProblems([]);
    write(keys.problems, []);
  }, [keys.problems]);

  /** "No pass? Type their name", from the phone's copy. */
  const find = useCallback(
    (term: string) => {
      const q = term.trim().toLowerCase();
      if (q.length < 2) return [];
      return roster.filter((p) => p.status !== "cancelled" && p.full_name.toLowerCase().includes(q)).slice(0, 8);
    },
    [roster],
  );

  return { online, roster, queue, problems, sending, keep, drop, find, clearProblems, send };
}
