import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BedDouble, CalendarDays, Church, Clock, CreditCard, MapPin, Phone, Users } from "lucide-react";
import { getCampBySlug } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { daysUntil, registrationPhase } from "@/lib/camp/registrations";
import { listRoomTypes } from "@/lib/camp/rooms";
import { currentAttendee } from "@/lib/camp/session";
import type { RoomType } from "@/lib/camp/types";
import { PlacesNote } from "@/components/camp/places";
import { Card, StatusLine, formatDate, headlineClass, primaryButtonClass, titleClass } from "@/components/camp/ui";
import { SignIn } from "./SignIn";

export default async function CampLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  if (!camp) notFound();
  if (await currentAttendee(camp.id)) redirect(`/camps/${camp.slug}/me`);

  const phase = registrationPhase(camp);
  const roomTypes = phase === "upcoming" ? [] : await listRoomTypes(camp.id);
  const [firstWord, ...rest] = camp.name.split(" ");

  return (
    <div className="flex flex-col gap-8 pt-4">
      <section className="flex flex-col gap-4">
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
              Pay in parts by {formatDate(camp.payment_due_on)}
            </li>
          )}
        </ul>
      </section>

      {phase === "upcoming" && <Upcoming opensOn={camp.registration_opens_on} name={camp.name} slug={camp.slug} />}

      {phase === "open" && (
        <>
          <div className="cm-rise flex flex-col gap-3" style={{ animationDelay: "120ms" }}>
            <Link href={`/camps/${camp.slug}/register`} className={`${primaryButtonClass} h-[52px] w-full`}>
              Register now
            </Link>
            <a href="#sign-in" className="flex h-11 items-center justify-center text-[15px] font-medium text-ink-black">
              I&apos;ve already registered
            </a>
          </div>
          <Card lifted title="Pick a room, pay in parts">
            <RoomList roomTypes={roomTypes} />
            <p className="text-[13px] leading-relaxed text-warm-gray">
              A small Paystack fee is added to each payment and shown before you pay.
            </p>
          </Card>
        </>
      )}

      {phase === "closed" && (
        <p className="rounded-[10px] border border-stone-border bg-white p-5 text-[15px] leading-relaxed text-warm-gray">
          This camp isn&apos;t taking new registrations. If you&apos;ve registered, sign in below to pay or see your room.
        </p>
      )}

      {phase !== "upcoming" && (
        <section className="flex flex-col gap-3">
          <h2 className={titleClass}>Four steps to your room</h2>
          <ol className="flex flex-col">
            {[
              [Users, "Register", "Name, phone, fellowship and room type."],
              [CreditCard, "Pay in parts", "MoMo or card, any amount, until it's paid."],
              [Users, "Choose roommates", "Once you're fully paid, form a group with friends."],
              [BedDouble, "Get your room", "A coordinator places your group before camp."],
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
            <SignIn slug={camp.slug} />
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
