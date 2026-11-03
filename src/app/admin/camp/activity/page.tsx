import Link from "next/link";
import { getActivity, STATS_AREAS, type Count, type StatsArea } from "@/lib/camp/stats";
import { AdminPage } from "@/components/camp/AdminPage";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../access";

const AREA_WORD: Record<StatsArea, string> = { attendee: "Attendees", leader: "Leaders", coordinator: "Coordinators" };
const RANGES = [7, 30, 90];

// ─── Words ───────────────────────────────────────────────────────────────────

const SCREEN_WORDS: Record<string, string> = {
  "/": "Camps list",
  "/:camp": "Camp page",
  "/:camp/register": "Register",
  "/:camp/sign-in": "Sign in",
  "/:camp/me": "Their home",
  "/:camp/me/details": "Your details",
  "/:camp/roommates": "Roommates",
  "/:camp/paid": "After paying",
  "/:camp/calendar": "Add to calendar",
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/cookies": "Cookies",
  "/admin/camp": "All camps",
  "/admin/camp/sign-in": "Coordinator sign-in",
  "/admin/camp/staff": "Staff",
  "/admin/camp/logs": "Logs",
  "/admin/camp/online": "Online",
  "/admin/camp/activity": "Activity",
  "/admin/camp/guide": "Guide",
  "/leaders": "Leader sign-in",
  "/leaders/guide": "Leaders' guide",
};
const STAFF_WORDS: Record<string, string> = {
  "": "Today",
  "/people": "People",
  "/rooms": "Rooms",
  "/check-in": "Check-in",
  "/money": "Money",
  "/requests": "Requests",
  "/history": "History",
  "/feedback": "Feedback",
  "/settings": "Settings",
  "/more": "More",
  "/assign": "Assign",
  "/registrations": "Registrations",
  "/reconcile": "Reconcile",
};

function screenWords(screen: string) {
  if (SCREEN_WORDS[screen]) return SCREEN_WORDS[screen];
  const staff = screen.match(/^\/(admin|leaders)\/:camp(\/.*)?$/);
  if (staff) return STAFF_WORDS[staff[2] ?? ""] ?? (staff[2] ?? "").replace(/^\//, "");
  if (screen.startsWith("/:camp/pay/")) return "Pay link";
  if (screen.startsWith("/:camp/join")) return "Group link";
  if (screen.startsWith("/:camp/feedback")) return "Feedback form";
  return screen;
}

const regions = new Intl.DisplayNames(["en"], { type: "region" });
const languages = new Intl.DisplayNames(["en"], { type: "language" });
const safe = (f: () => string, fallback: string) => {
  try {
    return f() || fallback;
  } catch {
    return fallback;
  }
};
const country = (code: string) => (code ? safe(() => regions.of(code.toUpperCase()) ?? code, code) : "Unknown");
const language = (code: string) => (code ? safe(() => languages.of(code) ?? code, code) : "Unknown");
const ordered = (key: string) => key.replace(/^[a-z] · /, "");
const plain = (key: string) => key || "Unknown";

const seconds = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);
const minutes = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60_000).toFixed(1)} min`);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const num = (n: number) => n.toLocaleString("en-GB");

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] border border-stone-border bg-white p-4 shadow-seline-card">
      <span className="text-[13px] text-warm-gray">{label}</span>
      <span className="font-display text-[28px] leading-none tracking-[-0.02em] tabular-nums">{value}</span>
      {sub && <span className="text-[13px] text-warm-gray">{sub}</span>}
    </div>
  );
}

function Panel({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-[10px] border border-stone-border bg-white p-4 shadow-seline-card sm:p-5", className)}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {sub && <p className="text-[13px] leading-relaxed text-warm-gray">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/** A ranked list with a bar per row: what share each is of the total. */
function Bars({
  rows,
  label = plain,
  value,
  size = (c) => c.n,
  limit = 8,
  empty = "Nothing yet.",
}: {
  rows: Count[];
  label?: (k: string) => string;
  value?: (c: Count) => string;
  /** What the bar's length shows; the count unless said otherwise. */
  size?: (c: Count) => number;
  limit?: number;
  empty?: string;
}) {
  const shown = rows.slice(0, limit);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const top = Math.max(1, ...shown.map(size));
  if (!shown.length) return <p className="text-sm text-warm-gray">{empty}</p>;
  return (
    <ol className="flex flex-col gap-2">
      {shown.map((r) => (
        <li key={r.key} className="flex flex-col gap-1 text-sm">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{label(r.key)}</span>
            <span className="flex-none tabular-nums text-warm-gray">{value ? value(r) : `${num(r.n)} · ${pct(r.n, total)}`}</span>
          </span>
          <span aria-hidden="true" className="h-1.5 rounded-full bg-stone-canvas">
            <span className="block h-full rounded-full bg-cyan-signal" style={{ width: `${Math.max(2, (size(r) / top) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One bar per day. Hover or focus a bar for its day and number; the table under it says the same for screen readers. */
function DayBars({ rows, unit }: { rows: { day: string; n: number }[]; unit: string }) {
  const top = Math.max(1, ...rows.map((r) => r.n));
  const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="flex h-28 items-end gap-[2px]">
        {rows.map((r) => (
          <span key={r.day} title={`${label(r.day)}: ${num(r.n)} ${unit}`} className="group relative flex h-full flex-1 items-end">
            <span className="w-full rounded-t-[4px] bg-cyan-signal transition-[filter] group-hover:brightness-90" style={{ height: `${r.n ? Math.max(3, (r.n / top) * 100) : 0}%` }} />
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-between text-[12px] tabular-nums text-warm-gray">
        <span>{label(rows[0].day)}</span>
        <span>Most in a day: {num(Math.max(0, ...rows.map((r) => r.n)))}</span>
        <span>{label(rows.at(-1)!.day)}</span>
      </div>
      <table className="sr-only">
        <caption>{unit} per day</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <th scope="row">{label(r.day)}</th>
              <td>{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pills({ items, current, href }: { items: [string, string][]; current: string; href: (v: string) => string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(([v, l]) => (
        <Link
          key={v}
          href={href(v)}
          aria-current={v === current ? "true" : undefined}
          className={cn("cm-press inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium", v === current ? "bg-soot text-white" : "border border-stone-border bg-white")}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

/** Activity: how Commune is used, as totals. Admins only. */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await pageStaff("admin");
  if (!me) return <NoAccess />;
  const q = await searchParams;
  const days = RANGES.includes(Number(q.days)) ? Number(q.days) : 30;
  const area = (STATS_AREAS as string[]).includes(q.area) ? (q.area as StatsArea) : null;
  const a = await getActivity(days, area);
  const d = (dim: string) => a.dims[dim] ?? [];
  const one = (dim: string, key: string) => d(dim).find((c) => c.key === key);
  const visits = one("visits", "")?.n ?? 0;
  const visitMs = one("visits", "")?.ms ?? 0;
  const errors = d("errors").reduce((s, c) => s + c.n, 0);
  const href = (k: string, v: string) => `?${new URLSearchParams({ ...q, [k]: v })}`;
  const views = new Map(d("screen").map((c) => [c.key, c.n]));
  // Drop-off: of the times a screen was seen, how often the visit ended there.
  const exits = d("exit")
    .filter((c) => (views.get(c.key) ?? 0) >= 5)
    .map((c) => ({ ...c, share: c.n / (views.get(c.key) || 1) }));
  const speed = (key: string, label: string, good: string) => {
    const p = one("perf", key);
    const slow = one("slow", key)?.n ?? 0;
    return p && p.n ? { label, avg: p.ms / p.n, slow: pct(slow, p.n), good, n: p.n } : null;
  };
  const speeds = [
    speed("ttfb", "Server's first answer", "under 0.8 s"),
    speed("lcp", "First screen showing", "under 2.5 s"),
    speed("load", "Page fully loaded", "under 4 s"),
    speed("nav", "Changing screen", "under 1 s"),
    speed("tap", "A button's action", "under 1 s"),
  ].filter((s) => s !== null);
  const r = a.active.retention;
  const tapLabel = (key: string) => {
    const [screen, ...rest] = key.split(" · ");
    const what = rest.join(" · ");
    return `${screenWords(screen)} · ${what.startsWith("→ ") ? `link to ${screenWords(what.slice(2))}` : what}`;
  };

  return (
    <AdminPage
      email={me.email}
      tab="activity"
      title={
        <>
          <span className="text-cyan-edge">Activity</span>
        </>
      }
      lead="How Commune is used, as totals: no names. Each visit is sent when the phone puts Commune away, so the last few minutes may be missing."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pills items={[["", "Everyone"], ...STATS_AREAS.map((s) => [s, AREA_WORD[s]] as [string, string])]} current={area ?? ""} href={(v) => href("area", v)} />
        <Pills items={RANGES.map((n) => [String(n), `${n} days`] as [string, string])} current={String(days)} href={(v) => href("days", v)} />
      </div>
      {a.paused && (
        <p className="rounded-[12px] bg-cyan-tint px-4 py-3 text-[15px] leading-relaxed">
          Counting is paused until midnight (UTC): today is close to the free plan&apos;s daily limits, so Commune is keeping them for the camp itself.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Visits" value={num(visits)} sub={`in ${days} days`} />
        <Tile label="People today" value={num(a.active.today)} sub="signed in and used it" />
        <Tile label="People this month" value={num(a.active.month)} sub="last 30 days" />
        <Tile label="A visit lasts" value={visits ? minutes(visitMs / visits) : "—"} sub="on average" />
        <Tile label="Errors" value={num(errors)} sub={visits ? `${pct(errors, visits)} of visits` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Visits per day">
          <DayBars rows={a.visitsByDay} unit="visits" />
        </Panel>
        <Panel title="People who used it, per day" sub="Signed-in people only: attendees, leaders and coordinators.">
          <DayBars rows={a.active.byDay} unit="people" />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Coming back" sub="Of the people who first came in this range, how many came back within…" className="lg:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            {(["a day", "a week", "a month"] as const).map((w, i) => (
              <div key={w} className="flex flex-col gap-0.5">
                <span className="font-display text-[26px] leading-none tabular-nums">{pct(r.back[i], r.people[i])}</span>
                <span className="text-[13px] text-warm-gray">
                  {w} · {num(r.back[i])} of {num(r.people[i])}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[13px] leading-relaxed text-warm-gray">People whose first day was too recent to tell aren&apos;t counted yet.</p>
        </Panel>
        <Panel title="Stopped coming" sub="Came 31–60 days ago, not in the last 30.">
          <span className="font-display text-[26px] leading-none tabular-nums">{pct(a.active.churn.gone, a.active.churn.before)}</span>
          <span className="text-[13px] text-warm-gray">
            {num(a.active.churn.gone)} of {num(a.active.churn.before)} people. Normal once a camp is over.
          </span>
        </Panel>
      </div>

      <h2 className="pt-2 font-display text-[26px] tracking-[-0.01em]">Where they go</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Screens seen most">
          <Bars rows={d("screen")} label={screenWords} limit={10} />
        </Panel>
        <Panel title="Where visits end" sub="The screens most visits stop on, and how often people leave once they're there. A high share on a screen that isn't the end of a task is where people get stuck.">
          <Bars
            rows={exits.map((e) => ({ key: e.key, n: e.n, ms: Math.round(e.share * 100) }))}
            label={screenWords}
            value={(c) => `${num(c.n)} visits · ${c.ms}% leave here`}
            limit={8}
            empty="Not enough visits yet."
          />
        </Panel>
        <Panel title="Most common steps" sub="From one screen to the next.">
          <Bars rows={d("flow")} label={(k) => k.split(" → ").map(screenWords).join(" → ")} limit={10} />
        </Panel>
        <Panel title="First screen of a visit">
          <Bars rows={d("entry")} label={screenWords} limit={8} />
        </Panel>
        <Panel title="Buttons and links used most" sub="By screen. Buttons in lists (people's names) aren't counted.">
          <Bars rows={d("tap")} label={tapLabel} limit={12} />
        </Panel>
        <Panel title="Used least" sub="Buttons that were used, but rarely. Ones never pressed don't appear at all.">
          <Bars rows={[...d("tap")].reverse()} label={tapLabel} limit={8} />
        </Panel>
        <Panel title="How long a visit lasts">
          <Bars rows={[...d("length")].sort((x, y) => x.key.localeCompare(y.key))} label={ordered} limit={4} />
        </Panel>
        <Panel title="Screens per visit">
          <Bars rows={[...d("depth")].sort((x, y) => x.key.localeCompare(y.key))} label={ordered} limit={5} />
        </Panel>
        <Panel title="Time of day" sub="Ghana time.">
          <DayBarsHours rows={d("hour")} />
        </Panel>
        <Panel title="How they found it" sub="From ?src= on a link (add ?src=flyer to a QR code's link), or the site that sent them.">
          <Bars rows={d("src")} label={(k) => k || "Typed it, a text, or the home screen"} limit={8} />
        </Panel>
      </div>

      <h2 className="pt-2 font-display text-[26px] tracking-[-0.01em]">Who and on what</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Countries">
          <Bars rows={d("country")} label={country} limit={6} />
        </Panel>
        <Panel title="Towns" sub="From the internet connection, so roughly.">
          <Bars rows={d("city")} label={(k) => k.replace(/^, /, "Unknown, ")} limit={8} />
        </Panel>
        <Panel title="Network" sub="The company behind the connection.">
          <Bars rows={d("network")} limit={6} />
        </Panel>
        <Panel title="Kind of device">
          <Bars rows={d("device")} label={(k) => ({ phone: "Phone", tablet: "Tablet", computer: "Computer" })[k] ?? "Unknown"} limit={3} />
        </Panel>
        <Panel title="System">
          <Bars rows={d("os")} limit={8} />
        </Panel>
        <Panel title="Phone model" sub="Android phones on Chrome only; iPhones don't say.">
          <Bars rows={d("model")} limit={8} />
        </Panel>
        <Panel title="Browser">
          <Bars rows={d("browser")} limit={6} />
        </Panel>
        <Panel title="Language">
          <Bars rows={d("lang")} label={language} limit={6} />
        </Panel>
        <Panel title="Connection" sub="Android Chrome only. 4g is Chrome's guess at the speed, not the network.">
          <Bars rows={d("conn")} label={(k) => (k === "wifi" ? "Wi-Fi" : k || "Not known")} limit={5} />
        </Panel>
      </div>

      <h2 className="pt-2 font-display text-[26px] tracking-[-0.01em]">Speed and errors</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="How fast it feels" sub="Averages, and how often it was slow.">
          {speeds.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-[13px] text-warm-gray">
                <tr>
                  <th className="pb-2 font-normal">What</th>
                  <th className="pb-2 text-right font-normal">Average</th>
                  <th className="pb-2 text-right font-normal">Slow</th>
                </tr>
              </thead>
              <tbody>
                {speeds.map((s) => (
                  <tr key={s.label} className="border-t border-stone-border">
                    <td className="py-2">
                      {s.label}
                      <span className="block text-[12px] text-warm-gray">Good: {s.good}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{seconds(s.avg)}</td>
                    <td className="py-2 text-right tabular-nums">{s.slow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-warm-gray">Nothing yet.</p>
          )}
        </Panel>
        <Panel title="Slowest first screens" sub="How long the first screen of a visit took to show.">
          <Bars
            rows={[...d("lcp_screen")].filter((c) => c.n >= 3).sort((x, y) => y.ms / y.n - x.ms / x.n)}
            label={screenWords}
            value={(c) => `${seconds(c.ms / c.n)} · ${num(c.n)} visits`}
            size={(c) => c.ms / c.n}
            limit={8}
            empty="Not enough visits yet."
          />
        </Panel>
        <Panel title="Errors seen most">
          <Bars rows={d("error")} limit={8} empty="No errors. Good." />
        </Panel>
        <Panel title="Latest errors" sub="What broke, where, and on what. For whoever fixes Commune.">
          {a.recentErrors.length ? (
            <ol className="flex flex-col gap-2">
              {a.recentErrors.map((e, i) => (
                <li key={i} className="text-sm">
                  <details>
                    <summary className="cursor-pointer">
                      <span className="font-medium">{e.message}</span>
                      <span className="block text-[13px] text-warm-gray">
                        {[screenWords(e.screen), AREA_WORD[e.area as StatsArea], e.os, e.browser, new Date(e.at).toLocaleString("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" })]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </summary>
                    {e.stack && <pre className="mt-2 overflow-x-auto rounded-[8px] bg-stone-canvas p-3 text-[12px] leading-relaxed">{e.stack}</pre>}
                  </details>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-warm-gray">No errors. Good.</p>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}

/** Visits by hour of the day, 00–23. */
function DayBarsHours({ rows }: { rows: Count[] }) {
  const byHour = new Map(rows.map((r) => [r.key, r.n]));
  const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
  const top = Math.max(1, ...hours.map((h) => byHour.get(h) ?? 0));
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="flex h-20 items-end gap-[2px]">
        {hours.map((h) => (
          <span key={h} title={`${h}:00 · ${num(byHour.get(h) ?? 0)} visits`} className="flex h-full flex-1 items-end">
            <span className="w-full rounded-t-[4px] bg-cyan-signal" style={{ height: `${byHour.get(h) ? Math.max(3, ((byHour.get(h) ?? 0) / top) * 100) : 0}%` }} />
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-between text-[12px] tabular-nums text-warm-gray">
        <span>Midnight</span>
        <span>Noon</span>
        <span>11 pm</span>
      </div>
      <table className="sr-only">
        <caption>Visits by hour</caption>
        <tbody>
          {hours.map((h) => (
            <tr key={h}>
              <th scope="row">{h}:00</th>
              <td>{byHour.get(h) ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
