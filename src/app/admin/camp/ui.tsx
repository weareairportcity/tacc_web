import { cn } from "@/lib/utils";

/** Small shared pieces for the camp admin forms, in the admin portal's style. */

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-900";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50";

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-600">{children}</p>;
}

export const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  open: "bg-emerald-50 text-emerald-700",
  closed: "bg-amber-50 text-amber-700",
  archived: "bg-slate-100 text-slate-400",
};
