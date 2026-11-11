import type { Metadata } from "next";
import { LegalPage } from "@/components/camp/LegalPage";

export const metadata: Metadata = { title: "Cookies · Commune" };

const COOKIES: [string, string, string][] = [
  ["commune_attendee", "Keeps you signed in to your camp.", "Until 3 days after camp ends (at least 30 days)"],
  ["camp_leader", "Keeps a fellowship or PFCC leader signed in.", "Up to 30 days, or until signed out"],
  ["sb-…", "Keeps a coordinator signed in (Supabase).", "Until signed out"],
  ["commune_rl_…", "Counts tries, so no one can guess codes or flood texts.", "Up to an hour"],
  ["commune_join_…", "Remembers a friend's group link while you register.", "60 days"],
];

const STORED: [string, string][] = [
  ["commune.text", "Bigger text, if you turned it on."],
  ["cm_cookies_seen", "That you've seen the cookie notice."],
  ["cm_count_off", "“Don't count my visits”, if you chose it."],
  ["cm_seen_day", "The day this phone last told Commune you came, so it only tells it once a day."],
  ["commune.install", "That you closed the “Add to home screen” tip."],
  ["commune.people…, commune.scanMode", "Coordinators only: their filters and scan mode."],
];

/** Every cookie and stored setting Commune uses. All are needed for Commune to work or remember a choice; none are for advertising. */
export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookies"
      lead="Commune only uses cookies it needs to work: to keep you signed in, and to stop anyone guessing codes. None are for advertising, and none follow you to other sites."
    >
      <section>
        <h2>Cookies</h2>
        <div className="overflow-hidden rounded-2xl border border-stone-border bg-white">
          {COOKIES.map(([name, what, how]) => (
            <div key={name} className="flex flex-col gap-0.5 border-t border-stone-border px-4 py-3 first:border-t-0">
              <code className="text-[13px] font-medium">{name}</code>
              <span>{what}</span>
              <span className="text-[13px] text-warm-gray">{how}</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Settings kept on your phone</h2>
        <p>These never leave your phone.</p>
        <div className="overflow-hidden rounded-2xl border border-stone-border bg-white">
          {STORED.map(([name, what]) => (
            <div key={name} className="flex flex-col gap-0.5 border-t border-stone-border px-4 py-3 first:border-t-0">
              <code className="text-[13px] font-medium">{name}</code>
              <span>{what}</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Counting visits</h2>
        <p>
          Visits are counted without a cookie and without your name. How, and how to switch it off, is on the Privacy page.
        </p>
      </section>
    </LegalPage>
  );
}
