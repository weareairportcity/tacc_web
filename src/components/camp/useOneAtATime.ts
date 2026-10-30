"use client";

import { useCallback, useRef, useTransition } from "react";

/**
 * useTransition, but a second tap while the first is still running does nothing. React marks
 * a transition pending only once it redraws, and on a slow phone a quick second tap lands
 * before that, so the action ran twice. This lock is taken on the first tap itself.
 */
export function useOneAtATime(): [boolean, (fn: () => void | Promise<void>) => void] {
  const [pending, start] = useTransition();
  const running = useRef(false);
  const run = useCallback((fn: () => void | Promise<void>) => {
    if (running.current) return;
    running.current = true;
    start(async () => {
      try {
        await fn();
      } finally {
        running.current = false;
      }
    });
  }, []);
  return [pending, run];
}
