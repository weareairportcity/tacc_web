import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Church, Clock, CreditCard, MapPin, Phone, Users } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { daysUntil, registrationPhase } from "@/lib/camp/registrations";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import type { Camp, RoomType } from "@/lib/camp/types";
import { CampBanner, CampLogo, VenuePhoto } from "@/components/camp/photos";
import { Card, StatusLine, formatDate, formatWeekday, headlineClass, primaryButtonClass, secondaryButtonClass, titleClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";

/**
 * A camp's home, before signing in. One cyan "Register for camp" (also in a
 * bar that stays on screen); signing in is a quiet second button that opens
 * its own screen. The facts as tiles, each room type with how many share a
 * room as a number, and four numbered steps.
 */
export default async function CampLanding({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const next = query.next?.startsWith(`/camps/${slug}/`) ? query.next : undefined;
  if (await currentAttendee(camp.id)) redirect(next ?? `/camps/${camp.slug}/me`);
  // Old links to the bottom sign-in box (…?next=…#sign-in) go to the sign-in screen.
  if (next) redirect(`/camps/${camp.slug}/sign-in?next=${encodeURIComponent(next)}`);

  const phase = registrationPhase(camp);
  const roomTypes = phase === "upcoming" ? [] : await listRoomTypes(camp.id);
  const [firstWord, ...rest] = camp.name.split(" ");
  const from = roomTypes.length ? Math.min(...roomTypes.map((t) => t.price_pesewas)) : null;
  const signIn = `/camps/${camp.slug}/sign-in`;

  return (
    <div className={cn("flex flex-col gap-8", phase === "open" && "pb-24")}>
      <div className="pointer-events-none relative -mt-16 -mb-8 flex h-16 items-center justify-end">
        {phase !== "upcoming" && (
          <Link href={signIn} className={`${secondaryButtonClass} pointer-events-auto h-10 px-4`}>
            Sign in
          </Link>
        )}
      </div>

      <section className="flex flex-col gap-4">
        <Link href="/camps" className="cm-press -ml-1 inline-flex min-h-11 items-center gap-1 self-start text-sm">
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" /> All camps
        </Link>
        {camp.banner_url ? (
          <div className="relative -mx-5 mb-7 sm:mx-0">
            <CampBanner camp={camp} className="h-[240px] sm:rounded-2xl" />
            <span className="absolute -bottom-7 left-5 rounded-[18px] bg-stone-canvas p-1">
              <CampLogo camp={camp} size={60} />
            </span>
          </div>
        ) : (
          <CampLogo camp={camp} size={56} />
        )}
        {phase === "open" && (
          <StatusLine dot="live" strong="Registration is open">
            closes in {daysUntil(camp.registration_closes_on)} days
          </StatusLine>
        )}
        {phase === "upcoming" && (
          <StatusLine icon={Clock} strong="Registration hasn't opened">
            opens {formatDate(camp.registration_opens_on)}
          </StatusLine>
        )}
        {phase === "closed" && <StatusLine icon={Clock} strong="Registration is closed" />}
        <p className="-mb-2 text-sm text-warm-gray">The Airport City Church</p>
        <h1 className={`cm-rise ${headlineClass} text-[42px] leading-[1.08]`}>
          <span className="text-cyan-edge">{firstWord}</span> {rest.join(" ")}
        </h1>
      </section>

      <Facts camp={camp} from={from} showMoney={phase !== "upcoming"} />

      {phase === "open" && (
        <div className="cm-rise -mt-2 flex flex-col gap-2.5" style={{ animationDelay: "120ms" }}>
          <Link href={`/camps/${camp.slug}/register`} className={`${primaryButtonClass} h-14 w-full text-[17px]`}>
            Register for camp
          </Link>
          <Link href={signIn} className={`${secondaryButtonClass} h-[52px] w-full text-[15px]`}>
            I&apos;ve already registered
          </Link>
        </div>
      )}

      {phase === "upcoming" && <Upcoming opensOn={camp.registration_opens_on} name={camp.name} slug={camp.slug} />}

      {phase === "closed" && (
        <div className="flex flex-col gap-3">
          <p className="rounded-2xl border border-stone-border bg-white p-5 text-[15px] leading-relaxed text-warm-gray">
            This camp isn&apos;t taking new registrations. If you&apos;ve registered, sign in to pay or see your room.
          </p>
          <Link href={signIn} className={`${primaryButtonClass} h-[52px] w-full`}>
            Sign in
          </Link>
        </div>
      )}

      {phase !== "upcoming" && roomTypes.length > 0 && (
        <section className="flex flex-col gap-3.5">
          <h2 className={`${titleClass} text-[22px]`}>Rooms and prices</h2>
          <RoomList roomTypes={roomTypes} />
          <p className="text-sm leading-relaxed text-warm-gray">Rooms are for men or for women. You choose your room type when you register.</p>
        </section>
      )}

      {phase !== "upcoming" && (
        <section className="flex flex-col gap-3.5">
          <h2 className={`${titleClass} text-[22px]`}>How it works</h2>
          <ol className="flex flex-col">
            {[
              ["Register", "Your name, phone and fellowship. Two minutes."],
              ["Pay", `MoMo or card. All at once, or bit by bit before ${formatWeekday(camp.payment_due_on)}.`],
              ["Choose roommates", "Once you've paid in full. Send friends your group link."],
              ["Get your room", "We text you your room number before camp."],
            ].map(([title, text], i, all) => (
              <li key={title} className={cn("relative flex gap-3.5", i < all.length - 1 && "pb-[18px]")}>
                {i < all.length - 1 && <span aria-hidden="true" className="absolute top-[34px] -bottom-1 left-[15px] w-0.5 bg-stone-border" />}
                <span className={cn("flex h-8 w-8 flex-none items-center justify-center rounded-full text-[15px] font-semibold", i === 0 ? "bg-cyan-signal" : "border border-stone-border bg-white")}>
                  {i + 1}
                </span>
                <span className="flex flex-col gap-0.5 pt-1">
                  <span className="text-base font-medium">{title}</span>
                  <span className="text-sm leading-normal text-warm-gray">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(camp.venue_photo_url || camp.venue) && (
        <section className="flex flex-col gap-3.5">
          <h2 className={`${titleClass} text-[22px]`}>Where we&apos;ll be</h2>
          <VenuePhoto camp={camp} className="h-[200px]" />
          {camp.venue && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(camp.venue)}`}
              target="_blank"
              rel="noreferrer"
              className={`${secondaryButtonClass} h-12 self-start px-5`}
            >
              <MapPin className="h-[17px] w-[17px]" strokeWidth={1.6} aria-hidden="true" /> Open in Google Maps
            </a>
          )}
        </section>
      )}

      <p className="flex items-center gap-2 text-[13px] text-warm-gray">
        <Church className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Run by The Airport City Church
      </p>

      {phase === "open" && (
        // Register stays on screen while they scroll.
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-border bg-stone-canvas/95 shadow-[0_-8px_24px_rgba(0,0,0,.05)] backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] text-warm-gray">{from !== null ? `From ${formatCedis(from)} · 2 minutes` : "2 minutes"}</span>
              <span className="truncate text-[15px] font-medium">{camp.name}</span>
            </span>
            <Link href={`/camps/${camp.slug}/register`} className={`${primaryButtonClass} h-[52px] flex-none px-6`}>
              Register
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** When, where, price, pay by: four tiles. */
function Facts({ camp, from, showMoney }: { camp: Camp; from: number | null; showMoney: boolean }) {
  const items: [typeof CalendarDays, string, string][] = [
    [CalendarDays, "When", `${formatWeekday(camp.starts_on)} – ${formatWeekday(camp.ends_on)}`],
    ...(camp.venue ? ([[MapPin, "Where", camp.venue]] as [typeof CalendarDays, string, string][]) : []),
    ...(showMoney && from !== null ? ([[CreditCard, "Price", `From ${formatCedis(from)}`]] as [typeof CalendarDays, string, string][]) : []),
    ...(showMoney ? ([[Clock, "Pay by", `${formatWeekday(camp.payment_due_on)}, bit by bit`]] as [typeof CalendarDays, string, string][]) : []),
  ];
  return (
    <dl className="cm-rise -mt-2 grid grid-cols-2 gap-2.5" style={{ animationDelay: "80ms" }}>
      {items.map(([Icon, k, v]) => (
        <div key={k} className="flex flex-col gap-2 rounded-[14px] border border-stone-border bg-white p-3.5">
          <Icon className="h-[19px] w-[19px]" strokeWidth={1.5} aria-hidden="true" />
          <span className="flex flex-col gap-px">
            <dt className="text-[13px] text-warm-gray">{k}</dt>
            <dd className="text-base font-medium leading-snug">{v}</dd>
          </span>
        </div>
      ))}
    </dl>
  );
}

/** Each room type with how many share a room as a big number; full ones greyed with the price struck. */
function RoomList({ roomTypes }: { roomTypes: RoomType[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {roomTypes.map((t) => {
        const full = t.places_female === 0 && t.places_male === 0;
        const low = (
          [
            [t.places_female, "women"],
            [t.places_male, "men"],
          ] as const
        ).filter(([n]) => n !== null && n > 0 && n <= 20);
        const fullFor = ([[t.places_female, "women"], [t.places_male, "men"]] as const).filter(([n]) => n === 0).map(([, who]) => who);
        const note = full
          ? "Full"
          : [...low.map(([n, who]) => `Only ${n} ${n === 1 ? "place" : "places"} left for ${who}`), ...fullFor.map((who) => `Full for ${who}`)].join(" · ") ||
            "Places left for men and women";
        return (
          <li key={t.id} className={cn("flex items-center gap-3.5 rounded-[14px] border border-stone-border p-3.5", full ? "bg-stone-canvas text-warm-gray" : "bg-white")}>
            <span className={cn("flex h-16 w-16 flex-none flex-col items-center justify-center rounded-[14px]", full ? "bg-[#f0efee]" : "bg-stone-rail")}>
              <span className="font-display text-[28px] leading-none text-ink-black">{t.capacity}</span>
              <span className="text-[11px] text-warm-gray">per room</span>
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[17px] font-medium text-ink-black">{t.name}</span>
              <span className={cn("text-sm", low.length || fullFor.length ? "font-medium text-ink-black" : "text-warm-gray", full && "font-normal text-warm-gray")}>{note}</span>
            </span>
            <span className={cn("font-display text-xl tabular-nums", full && "line-through")}>{formatCedis(t.price_pesewas)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Upcoming({ opensOn, name, slug }: { opensOn: string; name: string; slug: string }) {
  const days = daysUntil(opensOn);
  return (
    <>
      <Card lifted>
        <span className="text-sm text-warm-gray">Registration opens in</span>
        <span className="flex items-baseline gap-2.5">
          <span className="overflow-hidden font-display text-[64px] leading-none tracking-[-0.03em] tabular-nums">
            {String(days)
              .split("")
              .map((d, i) => (
                <span key={i} className="cm-digit" style={{ animationDelay: `${200 + i * 90}ms` }}>
                  {d}
                </span>
              ))}
          </span>
          <span className="font-display text-2xl">{days === 1 ? "day" : "days"}</span>
        </span>
        <span className="text-sm">{formatDate(opensOn)}</span>
        <a href={`/camps/${slug}/calendar`} className={`${primaryButtonClass} h-[52px] w-full`} download={`${name}.ics`}>
          <CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />
          Add to my calendar
        </a>
        <span className="text-[13px] leading-relaxed text-warm-gray">Saves the opening day to your phone&apos;s calendar. Come back here then to register.</span>
      </Card>
      <section className="flex flex-col">
        <h2 className={`${titleClass} mb-1.5`}>Have these ready</h2>
        <ul className="flex flex-col">
          {[
            [Phone, "A phone number", "We sign you in with it, and MoMo payments use it."],
            [Church, "Your fellowship", "You'll pick it from a list."],
            [Users, "Who you want to room with", "Friends who pick the same room type can share a room."],
          ].map(([Icon, title, text], i) => {
            const I = Icon as typeof Users;
            return (
              <li key={i} className="flex gap-3.5 border-t border-stone-border py-3.5">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-stone-border bg-white">
                  <I className="h-[17px] w-[17px]" strokeWidth={1.6} aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{title as string}</span>
                  <span className="text-sm leading-relaxed text-warm-gray">{text as string}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="rounded-[10px] border border-stone-border bg-white p-5 text-sm leading-relaxed">
        Room types and prices show here when registration opens. <span className="text-warm-gray">Some room types have limited places, so register early.</span>
      </p>
    </>
  );
}
