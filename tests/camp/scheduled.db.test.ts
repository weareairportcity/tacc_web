import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { sendArrivalReminders } from "@/lib/camp/arrival-reminder";
import { cancelScheduled, listScheduled, scheduleMessage, sendScheduled } from "@/lib/camp/scheduled";
import { listHistory } from "@/lib/camp/reports";
import { ACTOR, attendee, openCamp } from "./helpers";
import { register } from "@/lib/camp/registrations";

// Messages scheduled for later, who set them up, cancelling, and the arrival reminder's wording.

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

describe("scheduling a message", () => {
  it("only accepts a sensible time and a real message", async () => {
    const { camp } = await openCamp();
    await expect(scheduleMessage(ACTOR, camp.id, { audience: "all", message: "Hello", how: "app", sendAt: inMinutes(0) })).rejects.toThrow("at least a few minutes");
    await expect(scheduleMessage(ACTOR, camp.id, { audience: "all", message: "Hello", how: "app", sendAt: "nonsense" })).rejects.toThrow("Choose when");
    await expect(scheduleMessage(ACTOR, camp.id, { audience: "all", message: "  ", how: "app", sendAt: inMinutes(60) })).rejects.toThrow("Write the message");
    await expect(scheduleMessage(ACTOR, camp.id, { audience: "everyone" as never, message: "Hello", how: "app", sendAt: inMinutes(60) })).rejects.toThrow("who it's for");
  });

  it("is listed with who scheduled it, can be cancelled once, and shows in History", async () => {
    const { camp } = await openCamp();
    const { id } = await scheduleMessage(ACTOR, camp.id, { audience: "owing", message: "Please pay what's left", how: "app", sendAt: inMinutes(60) });
    const before = await listScheduled(camp.id);
    expect(before.waiting.map((s) => [s.id, s.created_by, s.audience, s.message])).toEqual([[id, ACTOR, "owing", "Please pay what's left"]]);
    expect(before.done).toEqual([]);

    await cancelScheduled(ACTOR, id);
    await expect(cancelScheduled(ACTOR, id)).rejects.toThrow("already gone");
    const after = await listScheduled(camp.id);
    expect(after.waiting).toEqual([]);
    expect(after.done.map((s) => s.id)).toEqual([id]);
    const actions = (await listHistory(camp.id, {})).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["people.schedule", "people.schedule_cancel"]));
  });

  it("is not sent early, or after it's cancelled, and a send that can't go is recorded rather than lost", async () => {
    const { camp } = await openCamp();
    const later = await scheduleMessage(ACTOR, camp.id, { audience: "all", message: "Hello everyone", how: "app", sendAt: inMinutes(60) });
    expect(await sendScheduled(later.id, "https://example.test")).toEqual({ skipped: true });

    // Due now (made so directly): nobody is registered, so there is nobody to send to.
    const due = await scheduleMessage(ACTOR, camp.id, { audience: "all", message: "Hello everyone", how: "app", sendAt: inMinutes(60) });
    await query("app", "UPDATE camp_scheduled_sends SET send_at = ? WHERE id = ?", [inMinutes(-1), due.id]);
    const sent = await sendScheduled(due.id, "https://example.test");
    expect(sent.skipped).toBe(false);
    // Claimed: a second caller does nothing.
    expect(await sendScheduled(due.id, "https://example.test")).toEqual({ skipped: true });
    const [row] = await query<{ sent_at: string | null; result_json: string | null }>("app", "SELECT sent_at, result_json FROM camp_scheduled_sends WHERE id = ?", [due.id]);
    expect(row.sent_at).not.toBeNull();
    expect(JSON.parse(row.result_json!).error).toBeTruthy();

    const cancelled = await scheduleMessage(ACTOR, camp.id, { audience: "all", message: "Hello everyone", how: "app", sendAt: inMinutes(60) });
    await query("app", "UPDATE camp_scheduled_sends SET send_at = ? WHERE id = ?", [inMinutes(-1), cancelled.id]);
    await cancelScheduled(ACTOR, cancelled.id);
    expect(await sendScheduled(cancelled.id, "https://example.test")).toEqual({ skipped: true });
  });
});

describe("the arrival and health reminder", () => {
  it("greets each person and says only what they're missing", async () => {
    const { camp: made, roomTypeId } = await openCamp();
    await query("app", "UPDATE camps SET details_required = 1 WHERE id = ?", [made.id]);
    const camp = { ...made, details_required: 1 };
    // Missing both: no answers at all.
    const both = await register(camp, attendee(roomTypeId, { full_name: "Ama Mensah", emergency_name: "Kofi, father", emergency_phone: "0245550101", health_none: true }));
    await query("app", "UPDATE camp_registrations SET arrival_day = '', arrival_time = '', transport = '', emergency_name = '', emergency_phone = '', health_none = 0 WHERE id = ?", [both.id]);
    // Missing arrival only.
    const arrival = await register(camp, attendee(roomTypeId, { full_name: "Kofi Boateng", emergency_name: "Esi, mother", emergency_phone: "0245550102", health_none: true }));
    await query("app", "UPDATE camp_registrations SET arrival_day = '', arrival_time = '', transport = '' WHERE id = ?", [arrival.id]);
    // Missing nothing.
    await register(camp, attendee(roomTypeId, { full_name: "Esi Complete", emergency_name: "Kojo, uncle", emergency_phone: "0245550103", health_none: true }));

    const r = (await sendArrivalReminders(camp.id, { dry: true, origin: "https://commune.test" })) as { counts: Record<string, number>; sample: Record<string, string> };
    expect(r.counts).toMatchObject({ arrival: 1, details: 0, both: 1 });
    expect(r.sample.arrival).toBe(`Hi Ama, please tell us which day and time you'll arrive at ${camp.name}, and whether you're coming by bus or by yourself. It takes a minute: https://commune.test/${camp.slug}/me - The Airport City Church`);
    expect(r.sample.both).toContain("Hi Ama, before");
    expect(r.sample.details).toContain("emergency contact and any health needs");
  });
});
