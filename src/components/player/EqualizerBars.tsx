/** Three bouncing bars that say "this is playing". Respects reduced motion. */
export function EqualizerBars({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-flex h-3.5 items-end gap-[2px] ${className}`}>
      {[0, 0.25, 0.5].map((delay) => (
        <span
          key={delay}
          className="h-full w-[3px] origin-bottom rounded-full bg-current motion-safe:animate-[sotw-eq_0.9s_ease-in-out_infinite]"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}
