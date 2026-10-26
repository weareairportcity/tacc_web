"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Undo2, X } from "lucide-react";

/**
 * "Placed 4 in A03 · Undo". Every change ends in one of these, so nothing
 * succeeds silently. Plain notes go after 5 seconds, ones with an action
 * after 8; both pause while hovered or focused.
 */

type Toast = { id: number; message: string; tone: "ok" | "error"; action?: { label: string; run: () => void } };
type Show = (message: string, opts?: { action?: Toast["action"]; tone?: Toast["tone"] }) => void;

const ToastContext = createContext<Show>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback<Show>((message, opts = {}) => {
    const id = next.current++;
    // Newest last; at most three on screen.
    setToasts((all) => [...all.slice(-2), { id, message, tone: opts.tone ?? "ok", action: opts.action }]);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const ms = toast.action ? 8000 : 5000;
  const [paused, setPaused] = useState(false);
  const left = useRef(ms);
  const started = useRef(0);

  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const timer = setTimeout(onDone, left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started.current;
    };
  }, [paused, onDone]);

  const Icon = toast.tone === "error" ? CircleAlert : Check;
  return (
    <div
      className="cm-toast pointer-events-auto flex w-full max-w-[420px] flex-col overflow-hidden rounded-[14px] bg-soot text-white shadow-[0_12px_32px_rgba(12,10,9,0.28)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex items-center gap-3 py-2.5 pl-4 pr-2 text-sm">
        <Icon className="h-[18px] w-[18px] flex-none" strokeWidth={2} aria-hidden="true" />
        <span className="flex-1 py-1 leading-snug">{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action!.run();
              onDone();
            }}
            className="cm-press flex h-9 items-center gap-1.5 rounded-full border border-[#44403c] px-3.5 text-[13px] font-semibold"
          >
            <Undo2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {toast.action.label}
          </button>
        )}
        <button type="button" onClick={onDone} aria-label="Dismiss" className="flex h-9 w-9 items-center justify-center rounded-full text-ash-gray">
          <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
      <span className="cm-drain block h-0.5 bg-cyan-signal" style={{ animationDuration: `${ms}ms`, animationPlayState: paused ? "paused" : "running" }} />
    </div>
  );
}
