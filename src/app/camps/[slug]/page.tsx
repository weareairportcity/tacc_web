import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BedDouble, CalendarDays, Church, Clock, CreditCard, MapPin, Phone, Users } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { daysUntil, registrationPhase } from "@/lib/camp/registrations";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import type { RoomType } from "@/lib/camp/types";
import { CampBanner, CampLogo, VenuePhoto } from "@/components/camp/photos";
import { PlacesNote } from "@/components/camp/places";
import { Card, StatusLine, formatDate, headlineClass, primaryButtonClass, titleClass } from "@/components/camp/ui";
import { SignIn } from "./SignIn";

export default async function CampLanding({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ registered?: string; next?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  const next = query.next?.startsWith(`/camps/${slug}/`) ? query.next : undefined;
  if (await currentAttendee(camp.id)) redirect(next ?? `/camps/${camp.slug}/me`);

  const phase = registrationPhase(camp);
  const roomTypes = phase === "upcoming" ? [] : await listRoomTypes(camp.id);
  const [firstWord, ...rest] = camp.name.split(" ");

  return (
    <div className="flex flex-col gap-8">
      {phase === "open" && (
        // Sits in the header row, top right, where people look for it.
        <div className="pointer-events-none relative -mt-16 -mb-8 flex h-16 items-center justify-end gap-1">
          <a href="#sign-in" className="pointer-events-auto flex h-11 items-center px-3 text-sm font-medium">
            Sign in
          </a>
          <Link href={`/camps/${camp.slug}/register`} className={`${primaryButtonClass} pointer-events-auto h-10 px-5 text-sm`}>
            Register
          </Link>
        </div>
      )}
      <section className="flex flex-col gap-4">
        <Link href="/camps" className="cm-press -ml-1 inline-flex min-h-11 items-center gap-1 self-start text-sm">
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" /> All camps
        </Link>
        {camp.banner_url ? (
          <div className="relative mb-6">
            <CampBanner camp={camp} className="h-[220px] rounded-2xl" />
            <span className="absolute -bottom-6 left-4 rounded-[24%] bg-stone-canvas p-1">
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
        <h1 className={`cm-rise ${headlineClass}`}>
          <span className="text-cyan-edge">{firstWord}</span> {rest.join(" ")}
        </h1>
        <ul className="cm-rise flex flex-col gap-2 text-[15px] text-warm-gray" style={{ animationDelay: "60ms" }}>
          <li className="flex items-center gap-2.5">
            <CalendarDays className="h-[18px] w-[18px] text-ink-black" strokeWidth={1.5} aria-hidden="true" />
            {formatDate(camp.starts_on)} – {formatDate(camp.ends_on)}
          </li>
          {camp.venue && (
            <li className="flex items-center gap-2.5">
              <MapPin className="h-[18px] w-[18px] text-ink-black" strokeWidth={1.5} aria-hidden="true" />
              {camp.venue}
            </li>
          )}
          {phase !== "upcoming" && (
            <li className="flex items-center gap-2.5">
              <CreditCard className="h-[18px] w-[18px] text-ink-black" strokeWidth={1.5} aria-hidden="true" />
              Pay by {formatDate(camp.payment_due_on)}, all at once or bit by bit
            </li>
          )}
        </ul>
      </section>

      {phase === "upcoming" && <Upcoming opensOn={camp.registration_opens_on} name={camp.name} slug={camp.slug} />}

      {phase === "open" && (
        <>
          <Card lifted title="Rooms and prices">
            <RoomList roomTypes={roomTypes} />
          </Card>
        </>
      )}

      {phase === "closed" && (
        <p className="rounded-[10px] border border-stone-border bg-white p-5 text-[15px] leading-relaxed text-warm-gray">
          This camp isn&apos;t taking new registrations. If you&apos;ve registered, sign in below to pay or see your room.
        </p>
      )}

      {camp.venue_photo_url && (
        <section className="flex flex-col gap-3">
          <h2 className={titleClass}>Where we&apos;ll be</h2>
          <VenuePhoto camp={camp} className="h-56" />
          {camp.venue && (
            <p className="flex items-center gap-2 text-sm text-warm-gray">
              <MapPin className="h-4 w-4 text-ink-black" strokeWidth={1.6} aria-hidden="true" /> {camp.venue}
            </p>
          )}
        </section>
      )}

      {phase !== "upcoming" && (
        <section className="flex flex-col gap-3">
          <h2 className={titleClass}>How it works</h2>
          <ol className="flex flex-col">
            {[
              [Users, "Register", "Two minutes"],
              [CreditCard, "Pay", "MoMo or card, bit by bit"],
              [Users, "Pick roommates", "After you've paid in full"],
              [BedDouble, "Get your room", "We text it to you"],
            ].map(([Icon, title, text], i) => {
              const I = Icon as typeof Users;
              return (
                <li key={i} className="flex gap-3.5 border-t border-stone-border py-3.5">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-stone-border bg-white">
                    <I className="h-[17px] w-[17px]" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-medium">{title as string}</span>
                    <span className="text-sm text-warm-gray">{text as string}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {phase !== "upcoming" && (
        <section id="sign-in" className="scroll-mt-6">
          <Card title="Already registered?">
            {query.registered && (
              <p role="status" className="-mt-1 rounded-[10px] bg-cyan-tint px-3.5 py-2.5 text-sm">
                That phone number is already registered. Sign in with your code.
              </p>
            )}
            <SignIn slug={camp.slug} next={next} />
          </Card>
        </section>
      )}
    </div>
  );
}

function RoomList({ roomTypes }: { roomTypes: RoomType[] }) {
  return (
    <ul className="flex flex-col">
      {roomTypes.map((t) => (
        <li key={t.id} className="flex items-center gap-3 border-t border-stone-border py-3 first:border-t-0 first:pt-0">
          <BedDouble className="h-5 w-5 flex-none" strokeWidth={1.5} aria-hidden="true" />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium">{t.name}</span>
            <span className="text-[13px] text-warm-gray">
              {t.capacity} in a room
              <PlacesNote type={t} />
            </span>
          </span>
          <span className="font-display text-lg tabular-nums">{formatCedis(t.price_pesewas)}</span>
        </li>
      ))}
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
        <span className="text-[13px] leading-relaxed text-warm-gray">
          Saves the opening day to your phone&apos;s calendar. Come back here then to register.
        </span>
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
        Room types and prices show here when registration opens.{" "}
        <span className="text-warm-gray">Some room types have limited places, so register early.</span>
      </p>
    </>
  );
}
