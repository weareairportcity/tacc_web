"use client";

import { Busy } from "@/components/camp/brand";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { titleClass } from "./ui";

/**
 * Every edit that isn't a table cell opens here: a side panel on wide
 * screens, a bottom sheet on phones (commune.css). A native <dialog>, so
 * focus stays inside, Escape closes it and focus goes back where it was.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.classList.remove("cm-closing");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.classList.add("cm-closing");
      dialog.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="cm-sheet"
      aria-labelledby="cm-sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the backdrop lands on the dialog itself.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <div className="flex h-full flex-col">
          <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 flex-none rounded-full bg-stone-muted sm:hidden" />
          <header className="flex flex-none items-start gap-3 border-b border-stone-border px-5 pb-4 pt-3 sm:px-6 sm:pt-5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 id="cm-sheet-title" className={cn(titleClass, "text-[22px]")}>
                {title}
              </h2>
              {subtitle && <p className="text-[13px] text-warm-gray">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="cm-press flex h-10 w-10 flex-none items-center justify-center rounded-full border border-stone-border bg-white"
            >
              <X className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
            </button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && (
            <footer className="flex flex-none items-center gap-2.5 border-t border-stone-border bg-white px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 sm:px-6">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}

/** "Are you sure?" inside a panel, for money and deletes only. Reversible things get Undo instead. */
export function InlineConfirm({
  question,
  detail,
  confirmLabel,
  onConfirm,
  onCancel,
  pending,
  primary = false,
}: {
  question: React.ReactNode;
  detail?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  primary?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.querySelector<HTMLButtonElement>("button[data-confirm]")?.focus(), []);
  return (
    <div ref={ref} role="alertdialog" aria-label="Confirm" className="cm-pop flex flex-col gap-3 rounded-[12px] border-2 border-soot p-4">
      <p className="text-[15px] font-semibold leading-snug">{question}</p>
      {detail && <p className="-mt-1.5 text-[13px] text-warm-gray">{detail}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={pending} className="cm-press h-11 rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
          Back
        </button>
        <button
          type="button"
          data-confirm
          onClick={onConfirm}
          disabled={pending}
          aria-busy={pending}
          className={cn(
            "cm-press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium disabled:opacity-60",
            primary ? "border border-cyan-edge bg-cyan-signal text-ink-black" : "bg-soot text-white",
          )}
        >
          <Busy pending={!!pending} text="Working…">{confirmLabel}</Busy>
        </button>
      </div>
    </div>
  );
}
