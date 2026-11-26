"use client";

import { Field, inputClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { isSunday, TIME_WORDS, TRANSPORT_WORDS, timesFor, transportsFor, type ArrivalInput } from "@/lib/camp/arrival";

/**
 * The three arrival questions: which day, what time of day, bus or by yourself.
 * Sunday is morning only and has no bus, so picking it fills those in.
 * `ids`: the field ids, so a form can scroll to the one that's missing.
 */
export function ArrivalFields({
  days,
  value,
  onChange,
  ids = { day: "arrival_day", time: "arrival_time", transport: "transport" },
  errorAt = null,
}: {
  days: { date: string; name: string }[];
  value: ArrivalInput;
  onChange: (next: ArrivalInput) => void;
  ids?: { day: string; time: string; transport: string };
  errorAt?: string | null;
}) {
  const sunday = isSunday(value.arrival_day);
  const times = value.arrival_day ? timesFor(value.arrival_day) : (Object.keys(TIME_WORDS) as (keyof typeof TIME_WORDS)[]);
  const transports = value.arrival_day ? transportsFor(value.arrival_day) : (Object.keys(TRANSPORT_WORDS) as (keyof typeof TRANSPORT_WORDS)[]);
  const bad = (id: string) => cn(inputClass, errorAt === id && "outline-2 outline-cyan-signal");

  const pickDay = (date: string) => {
    const t = timesFor(date);
    const r = transportsFor(date);
    onChange({
      arrival_day: date,
      arrival_time: t.length === 1 ? t[0] : t.includes(value.arrival_time as never) ? value.arrival_time : "",
      transport: r.length === 1 ? r[0] : r.includes(value.transport as never) ? value.transport : "",
    });
  };

  return (
    <>
      <Field label="Which day will you arrive at camp?">
        <select id={ids.day} required className={bad(ids.day)} value={value.arrival_day} onChange={(e) => pickDay(e.target.value)}>
          <option value="" disabled>
            Choose the day
          </option>
          {days.map((d) => (
            <option key={d.date} value={d.date}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What time of day?" hint={sunday ? "Sunday arrivals are in the morning." : undefined}>
        <select
          id={ids.time}
          required
          className={bad(ids.time)}
          value={value.arrival_time}
          onChange={(e) => onChange({ ...value, arrival_time: e.target.value as ArrivalInput["arrival_time"] })}
        >
          <option value="" disabled>
            Choose the time
          </option>
          {times.map((t) => (
            <option key={t} value={t}>
              {TIME_WORDS[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="How will you get to camp?" hint={sunday ? "There's no bus on Sunday, so you'll come by yourself." : undefined}>
        <select
          id={ids.transport}
          required
          className={bad(ids.transport)}
          value={value.transport}
          onChange={(e) => onChange({ ...value, transport: e.target.value as ArrivalInput["transport"] })}
        >
          <option value="" disabled>
            Choose how
          </option>
          {transports.map((t) => (
            <option key={t} value={t}>
              {TRANSPORT_WORDS[t]}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
