import Link from "next/link";
import { listPresence, type Presence } from "@/lib/camp/logs";
import { AdminPage } from "@/components/camp/AdminPage";
import { NoAccess, pageStaff } from "../access";

// Commune asks every 10 minutes while a tab is open, so 15 minutes means "open right now".
const ONLINE_MS = 15 * 60_000;

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

function splitOnline(people: Presence[], now = Date.now()) {
  const online = people.filter((p) => now - Date.parse(p.last_seen) < ONLINE_MS);
  return { online, rest: people.filter((p) => !online.includes(p)) };
}

const ROLE_WORD: Record<string, string> = { leader: "Leader", coordinator: "Coordinator", admin: "Admin" };

function Person({ p, online }: { p: Presence; online: boolean }) {
  return (
    <li className="flex items-start gap-3 border-t border-stone-border py-3 text-sm first:border-t-0">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${online ? "bg-st-paid" : p.signed_in_at ? "bg-stone-muted" : "border border-stone-muted"}`}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span>
          <Link href={`/admin/camp/logs?${new URLSearchParams({ who: p.actor })}`} className="font-medium hover:underline">
            {p.name}
          </Link>{" "}
          <span className="text-warm-gray">· {ROLE_WORD[p.role] ?? p.role}</span>
        </span>
        <span className="text-[13px] text-warm-gray">{[p.camp_name, p.place, p.device].filter(Boolean).join(" · ") || "—"}</span>
      </span>
      <span className="flex flex-col items-end text-[13px] tabular-nums">
        <span>{online ? "Online" : ago(p.last_seen)}</span>
        <span className="text-warm-gray">{p.signed_in_at ? `Signed in ${ago(p.signed_in_at)}` : "Signed out"}</span>
      </span>
    </li>
  );
}

/** Online: which coordinators and leaders have Commune open now, and when the rest were last in. Admins only. */
export default async function OnlinePage() {
  const me = await pageStaff("admin");
  if (!me) return <NoAccess />;
  const people = await listPresence();
  const { online, rest } = splitOnline(people);
  const list = (title: string, items: Presence[], isOnline: boolean, empty: string) => (
    <section className="flex flex-col gap-2">
      <h2 className="text-[15px] font-semibold">
        {title} <span className="font-normal text-warm-gray">· {items.length}</span>
      </h2>
      {items.length ? (
        <ul className="rounded-[10px] border border-stone-border bg-white px-4 shadow-seline-card sm:px-5">
          {items.map((p) => (
            <Person key={p.actor} p={p} online={isOnline} />
          ))}
        </ul>
      ) : (
        <p className="rounded-[10px] border border-stone-border bg-white px-4 py-3.5 text-[15px] text-warm-gray">{empty}</p>
      )}
    </section>
  );

  return (
    <AdminPage
      email={me.email}
      tab="online"
      title={
        <>
          Who&apos;s <span className="text-cyan-edge">online</span>
        </>
      }
      lead="Coordinators and leaders with Commune open in the last 15 minutes, then everyone seen in the last 30 days. A leader code shared by several leaders shows once."
    >
      {list("Online now", online, true, "No one has Commune open right now.")}
      {list("Earlier", rest, false, "No one else in the last 30 days.")}
    </AdminPage>
  );
}
