import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { campDays, mustGiveArrival, timesFor, transportsFor, validateArrival } from "@/lib/camp/arrival";
import { updateArrival } from "@/lib/camp/profile";
import { getRegistration, register } from "@/lib/camp/registrations";
import { listArrivals } from "@/lib/camp/arrivals";
import { listHistory } from "@/lib/camp/reports";
import { ACTOR, attendee, openCamp } from "./helpers";

// When and how people get to camp: asked at registration, editable later; Sunday is morning, by yourself.

/** The next Thursday at least two weeks away, so the camp runs Thursday to Sunday. */
function thursday() {
  const d = new Date(Date.now() + 14 * 86_400_000);
  while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const plus = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A camp Thursday to Sunday, with its deadlines before the start. */
const thuToSun = () => {
  const start = thursday();
  return openCamp({ starts_on: start, ends_on: plus(start, 3), registration_closes_on: plus(start, -3), payment_due_on: plus(start, -2), roommate_deadline_on: plus(start, -2) });
};

describe("arrival", () => {
  it("lists each camp day by name", () => {
    const start = thursday();
    expect(campDays({ starts_on: start, ends_on: plus(start, 3) }).map((d) => d.name)).toEqual(["Thursday", "Friday", "Saturday", "Sunday"]);
  });

  it("Sunday is morning only and has no bus", () => {
    const sunday = plus(thursday(), 3);
    expect(timesFor(sunday)).toEqual(["morning"]);
    expect(transportsFor(sunday)).toEqual(["self"]);
    expect(timesFor(plus(thursday(), 1))).toEqual(["morning", "afternoon", "evening"]);
    const camp = { starts_on: thursday(), ends_on: sunday };
    const problems: string[] = [];
    validateArrival(camp, { arrival_day: sunday, arrival_time: "evening", transport: "bus" }, problems);
    expect(problems.join(" ")).toContain("morning only");
    expect(problems.join(" ")).toContain("no bus on Sunday");
    const ok: string[] = [];
    expect(validateArrival(camp, { arrival_day: sunday, arrival_time: "morning", transport: "self" }, ok)).toEqual({ arrival_day: sunday, arrival_time: "morning", transport: "self" });
    expect(ok).toEqual([]);
  });

  it("is required to register, and saved with the registration", async () => {
    const start = thursday();
    const { camp, roomTypeId } = await thuToSun();
    const base = attendee(roomTypeId, { full_name: "Esi Arrival" });
    await expect(register(camp, { ...base, arrival_day: "", arrival_time: "", transport: "" })).rejects.toThrow("Choose the day you'll arrive at camp.");
    await expect(register(camp, { ...base, arrival_day: plus(start, 10), arrival_time: "morning", transport: "bus" })).rejects.toThrow("Choose the day");
    const { id } = await register(camp, { ...base, arrival_day: plus(start, 1), arrival_time: "afternoon", transport: "bus" });
    const me = (await getRegistration(id))!;
    expect([me.arrival_day, me.arrival_time, me.transport]).toEqual([plus(start, 1), "afternoon", "bus"]);
    expect(mustGiveArrival(camp, me)).toBe(false);
  });

  it("is asked of everyone who hasn't answered, and can be changed later", async () => {
    const start = thursday();
    const { camp, roomTypeId } = await thuToSun();
    const { id } = await register(camp, attendee(roomTypeId, { full_name: "Kofi Later", arrival_day: start, arrival_time: "morning", transport: "self" }));
    // Someone registered before this was asked.
    await query("app", "UPDATE camp_registrations SET arrival_day = '', arrival_time = '', transport = '' WHERE id = ?", [id]);
    const before = (await getRegistration(id))!;
    expect(mustGiveArrival(camp, before)).toBe(true);
    expect(mustGiveArrival({ status: "archived" }, before)).toBe(false);
    expect((await listArrivals(camp.id)).find((p) => p.id === id)!.arrival_day).toBe("");

    await expect(updateArrival(`attendee:${id}`, id, { arrival_day: plus(start, 3), arrival_time: "evening", transport: "bus" })).rejects.toThrow();
    await updateArrival(`attendee:${id}`, id, { arrival_day: plus(start, 3), arrival_time: "morning", transport: "self" });
    await updateArrival(`attendee:${id}`, id, { arrival_day: plus(start, 1), arrival_time: "evening", transport: "bus" });
    const after = (await getRegistration(id))!;
    expect(mustGiveArrival(camp, after)).toBe(false);
    expect(after.transport).toBe("bus");
    const entry = (await listHistory(camp.id, {})).find((e) => e.action === "registration.arrival")!;
    expect(entry.note).toBe("Friday, evening, by bus");
    expect(ACTOR).toBeTruthy();
  });
});
