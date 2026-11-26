import type { Camp, Registration } from "./types";

/**
 * When and how someone gets to camp: the day (one of the camp's days), the
 * time of day, and whether they come on the bus or by themselves. Asked at
 * registration, and of everyone already registered. Sunday has no bus and
 * people only arrive in the morning, so Sunday is by yourself, morning.
 */

export const ARRIVAL_TIMES = ["morning", "afternoon", "evening"] as const;
export type ArrivalTime = (typeof ARRIVAL_TIMES)[number];
export const TRANSPORTS = ["bus", "self"] as const;
export type Transport = (typeof TRANSPORTS)[number];

export const TIME_WORDS: Record<ArrivalTime, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };
export const TRANSPORT_WORDS: Record<Transport, string> = { bus: "By bus", self: "By myself" };

export type ArrivalInput = { arrival_day: string; arrival_time: ArrivalTime | ""; transport: Transport | "" };
export type Arrival = Pick<Registration, "arrival_day" | "arrival_time" | "transport">;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

export const isSunday = (date: string) => DAY.test(date) && new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/** Each day of the camp, by name (not date): Thursday, Friday... */
export function campDays(camp: Pick<Camp, "starts_on" | "ends_on">) {
  const days: { date: string; name: string }[] = [];
  const end = Date.parse(`${camp.ends_on}T00:00:00Z`);
  for (let t = Date.parse(`${camp.starts_on}T00:00:00Z`); t <= end && days.length < 31; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    days.push({ date, name: weekday(date) });
  }
  return days;
}

export const dayName = (date: string) => (DAY.test(date) ? weekday(date) : "");

/** What can be chosen on that day: Sunday is morning only, and no bus. */
export const timesFor = (date: string): readonly ArrivalTime[] => (isSunday(date) ? ["morning"] : ARRIVAL_TIMES);
export const transportsFor = (date: string): readonly Transport[] => (isSunday(date) ? ["self"] : TRANSPORTS);

/** Checks the three answers against the camp. Pushes plain problems and returns what to save. */
export function validateArrival(camp: Pick<Camp, "starts_on" | "ends_on">, raw: Partial<ArrivalInput>, problems: string[]): ArrivalInput {
  const day = String(raw.arrival_day ?? "");
  const time = String(raw.arrival_time ?? "");
  const transport = String(raw.transport ?? "");
  const days = campDays(camp);
  const dayOk = days.some((d) => d.date === day);
  if (!dayOk) problems.push("Choose the day you'll arrive at camp.");
  const timeOk = (ARRIVAL_TIMES as readonly string[]).includes(time) && (!dayOk || timesFor(day).includes(time as ArrivalTime));
  if (!timeOk) problems.push(dayOk && isSunday(day) ? "On Sunday, arrival is in the morning only." : "Choose the time of day you'll arrive.");
  const transportOk = (TRANSPORTS as readonly string[]).includes(transport) && (!dayOk || transportsFor(day).includes(transport as Transport));
  if (!transportOk) problems.push(dayOk && isSunday(day) ? "There's no bus on Sunday, so you'll come by yourself." : "Choose how you'll get to camp: by bus or by yourself.");
  return { arrival_day: dayOk ? day : "", arrival_time: timeOk ? (time as ArrivalTime) : "", transport: transportOk ? (transport as Transport) : "" };
}

export const arrivalComplete = (a: Partial<Arrival>) => Boolean(a.arrival_day && a.arrival_time && a.transport);

/** Their arrival answers are still missing, they haven't cancelled, and the camp isn't over. */
export function mustGiveArrival(camp: Pick<Camp, "status">, me: Pick<Registration, "status"> & Partial<Arrival>) {
  if (camp.status === "archived" || me.status === "cancelled") return false;
  return !arrivalComplete(me);
}

/** "Thursday, morning, by bus" */
export function arrivalLine(a: Partial<Arrival>) {
  if (!arrivalComplete(a)) return "";
  return `${dayName(a.arrival_day!)}, ${a.arrival_time}, ${a.transport === "bus" ? "by bus" : "by themselves"}`;
}
