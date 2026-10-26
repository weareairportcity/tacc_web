import { cn } from "@/lib/utils";

/** The Commune mark: four heads, one in cyan, with an arm around them (public/commune-logo.svg). */
export function CommuneLogo({ size = 28, className, label = "Commune" }: { size?: number; className?: string; label?: string | null }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={cn("flex-none", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <rect width="48" height="48" rx="12" fill="#0c0a09" />
      <circle cx="11.5" cy="20" r="3.2" fill="#fff" />
      <circle cx="19.8" cy="16.5" r="3.2" fill="#fff" />
      <circle cx="28.2" cy="16.5" r="3.2" fill="#3ba6f1" />
      <circle cx="36.5" cy="20" r="3.2" fill="#fff" />
      <path d="M9 27.5Q24 40.5 39 27.5" fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" />
    </svg>
  );
}

const HEADS = [
  { cx: 11.5, cy: 20, fill: "#fff", delay: 0 },
  { cx: 19.8, cy: 16.5, fill: "#fff", delay: 120 },
  { cx: 28.2, cy: 16.5, fill: "#3ba6f1", delay: 240 },
  { cx: 36.5, cy: 20, fill: "#fff", delay: 360 },
];

/** The animated mark, for loading. Reduced motion shows the still logo. */
export function CommuneLoader({ size = 72, className, label = "Loading" }: { size?: number; className?: string; label?: string | null }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={cn("cm-loader flex-none", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <rect width="48" height="48" rx="12" fill="#0c0a09" />
      {HEADS.map((h) => {
        const head = <circle key={h.cx} className="cm-h" cx={h.cx} cy={h.cy} r="3.2" fill={h.fill} style={{ animationDelay: `${h.delay}ms` }} />;
        return h.fill === "#fff" ? head : <g key={h.cx} className="cm-n">{head}</g>;
      })}
      <path className="cm-a" pathLength={1} d="M9 27.5Q24 40.5 39 27.5" fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A button's label while its action runs: the logo animation and a short
 * "Saving…". The button itself must also be disabled, so it can't be pressed twice.
 */
export function Busy({ pending, text, size = 20, children }: { pending: boolean; text?: string; size?: number; children: React.ReactNode }) {
  if (!pending) return <>{children}</>;
  return (
    <>
      <CommuneLoader size={size} label={null} />
      <span>{text ?? children}</span>
    </>
  );
}

/** Full-screen loading state used by loading.tsx files. */
export function CommuneLoading({ text }: { text: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[60vh] flex-col items-center justify-center gap-5">
      <CommuneLoader label={null} />
      <span className="text-[15px] text-warm-gray">{text}</span>
    </div>
  );
}
