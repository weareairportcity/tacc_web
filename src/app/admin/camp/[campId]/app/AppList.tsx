"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, ChevronRight, MessageSquare, Search, Smartphone } from "lucide-react";
import type { AppPerson } from "@/lib/camp/broadcast";
import type { TeamMember } from "@/lib/camp/team-app";
import type { AppState } from "@/lib/camp/app-first";
import { APP_STATE_WORDS } from "@/lib/camp/app-words";
import { Legend, StackedBar, headlineClass, inputClass, type BarPart } from "@/components/camp/ui";
import { cn } from "@/lib/utils";

const ORDER: AppState[] = ["on", "installed", "none", "texts"];
const ICON: Record<AppState, typeof Bell> = { on: Bell, installed: BellOff, none: Smartphone, texts: MessageSquare };
const COLOR: Record<AppState, string> = { on: "bg-st-paid", installed: "bg-sky-wash", none: "bg-stone-border", texts: "bg-[#a8a29e]" };
const PLATFORM: Record<string, string> = { ios: "iPhone", android: "Android", desktop: "Computer" };

const day = (iso: string | null) =>
  iso ? new Date(iso.endsWith("Z") ? iso : `${iso}Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Accra" }) : "";

/** What's known about how this person gets updates, in a few words. */
function detail(p: AppPerson) {
  const phone = PLATFORM[p.platform] ?? "";
  if (p.state === "on") return [phone, p.push_since && `on since ${day(p.push_since)}`].filter(Boolean).join(" · ");
  if (p.state === "installed") return [phone, p.installed_at && `added ${day(p.installed_at)}`, "turned notifications off or hasn't allowed them"].filter(Boolean).join(" · ");
  if (p.state === "texts") return `Tapped "My phone can't do this"${p.texts_only_at ? ` on ${day(p.texts_only_at)}` : ""}`;
  return "Hasn't opened Commune from a Home Screen yet";
}

/** Everyone, by how they get updates. Tap a person to message them or see their details. */
export function AppList({ campId, required, people, team = [] }: { campId: string; required: boolean; people: AppPerson[]; team?: TeamMember[] }) {
  const [show, setShow] = useState<AppState | "">("");
  const [q, setQ] = useState("");
  const count = (s: AppState) => people.filter((p) => p.state === s).length;
  const parts: BarPart[] = ORDER.map((s) => ({ key: s, value: count(s), color: COLOR[s], label: APP_STATE_WORDS[s] }));
  const shown = useMemo(
    () => people.filter((p) => (!show || p.state === show) && (!q || p.full_name.toLowerCase().includes(q.toLowerCase()))),
    [people, show, q],
  );
  const base = `/admin/camp/${campId}`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className={`${headlineClass} text-[34px]`}>The app</h1>
        <p className="text-[15px] text-warm-gray">
          Who has Commune on their phone with notifications on. They get updates free; everyone else costs a text.
          {!required && " Setting up the app is switched off in Settings, so nobody is asked to."}
        </p>
      </header>

      <section className="flex flex-col gap-3.5 rounded-2xl bg-white p-5 shadow-seline-hero">
        <p className="text-[17px] leading-snug">
          <strong className="font-display text-[40px] font-normal leading-none tracking-[-0.03em] tabular-nums">{count("on")}</strong>
          <span className="text-warm-gray"> of {people.length}</span> get app notifications
        </p>
        <StackedBar parts={parts} className="h-2" />
        <Legend parts={parts} />
        {count("none") + count("installed") > 0 && (
          <Link href={`${base}/texts?to=noapp`} className="flex items-center gap-1 border-t border-stone-border pt-3 text-[14px] font-medium">
            Send the {count("none") + count("installed")} without notifications a reminder to set it up <ChevronRight className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </Link>
        )}
      </section>

      <div role="group" aria-label="Show only" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ORDER.map((s) => {
          const Icon = ICON[s];
          const on = show === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => setShow(on ? "" : s)}
              className={cn("cm-press flex min-h-[60px] flex-col items-start justify-center rounded-[14px] border px-3.5 py-2 text-left", on ? "border-soot bg-soot text-white" : "border-stone-border bg-white")}
            >
              <span className="font-display text-[22px] leading-none tabular-nums">{count(s)}</span>
              <span className={cn("mt-1 flex items-center gap-1.5 text-[13px] leading-tight", on ? "text-white" : "text-warm-gray")}>
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" /> {APP_STATE_WORDS[s]}
              </span>
            </button>
          );
        })}
      </div>

      <label className="relative flex">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-warm-gray" strokeWidth={1.6} aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search people" className={`${inputClass} pl-10`} />
      </label>

      <p role="status" className="text-sm font-semibold">
        {shown.length} {shown.length === 1 ? "person" : "people"}
      </p>

      {shown.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-6 text-center text-[15px] text-warm-gray">Nobody here.</p>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
          {shown.slice(0, 500).map((p) => {
            const Icon = ICON[p.state];
            return (
              <li key={p.id} className="border-t border-stone-border first:border-t-0">
                <Link href={`${base}/people?person=${p.id}`} className="cm-row flex min-h-[60px] items-center gap-3.5 px-4 py-2.5">
                  <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-full", p.state === "on" ? "bg-[#e7f4e7] text-[#0b5e0b]" : "bg-stone-canvas text-[#57534e]")}>
                    <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium">{p.full_name}</span>
                    <span className="truncate text-[13px] text-warm-gray">
                      {APP_STATE_WORDS[p.state]} · {detail(p)}
                    </span>
                  </span>
                  <span className="hidden text-[13px] text-warm-gray sm:block">{p.fellowship}</span>
                  <ChevronRight className="h-4 w-4 flex-none text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <TeamSection team={team} />
    </div>
  );
}

/** Coordinators (by email) and leader codes (by fellowship or PFCC): whether Commune Team is set up. */
function TeamSection({ team }: { team: TeamMember[] }) {
  if (!team.length) return null;
  const ready = team.filter((t) => t.installed_at && t.push).length;
  return (
    <section className="flex flex-col gap-3 pt-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[24px] tracking-[-0.015em]">Commune Team</h2>
        <p className="text-[15px] text-warm-gray">
          Coordinators and leaders, in their own app. <strong className="font-semibold text-ink-black">{ready} of {team.length}</strong> have it with notifications on. Leaders share
          one code per fellowship or PFCC, so each code is one line.
        </p>
      </div>
      <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
        {team.map((t) => {
          const state = t.push && t.installed_at ? "on" : t.push ? "push" : t.installed_at ? "installed" : "none";
          const Icon = state === "on" ? Bell : state === "installed" ? BellOff : state === "push" ? Bell : Smartphone;
          const words =
            state === "on"
              ? "App and notifications on"
              : state === "push"
                ? "Notifications on, app not added on a phone"
                : state === "installed"
                  ? "App added, notifications off"
                  : "Not set up";
          return (
            <li key={t.owner} className="flex min-h-[56px] items-center gap-3.5 border-t border-stone-border px-4 py-2.5 first:border-t-0">
              <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-full", state === "on" ? "bg-[#e7f4e7] text-[#0b5e0b]" : "bg-stone-canvas text-[#57534e]")}>
                <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium">{t.role === "leader" ? `${t.name} leaders` : t.name}</span>
                <span className="truncate text-[13px] text-warm-gray">
                  {words}
                  {t.platform ? ` · ${PLATFORM[t.platform] ?? t.platform}` : ""}
                  {t.installed_at ? ` · added ${day(t.installed_at)}` : ""}
                </span>
              </span>
              <span className="text-[13px] text-warm-gray">{t.role === "leader" ? "Leader code" : "Coordinator"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
