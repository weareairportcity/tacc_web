import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "1909 — Admin",
  robots: { index: false, follow: false },
};

/**
 * 1909's data stays in Supabase, which is restricted until its billing period
 * resets; the dashboard for it comes back once that data is reachable. Current
 * campaigns are run from the Cloudflare-backed admin at /gic/admin.
 */
export default function Admin1909() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#3ba6f1]">1909</p>
      <h1 className="mt-3 text-3xl font-semibold text-[#1c1917]">1909 has ended</h1>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-[#78716c]">
        The 1909 records are kept safe. Its dashboard returns once that data is available again.
      </p>
      <Link
        href="/gic/admin"
        className="mt-6 rounded-full bg-[#1c1917] px-5 py-2.5 text-sm font-medium text-white"
      >
        Open the Grace in Continuity dashboard
      </Link>
    </main>
  );
}
