/**
 * What every public 1909 page shows now the outreach is over.
 *
 * Deliberately static: no Supabase reads, no polling, no realtime channel and
 * no service worker, so a projector or phone left open costs nothing.
 */
export function OutreachEnded() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#3ba6f1]">1909</p>
      <h1 className="mt-3 text-3xl font-semibold text-[#1c1917] sm:text-4xl">The outreach has ended</h1>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-[#78716c]">
        Thank you to everyone who went out and won souls for Christ. Logging and the live
        counter are now closed.
      </p>
    </main>
  );
}
