"use client";
import { leaveTo } from "@/components/camp/leave";

import { Busy } from "@/components/camp/brand";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, CreditCard, Download, MessageSquare, Search, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import type { RegistrationStatus } from "@/lib/camp/types";
import { Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Legend, RegistrationStatus as Status, StackedBar, headlineClass, inputClass, primaryButtonClass, statusParts } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { deleteViewAction, openPaymentsForAction, payForPeopleAction, saveViewAction, textPeopleAction } from "../../actions";
import type { OpenPayment } from "@/lib/camp/payments";
import { Blockers } from "../OpenPayments";
import { PersonPanel } from "./PersonPanel";

export type PersonListRow = {
  id: string;
  full_name: string;
  fellowship: string;
  status: RegistrationStatus;
  /** Room label, "In a group", "Any room", or null. */
  room: string | null;
  placed: boolean;
  /** Latest payment, else registration time: the default sort. */
  last: string | null;
  // Coordinators only:
  phone?: string;
  pfcc?: string;
  gender?: string;
  room_type?: string;
  price?: number;
  paid?: number;
  checked_in?: boolean;
  last_paid?: number | null;
  registered?: string;
};

type Filters = {
  q: string;
  status: string;
  pfcc: string;
  fellowship: string;
  room_type: string;
  gender: string;
  room: string;
  checkin: string;
  sort: string;
};
const EMPTY: Filters = { q: "", status: "", pfcc: "", fellowship: "", room_type: "", gender: "", room: "", checkin: "", sort: "" };
const KEYS = Object.keys(EMPTY) as (keyof Filters)[];

const PAYMENT: [string, string][] = [
  ["outstanding", "Outstanding"],
  ["fully_paid", "Fully paid"],
  ["partially_paid", "Part paid"],
  ["registered", "Nothing paid"],
  ["cancelled", "Cancelled"],
];
const SORTS: [string, string][] = [
  ["", "Latest payment first"],
  ["name", "Name, A–Z"],
  ["outstanding", "Most outstanding"],
];

const toQuery = (f: Filters) => {
  const p = new URLSearchParams();
  for (const k of KEYS) if (f[k]) p.set(k, f[k]);
  return p.toString();
};
const fromQuery = (q: string): Filters => {
  const p = new URLSearchParams(q);
  return Object.fromEntries(KEYS.map((k) => [k, p.get(k) ?? ""])) as Filters;
};

const outstandingOf = (r: PersonListRow) => (r.status === "cancelled" ? 0 : (r.price ?? 0) - (r.paid ?? 0));

function matches(r: PersonListRow, f: Filters) {
  const on = (k: keyof Filters) => f[k];
  if (on("q")) {
    const q = f.q.toLowerCase();
    const digits = f.q.replace(/\D/g, "").replace(/^0/, "");
    if (!r.full_name.toLowerCase().includes(q) && !(digits.length >= 3 && r.phone?.includes(digits))) return false;
  }
  if (on("status")) {
    if (f.status === "outstanding" ? r.status !== "registered" && r.status !== "partially_paid" : r.status !== f.status) return false;
  }
  if (on("fellowship") && r.fellowship !== f.fellowship) return false;
  if (on("pfcc") && r.pfcc !== f.pfcc) return false;
  if (on("room_type") && r.room_type !== f.room_type) return false;
  if (on("gender") && r.gender !== f.gender) return false;
  if (on("room") && (f.room === "placed" ? !r.placed : r.placed || r.status !== "fully_paid")) return false;
  if (on("checkin") && (f.checkin === "in" ? !r.checked_in : r.checked_in || r.status === "cancelled")) return false;
  return true;
}

function sortRows(rows: PersonListRow[], sort: string) {
  const out = [...rows];
  if (sort === "name") return out.sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (sort === "outstanding") return out.sort((a, b) => outstandingOf(b) - outstandingOf(a) || a.full_name.localeCompare(b.full_name));
  // Whoever paid most recently first, then people who haven't paid, newest first.
  // Leaders' rows carry no payment times; they arrive already in this order.
  return out.sort((a, b) => Number(b.last_paid != null) - Number(a.last_paid != null) || (b.last ?? "").localeCompare(a.last ?? ""));
}

function since(iso: string | null | undefined) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso.endsWith("Z") ? iso : `${iso}Z`)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function PeopleView({
  campId,
  leader,
  scopeName,
  rows,
  roomTypes,
  pfccs,
  views: initialViews,
  initialQuery,
}: {
  campId: string;
  leader: boolean;
  scopeName: string | null;
  rows: PersonListRow[];
  roomTypes: string[];
  pfccs: { pfcc: string; fellowships: string[] }[];
  views: { id: string; name: string; query: string }[];
  /** The URL's query string, so the first render (server and browser) matches. */
  initialQuery: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const storageKey = `commune.people.${campId}`;
  const [filters, setFilters] = useState<Filters>(() => fromQuery(initialQuery));
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [person, setPerson] = useState<string | null>(() => new URLSearchParams(initialQuery).get("person"));
  // "Find a person" in the top bar can open someone while this page is already showing.
  const urlPerson = useSearchParams().get("person");
  const [seenUrlPerson, setSeenUrlPerson] = useState(urlPerson);
  if (urlPerson !== seenUrlPerson) {
    setSeenUrlPerson(urlPerson);
    if (urlPerson) setPerson(urlPerson);
  }
  const [sheet, setSheet] = useState<"filters" | "pay" | "text" | null>(null);
  const [views, setViews] = useState(initialViews);
  const searchRef = useRef<HTMLInputElement>(null);

  // The URL wins; with nothing in it, the last filters used on this device come back.
  useEffect(() => {
    const fromUrl = fromQuery(initialQuery);
    if (!KEYS.some((k) => fromUrl[k])) {
      let saved = "";
      try {
        saved = localStorage.getItem(storageKey) ?? "";
      } catch {}
      // Reading browser storage is the one thing the server can't do for the first render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setFilters(fromQuery(saved));
    }
    setReady(true);
    if (new URLSearchParams(initialQuery).get("focus") === "search") searchRef.current?.focus();
  }, [storageKey, initialQuery]);

  // Every change goes into the URL (shareable) and is remembered on this device.
  useEffect(() => {
    if (!ready) return;
    const query = toQuery(filters);
    const params = new URLSearchParams(query);
    if (person) params.set("person", person);
    const text = params.toString();
    window.history.replaceState(null, "", text ? `?${text}` : window.location.pathname);
    try {
      localStorage.setItem(storageKey, query);
    } catch {}
  }, [filters, person, ready, storageKey]);

  /** Picking a fellowship picks its PFCC too; picking another PFCC drops a fellowship outside it. */
  const set = (key: keyof Filters, value: string) =>
    setFilters((f) => {
      const next = { ...f, [key]: f[key] === value ? "" : value };
      if (key === "fellowship" && next.fellowship) next.pfcc = pfccs.find((g) => g.fellowships.includes(next.fellowship))?.pfcc ?? next.pfcc;
      if (key === "pfcc" && next.fellowship && !pfccs.find((g) => g.pfcc === next.pfcc)?.fellowships.includes(next.fellowship)) next.fellowship = "";
      return next;
    });

  const shown = useMemo(() => sortRows(rows.filter((r) => matches(r, filters)), filters.sort), [rows, filters]);
  /** How many an option would show, given the other filters. Fellowship and PFCC replace each other. */
  const count = (key: keyof Filters, value: string) => {
    const f = { ...filters, [key]: value };
    if (key === "fellowship") f.pfcc = "";
    if (key === "pfcc") f.fellowship = "";
    return rows.filter((r) => matches(r, f)).length;
  };
  const pickPfcc = (pfcc: string) =>
    setFilters((f) => (f.pfcc === pfcc && !f.fellowship ? { ...f, pfcc: "", fellowship: "" } : { ...f, pfcc, fellowship: "" }));
  const active = KEYS.filter((k) => k !== "q" && k !== "sort" && filters[k]).length;
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of shown) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [shown]);
  const outstanding = shown.reduce((n, r) => n + outstandingOf(r), 0);
  const picked = rows.filter((r) => selected.has(r.id));
  const pickedOwing = picked.filter((r) => outstandingOf(r) > 0);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShownPicked = shown.length > 0 && shown.every((r) => selected.has(r.id));

  const menus: { key: keyof Filters; label: string; options: [string, string][]; groups?: { title: string; pfcc: string; options: [string, string][] }[] }[] = [
    { key: "status", label: "Payment", options: PAYMENT },
    {
      key: "fellowship",
      label: "Fellowship",
      options: [],
      // Leaders only see the fellowships in their own group.
      groups: pfccs
        .map((g) => ({ title: g.pfcc, pfcc: g.pfcc, options: g.fellowships.filter((n) => !leader || rows.some((r) => r.fellowship === n)).map((n) => [n, n] as [string, string]) }))
        .filter((g) => !leader || g.options.length > 0),
    },
    ...(leader
      ? []
      : [
          { key: "room_type" as const, label: "Room type", options: roomTypes.map((t) => [t, t] as [string, string]) },
          { key: "gender" as const, label: "Gender", options: [["female", "Women"], ["male", "Men"]] as [string, string][] },
          { key: "room" as const, label: "Room", options: [["placed", "In a room"], ["waiting", "Waiting for a room"]] as [string, string][] },
          { key: "checkin" as const, label: "Check-in", options: [["in", "Arrived"], ["out", "Not arrived"]] as [string, string][] },
        ]),
  ];
  const labelOf = (key: keyof Filters) => {
    const menu = menus.find((m) => m.key === key);
    return menu?.options.find(([v]) => v === filters[key])?.[1] ?? filters[key];
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={`${headlineClass} text-[34px]`}>{leader && scopeName ? scopeName : "People"}</h1>
        <div className="flex gap-2">
          <ViewsMenu
            views={views}
            current={toQuery({ ...filters, q: "" })}
            onApply={(q) => setFilters(fromQuery(q))}
            onSave={async (name) => {
              const r = await saveViewAction(campId, name, toQuery({ ...filters, q: "" }));
              if (!r.ok) return toast(r.error, { tone: "error" });
              setViews((v) => [...v.filter((x) => x.name !== r.data.name), { id: crypto.randomUUID(), ...r.data }].sort((a, b) => a.name.localeCompare(b.name)));
              toast(`Saved “${r.data.name}”`);
              router.refresh();
            }}
            onDelete={async (view) => {
              const r = await deleteViewAction(view.id);
              if (!r.ok) return toast(r.error, { tone: "error" });
              setViews((v) => v.filter((x) => x.id !== view.id));
              toast(`Removed “${view.name}”`);
            }}
          />
          <a
            href={`/admin/camp/${campId}/${leader ? "people" : "registrations"}/export?${toQuery(filters)}`}
            className="cm-press hidden h-10 items-center gap-2 rounded-full border border-stone-border bg-white px-4 text-sm font-medium sm:inline-flex"
          >
            <Download className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Download
          </a>
        </div>
      </header>

      {leader && (
        <section className="cm-rise flex flex-col gap-3.5 rounded-2xl bg-white p-5 shadow-seline-hero">
          <span className="flex items-baseline gap-3">
            <span className="font-display text-[44px] leading-none tracking-[-0.03em] tabular-nums">
              {rows.filter((r) => r.status === "fully_paid").length} of {rows.filter((r) => r.status !== "cancelled").length}
            </span>
            <span className="text-[15px] text-warm-gray">fully paid</span>
          </span>
          <StackedBar parts={statusParts(Object.fromEntries(["fully_paid", "partially_paid", "registered"].map((s) => [s, rows.filter((r) => r.status === s).length])), false)} />
          <Legend parts={statusParts(Object.fromEntries(["fully_paid", "partially_paid", "registered"].map((s) => [s, rows.filter((r) => r.status === s).length])), false)} />
        </section>
      )}

      <div className="flex flex-col gap-2.5">
        <label className="relative flex">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-warm-gray" strokeWidth={1.6} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder={leader ? "Search by name" : "Search by name or phone"}
            aria-label="Search people"
            className={`${inputClass} pl-10`}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSheet("filters")}
            className={cn(
              "cm-press inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium sm:hidden",
              active ? "bg-soot text-white" : "border border-stone-border bg-white",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
            Filters{active ? ` · ${active}` : ""}
          </button>
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            {menus.map((m) => (
              <FilterMenu
                key={m.key}
                label={m.label}
                value={filters[m.key] ? (m.key === "fellowship" ? filters.fellowship : labelOf(m.key)) : m.key === "fellowship" && filters.pfcc ? filters.pfcc : ""}
                onClear={() => setFilters((f) => ({ ...f, [m.key]: "", ...(m.key === "fellowship" ? { pfcc: "" } : {}) }))}
              >
                <FilterOptions menu={m} filters={filters} set={set} count={count} pickPfcc={pickPfcc} />
              </FilterMenu>
            ))}
            {active > 0 && (
              <button type="button" onClick={() => setFilters((f) => ({ ...EMPTY, q: f.q, sort: f.sort }))} className="h-9 px-2 text-[13px] text-warm-gray underline underline-offset-[3px]">
                Clear
              </button>
            )}
          </div>
          <label className="ml-auto flex items-center gap-2 text-[13px] text-warm-gray">
            <span className="max-sm:sr-only">Sort</span>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
              className="h-10 rounded-full border border-stone-border bg-white px-3 text-[13px] text-ink-black"
            >
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p role="status" className="text-sm">
        <strong className="font-semibold">
          {shown.length} {shown.length === 1 ? "person" : "people"}
        </strong>
        {outstanding > 0 && <span className="text-warm-gray"> · {formatCedis(outstanding)} outstanding</span>}
      </p>
      {shown.length > 0 && (
        <div className="-mt-2 flex flex-col gap-2">
          <StackedBar parts={statusParts(statusCounts)} className="h-1.5" />
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-6 text-center text-[15px] text-warm-gray">
          {rows.length ? "Nobody matches these filters." : "Nobody has registered yet."}
        </p>
      ) : (
        <section className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
          <table className="w-full border-collapse text-sm">
            <thead className="max-sm:sr-only">
              <tr className="text-left text-xs text-warm-gray">
                {!leader && (
                  <th className="w-10 py-3 pl-4">
                    <input
                      type="checkbox"
                      aria-label={allShownPicked ? "Unselect everyone shown" : "Select everyone shown"}
                      checked={allShownPicked}
                      onChange={() => setSelected(allShownPicked ? new Set() : new Set(shown.map((r) => r.id)))}
                      className="h-[18px] w-[18px] accent-soot"
                    />
                  </th>
                )}
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium max-md:hidden">{leader ? "Fellowship" : "Fellowship · room type"}</th>
                <th className="px-3 py-3 font-medium max-sm:hidden">Payment</th>
                {leader ? <th className="px-3 py-3 text-right font-medium max-sm:hidden">Paid</th> : <th className="px-3 py-3 font-medium max-lg:hidden">Room</th>}
                <th className="py-3 pl-3 pr-4 text-right font-medium">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 400).map((r) => {
                const on = selected.has(r.id);
                const out = outstandingOf(r);
                return (
                  <tr
                    key={r.id}
                    className={cn("border-t border-stone-border first:border-t-0 sm:first:border-t", on ? "bg-cyan-tint" : "cm-row", !leader && "cursor-pointer")}
                    onClick={(e) => {
                      if (leader || (e.target as HTMLElement).closest("input,a,button")) return;
                      setPerson(r.id);
                    }}
                  >
                    {!leader && (
                      <td className="w-10 py-3 pl-4 align-middle">
                        <input type="checkbox" aria-label={`Select ${r.full_name}`} checked={on} onChange={() => toggle(r.id)} className="h-5 w-5 accent-soot sm:h-[18px] sm:w-[18px]" />
                      </td>
                    )}
                    <td className="px-3 py-3">
                      {leader ? (
                        <span className="font-medium">{r.full_name}</span>
                      ) : (
                        <button type="button" onClick={() => setPerson(r.id)} className="text-left font-medium hover:text-cyan-deep">
                          {r.full_name}
                        </button>
                      )}
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-warm-gray">
                        <span className="sm:hidden">
                          <Status status={r.status} />
                        </span>
                        <span className="max-sm:hidden">
                          {r.last_paid ? `Paid ${formatCedis(r.last_paid).replace(/\.00$/, "")} · ${since(r.last)}` : r.registered ? `Registered ${since(r.registered)}` : ""}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#57534e] max-md:hidden">{leader ? r.fellowship : `${r.fellowship} · ${r.room_type}`}</td>
                    <td className="px-3 py-3 max-sm:hidden">
                      <Status status={r.status} />
                    </td>
                    {leader ? (
                      <td className="px-3 py-3 text-right tabular-nums max-sm:hidden">{formatCedis(r.paid ?? 0)}</td>
                    ) : (
                      <td className="px-3 py-3 text-[#57534e] max-lg:hidden">
                        <span className="inline-flex items-center gap-1.5">
                          {r.checked_in && <span className="h-2 w-2 rounded-full bg-st-paid" role="img" aria-label="Arrived" />}
                          {r.room ?? <span className="text-ash-gray">—</span>}
                        </span>
                      </td>
                    )}
                    <td className={cn("py-3 pl-3 pr-4 text-right tabular-nums", out ? "font-semibold" : "text-ash-gray")}>{out ? formatCedis(out) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length > 400 && <p className="border-t border-stone-border p-3 text-center text-[13px] text-warm-gray">Showing 400. Search or filter to see the rest.</p>}
        </section>
      )}

      {picked.length > 0 && (
        <div
          role="region"
          data-selection-bar
          aria-label={`${picked.length} selected`}
          className="cm-up sticky bottom-[calc(96px+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-2 self-center rounded-[28px] bg-soot py-2 pl-5 pr-2 text-sm text-white shadow-[0_12px_32px_rgba(12,10,9,0.28)] lg:bottom-5"
        >
          <span className="mr-1">
            <strong className="font-semibold">{picked.length} selected</strong>
            {pickedOwing.length > 0 && <span className="text-stone-muted"> · {formatCedis(pickedOwing.reduce((n, r) => n + outstandingOf(r), 0))}</span>}
          </span>
          {pickedOwing.length > 0 && (
            <button type="button" onClick={() => setSheet("pay")} className={`${primaryButtonClass} h-10 px-4 text-sm`}>
              <CreditCard className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Pay for them
            </button>
          )}
          <button type="button" onClick={() => setSheet("text")} className="cm-press inline-flex h-10 items-center gap-2 rounded-full border border-[#44403c] px-4 font-medium">
            <MessageSquare className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Text them
          </button>
          <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="flex h-10 w-10 items-center justify-center rounded-full text-stone-muted">
            <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      )}

      <Sheet
        open={sheet === "filters"}
        onClose={() => setSheet(null)}
        title="Filters"
        footer={
          <>
            <button type="button" onClick={() => setFilters((f) => ({ ...EMPTY, q: f.q, sort: f.sort }))} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
              Clear
            </button>
            <button type="button" onClick={() => setSheet(null)} className="cm-press h-12 flex-1 rounded-full bg-soot px-5 text-sm font-medium text-white">
              Show {shown.length} {shown.length === 1 ? "person" : "people"}
            </button>
          </>
        }
      >
        {menus.map((m) => (
          <section key={m.key} className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold">{m.label}</h3>
            <FilterOptions menu={m} filters={filters} set={set} count={count} pickPfcc={pickPfcc} pills />
          </section>
        ))}
      </Sheet>

      {!leader && (
        <>
          <PaySheet open={sheet === "pay"} onClose={() => setSheet(null)} campId={campId} people={pickedOwing} />
          <TextSheet
            open={sheet === "text"}
            onClose={() => setSheet(null)}
            campId={campId}
            people={picked}
            onSent={(n) => {
              setSheet(null);
              toast(`Texted ${n} ${n === 1 ? "person" : "people"}`);
            }}
          />
          <PersonPanel key={person ?? "none"} campId={campId} id={person} onClose={() => setPerson(null)} onChanged={() => router.refresh()} />
        </>
      )}
    </div>
  );
}

type Menu = { key: keyof Filters; label: string; options: [string, string][]; groups?: { title: string; pfcc: string; options: [string, string][] }[] };

function FilterOptions({
  menu,
  filters,
  set,
  count,
  pickPfcc,
  pills,
}: {
  menu: Menu;
  filters: Filters;
  set: (key: keyof Filters, value: string) => void;
  count: (key: keyof Filters, value: string) => number;
  pickPfcc: (pfcc: string) => void;
  pills?: boolean;
}) {
  if (menu.groups) {
    return (
      <div className="flex flex-col">
        {menu.groups.map((g) => (
          <div key={g.pfcc} className="flex flex-col">
            <Option label={`All of ${g.title}`} n={count("pfcc", g.pfcc)} on={filters.pfcc === g.pfcc && !filters.fellowship} onClick={() => pickPfcc(g.pfcc)} />
            {g.options.map(([v, l]) => (
              <Option key={v} label={l} n={count("fellowship", v)} on={filters.fellowship === v} onClick={() => set("fellowship", v)} indent />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (pills) {
    return (
      <div className="flex flex-wrap gap-2">
        {menu.options.map(([v, l]) => {
          const on = filters[menu.key] === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => set(menu.key, v)}
              className={cn("cm-press h-10 rounded-full border px-4 text-sm", on ? "border-soot bg-soot text-white" : "border-stone-border bg-white")}
            >
              {l} <span className={on ? "text-stone-muted" : "text-warm-gray"}>{count(menu.key, v)}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {menu.options.map(([v, l]) => (
        <Option key={v} label={l} n={count(menu.key, v)} on={filters[menu.key] === v} onClick={() => set(menu.key, v)} />
      ))}
    </div>
  );
}

function Option({ label, n, on, onClick, indent }: { label: string; n: number; on: boolean; onClick: () => void; indent?: boolean }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      onClick={onClick}
      className={cn("cm-hover flex min-h-10 items-center gap-2.5 rounded-[8px] px-2.5 text-left text-sm", indent && "pl-7", on && "font-semibold")}
    >
      <span className={cn("flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border", on ? "border-soot bg-soot" : "border-stone-muted")}>
        {on && <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden="true" />}
      </span>
      <span className="flex-1">{label}</span>
      <span className="text-xs tabular-nums text-warm-gray">{n}</span>
    </button>
  );
}

/** A chip that opens a small menu under it. Applies as you pick; closes on outside click or Escape. */
function FilterMenu({ label, value, onClear, children }: { label: string; value: string; onClear: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <span className={cn("flex h-9 items-center rounded-full border text-[13px] font-medium", value ? "border-soot bg-soot text-white" : "border-stone-border bg-white")}>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-full items-center gap-1.5 pl-3.5 pr-2.5">
          {value || label}
          {!value && <ChevronDown className="h-3.5 w-3.5 text-warm-gray" strokeWidth={1.8} aria-hidden="true" />}
        </button>
        {value && (
          <button type="button" onClick={onClear} aria-label={`Clear ${label}`} className="flex h-full items-center pr-3 text-stone-muted">
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </span>
      {open && (
        <div role="menu" className="cm-pop absolute left-0 top-11 z-30 max-h-[60vh] w-72 origin-top-left overflow-y-auto rounded-[12px] border border-stone-border bg-white p-1.5 shadow-[0_16px_40px_rgba(17,12,46,0.14)]">
          {children}
        </div>
      )}
    </div>
  );
}

function ViewsMenu({
  views,
  current,
  onApply,
  onSave,
  onDelete,
}: {
  views: { id: string; name: string; query: string }[];
  current: string;
  onApply: (query: string) => void;
  onSave: (name: string) => Promise<void>;
  onDelete: (view: { id: string; name: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="cm-press inline-flex h-10 items-center gap-2 rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
        <Star className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Views <ChevronDown className="h-3.5 w-3.5 text-warm-gray" strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && (
        <div className="cm-pop absolute right-0 top-12 z-30 w-72 origin-top-right rounded-[12px] border border-stone-border bg-white p-1.5 shadow-[0_16px_40px_rgba(17,12,46,0.14)]">
          {views.length === 0 && <p className="px-2.5 py-2 text-[13px] text-warm-gray">No saved views yet.</p>}
          {views.map((v) => (
            <div key={v.id} className="flex items-center">
              <button
                type="button"
                onClick={() => {
                  onApply(v.query);
                  setOpen(false);
                }}
                className={cn("cm-hover flex min-h-10 flex-1 items-center rounded-[8px] px-2.5 text-left text-sm", v.query === current && "font-semibold")}
              >
                {v.name}
              </button>
              <button type="button" aria-label={`Remove ${v.name}`} onClick={() => start(() => onDelete(v))} className="flex h-10 w-10 items-center justify-center text-warm-gray">
                <Trash2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
              </button>
            </div>
          ))}
          <form
            className="mt-1 flex gap-1.5 border-t border-stone-border pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              start(async () => {
                await onSave(name.trim());
                setName("");
                setOpen(false);
              });
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name these filters" aria-label="View name" className="h-10 min-w-0 flex-1 rounded-[6px] border border-stone-muted px-2.5 text-sm" />
            <button type="submit" disabled={pending || !name.trim()} className="cm-press h-10 rounded-full bg-soot px-3.5 text-sm font-medium text-white disabled:opacity-50">
              Save
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function PaySheet({ open, onClose, campId, people }: { open: boolean; onClose: () => void; campId: string; people: PersonListRow[] }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [blockers, setBlockers] = useState<{ me: string; payments: OpenPayment[] } | null>(null);
  const [pending, start] = useTransition();
  const total = people.reduce((n, r) => n + outstandingOf(r), 0);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Pay for ${people.length} ${people.length === 1 ? "person" : "people"}`}
      subtitle="One Paystack payment clears every balance."
      footer={
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() =>
            start(async () => {
              setError("");
              setBlockers(null);
              const r = await payForPeopleAction(campId, people.map((p) => p.id), note);
              if (!r.ok) {
                setError(r.error);
                const open = await openPaymentsForAction(campId, people.map((p) => p.id));
                if (open.ok) setBlockers(open.data);
                return;
              }
              await leaveTo(r.data);
            })
          }
          className={`${primaryButtonClass} h-[52px] w-full`}
        >
          <Busy pending={pending} text="Opening Paystack…">{`Pay ${formatCedis(total)} + fee`}</Busy>
        </button>
      }
    >
      <ul className="flex flex-col text-[15px] tabular-nums">
        {people.map((p) => (
          <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 border-t border-stone-border first:border-t-0">
            <span>{p.full_name}</span>
            <span>{formatCedis(outstandingOf(p))}</span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between rounded-[12px] bg-stone-canvas px-4 py-3 text-[15px] font-semibold tabular-nums">
        <span>Balances</span>
        <span>{formatCedis(total)}</span>
      </p>
      <p className="-mt-3 text-[13px] text-warm-gray">Paystack adds its fee on the next page.</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Zion fellowship fund" className={inputClass} />
      </label>
      <ErrorText>{error}</ErrorText>
      {blockers && blockers.payments.length > 0 && <Blockers campId={campId} me={blockers.me} payments={blockers.payments} />}
    </Sheet>
  );
}

function TextSheet({ open, onClose, campId, people, onSent }: { open: boolean; onClose: () => void; campId: string; people: PersonListRow[]; onSent: (n: number) => void }) {
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const texts = Math.max(1, Math.ceil(message.length / 153));
  return (
    <Sheet
      open={open}
      onClose={() => {
        setConfirming(false);
        onClose();
      }}
      title={`Text ${people.length} ${people.length === 1 ? "person" : "people"}`}
      footer={
        confirming ? (
          <>
            <button type="button" onClick={() => setConfirming(false)} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
              Back
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError("");
                  const r = await textPeopleAction(campId, people.map((p) => p.id), message);
                  if (!r.ok) {
                    setConfirming(false);
                    return setError(r.error);
                  }
                  setMessage("");
                  setConfirming(false);
                  onSent(r.data);
                })
              }
              className="cm-press h-12 flex-1 rounded-full bg-soot px-5 text-sm font-medium text-white disabled:opacity-60"
            >
              <Busy pending={pending} text="Sending…">{`Yes, send ${people.length * texts} text${people.length * texts === 1 ? "" : "s"}`}</Busy>
            </button>
          </>
        ) : (
          <button type="button" disabled={message.trim().length < 3} onClick={() => setConfirming(true)} className={`${primaryButtonClass} h-[52px] w-full`}>
            Send
          </button>
        )
      }
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Message
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={459} className={`${inputClass} h-auto py-2.5 leading-relaxed`} />
        <span className="text-right text-xs font-normal text-warm-gray">
          {message.length}/459 · {texts} text{texts === 1 ? "" : "s"} each
        </span>
      </label>
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
