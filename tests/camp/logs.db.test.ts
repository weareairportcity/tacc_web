import { describe, expect, it } from "vitest";
import { batch, post, query } from "@/lib/cf";
import { createCamp } from "@/lib/camp/camps";
import { accessStatements, listLogs, listPresence, presenceStatements } from "@/lib/camp/logs";
import { getPrivateDetails, updateProfile } from "@/lib/camp/profile";
import { register } from "@/lib/camp/registrations";
import { getActivity } from "@/lib/camp/stats";
import { TEST_WORKER_URL } from "../setup/constants";
import { ACTOR, attendee, openCamp } from "./helpers";

// The sign-in log, who's online, the visit counts, and the consent an under-18's guardian
// and anyone writing health notes give (migration 0020, tacc_stats).

const where = { place: "Accra, GH", device: "Android 15 · Chrome" };

describe("sign-in log", () => {
  it("shows sign-ins next to changes, newest first, and filters them", async () => {
    const { camp, roomTypeId } = await openCamp();
    const { id } = await register(camp, attendee(roomTypeId));
    await batch("app", accessStatements({ actor: `attendee:${id}`, role: "attendee", event: "sign_in", campId: camp.id }, where));
    await batch("app", accessStatements({ actor: "visitor", role: "visitor", event: "sign_in_failed", campId: camp.id, ok: false }, where));

    const all = await listLogs({ camp: camp.id });
    // The two sign-in entries are the newest; then the camp's changes, newest first.
    expect(all.entries.slice(0, 2).map((e) => e.kind)).toEqual(["access", "access"]);
    expect(all.entries.slice(2).map((e) => e.event)).toEqual(["registration.create", "room_type.create", "camp.create"]);
    const signIn = all.entries.find((e) => e.event === "sign_in")!;
    expect(signIn).toMatchObject({ person: "Ama Mensah", place: "Accra, GH", device: "Android 15 · Chrome", ok: 1, camp_name: camp.name });
    expect(all.entries.find((e) => e.event === "sign_in_failed")!.ok).toBe(0);

    expect((await listLogs({ camp: camp.id, kind: "sign-ins" })).entries.every((e) => e.kind === "access")).toBe(true);
    expect((await listLogs({ camp: camp.id, kind: "changes" })).entries.every((e) => e.kind === "change")).toBe(true);
    expect((await listLogs({ camp: camp.id, role: "visitor" })).entries.map((e) => e.event)).toEqual(["sign_in_failed"]);
    expect((await listLogs({ camp: camp.id, who: `attendee:${id}` })).entries.map((e) => e.event)).toEqual(["sign_in", "registration.create"]);
  });

  it("pages through older entries without skipping any", async () => {
    const { camp } = await openCamp();
    const stamps = Array.from({ length: 130 }, (_, i) => new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString());
    await batch(
      "app",
      stamps.map((at) => ({
        sql: "INSERT INTO camp_access_log (created_at, actor, role, event, camp_id) VALUES (?, 'visitor', 'visitor', 'lost_code', ?)",
        params: [at, camp.id],
      })),
    );
    const seen = new Set<string>();
    let before: string | undefined;
    for (let page = 0; page < 10; page++) {
      const { entries, next } = await listLogs({ camp: camp.id, kind: "sign-ins", before });
      for (const e of entries) seen.add(e.key);
      if (!next) break;
      before = next;
    }
    expect(seen.size).toBe(130);
  });
});

describe("who's online", () => {
  it("keeps one row per person, with when they signed in and out", async () => {
    const actor = `test-${crypto.randomUUID()}@example.com`;
    await batch("app", accessStatements({ actor, role: "coordinator", event: "sign_in" }, where));
    const first = (await listPresence()).find((p) => p.actor === actor)!;
    expect(first.signed_in_at).toBeTruthy();
    await batch("app", presenceStatements(actor, "coordinator", null, { place: "Kumasi, GH", device: "macOS · Safari" }));
    await batch("app", presenceStatements(actor, "coordinator", null, { place: "Kumasi, GH", device: "macOS · Safari" }));
    const rows = (await listPresence()).filter((p) => p.actor === actor);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ place: "Kumasi, GH", signed_in_at: first.signed_in_at });
    // Came today, once however often the tab says so.
    expect((await query("app", "SELECT * FROM camp_active_days WHERE actor = ?", [actor])).length).toBe(1);

    await batch("app", accessStatements({ actor, role: "coordinator", event: "sign_out" }, where));
    expect((await listPresence()).find((p) => p.actor === actor)!.signed_in_at).toBeNull();
  });
});

describe("visit counts", () => {
  const visit = (over: Record<string, unknown> = {}) =>
    fetch(`${TEST_WORKER_URL}/v1/c/v`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        area: "attendee",
        camp: "youth-camp-2026",
        dur: 95_000,
        flow: ["/:camp", "/:camp/register", "/:camp/me"],
        taps: { "/:camp · Register now": 1, "/:camp/me · Pay 0551112222": 1 },
        errors: [{ screen: "/:camp/me", message: "Load failed", stack: "at x" }],
        perf: { ttfb: 300, load: 1800, lcp: 2100, nav: 400, tap: 900 },
        dev: { device: "phone", os: "Android", osVersion: "15", browser: "Chrome", model: "SM-S921B", conn: "4g", lang: "en-GB" },
        src: "flyer",
        ...over,
      }),
    });

  it("keeps a visit as one row, without numbers that could be a phone or a code", async () => {
    expect((await visit()).status).toBe(204);
    const [row] = await query<{ flow: string; taps: string; errors: number; src: string; model: string }>(
      "stats",
      "SELECT flow, taps, errors, src, model FROM visits ORDER BY id DESC LIMIT 1",
    );
    expect(JSON.parse(row.flow)).toEqual(["/:camp", "/:camp/register", "/:camp/me"]);
    expect(Object.keys(JSON.parse(row.taps))).toEqual(["/:camp · Register now", "/:camp/me · Pay #"]);
    expect(row).toMatchObject({ errors: 1, src: "flyer", model: "SM-S921B" });
    expect((await visit({ area: "hacker" })).status).toBe(400);
    expect((await visit({ flow: ["not a screen"] })).status).toBe(400);
  });

  it("adds finished days up, once, and deletes visits after 90 days", async () => {
    const day = "2026-01-10";
    await query("stats", "DELETE FROM meta WHERE k = 'rolled'");
    await query("stats", "UPDATE visits SET day = ?", [day]);
    await query("stats", "UPDATE errors SET day = ?", [day]);
    const n = (await query<{ n: number }>("stats", "SELECT count(*) AS n FROM visits"))[0].n;

    const run = (now: string, usage: unknown = null) => post<{ rolled?: string[]; paused?: string }>("/v1/admin/stats/hourly", { now, usage });
    expect((await run("2026-01-11T05:00:00Z")).rolled).toEqual([day]);
    // A rerun adds nothing twice: the day is done.
    expect((await run("2026-01-11T06:00:00Z")).rolled).toEqual([]);
    const total = (await query<{ n: number }>("stats", "SELECT count(*) AS n FROM daily WHERE day = ?", [day]))[0].n;
    const daily = await query<{ dim: string; key: string; n: number; ms: number }>("stats", "SELECT dim, key, n, ms FROM daily WHERE day = ? AND area = 'attendee'", [day]);
    const get = (dim: string, key: string) => daily.find((r) => r.dim === dim && r.key === key);
    expect(get("visits", "")?.n).toBe(n);
    expect(get("screen", "/:camp/register")?.n).toBe(n);
    expect(get("flow", "/:camp/register → /:camp/me")?.n).toBe(n);
    expect(get("exit", "/:camp/me")?.n).toBe(n);
    expect(get("tap", "/:camp · Register now")?.n).toBe(n);
    expect(get("perf", "lcp")).toMatchObject({ n, ms: 2100 * n });
    expect(get("os", "Android 15")?.n).toBe(n);
    expect(get("error", "Load failed")?.n).toBe(n);

    // 90 days on, the day's visits go; its totals stay.
    await query("app", "INSERT OR IGNORE INTO camp_active_days (day, actor, role) VALUES (?, 'attendee:old', 'attendee')", [day]);
    await run("2026-06-01T05:00:00Z");
    expect((await query<{ n: number }>("stats", "SELECT count(*) AS n FROM visits WHERE day = ?", [day]))[0].n).toBe(0);
    expect((await query("app", "SELECT * FROM camp_active_days WHERE actor = 'attendee:old'")).length).toBe(0);
    expect((await query<{ n: number }>("stats", "SELECT count(*) AS n FROM daily WHERE day = ?", [day]))[0].n).toBe(total);
  });

  it("shows today's visits on the Activity page before the day is added up", async () => {
    await visit({ area: "coordinator", flow: ["/admin/:camp", "/admin/:camp/people"], camp: "" });
    const a = await getActivity(7, "coordinator");
    expect(a.dims.screen.find((c) => c.key === "/admin/:camp/people")?.n).toBeGreaterThan(0);
    expect(a.visitsByDay).toHaveLength(7);
  });

  it("stops counting for the day when the free limits are close", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const busy = { day: today, worker_requests: 0, d1_rows_read: 0, d1_rows_written: 80_000 };
    expect(await post("/v1/admin/stats/hourly", { usage: busy })).toEqual({ paused: today });
    const before = (await query<{ n: number }>("stats", "SELECT count(*) AS n FROM visits"))[0].n;
    expect((await visit()).status).toBe(204);
    expect((await query<{ n: number }>("stats", "SELECT count(*) AS n FROM visits"))[0].n).toBe(before);
    expect((await getActivity(7, null)).paused).toBe(true);
    await query("stats", "DELETE FROM meta WHERE k = 'paused'");
  });
});

describe("consent", () => {
  it("needs a guardian's name, phone and agreement for an under-18", async () => {
    const { camp, roomTypeId } = await openCamp();
    await expect(register(camp, attendee(roomTypeId, { is_minor: true }))).rejects.toThrow(/guardian's name.*guardian's phone.*agrees/);
    const { id } = await register(camp, attendee(roomTypeId, { is_minor: true, guardian_name: "Efua Mensah", guardian_phone: "024 555 0101", guardian_consent: true }));
    expect(await getPrivateDetails(id)).toMatchObject({ is_minor: 1, guardian_name: "Efua Mensah", guardian_phone: "233245550101" });
    const [row] = await query<{ guardian_consent_at: string | null }>("app", "SELECT guardian_consent_at FROM camp_registrations WHERE id = ?", [id]);
    expect(row.guardian_consent_at).toBeTruthy();
    // Over 18: nothing about a guardian is kept, whatever was typed.
    const adult = await register(camp, attendee(roomTypeId, { is_minor: false, guardian_name: "Someone" }));
    expect(await getPrivateDetails(adult.id)).toMatchObject({ is_minor: 0, guardian_name: "" });
  });

  it("asks an attendee to agree before keeping health notes, once", async () => {
    const { camp, roomTypeId } = await openCamp();
    const { id } = await register(camp, attendee(roomTypeId));
    const me = { full_name: "Ama Mensah", email: "ama@example.com", shirt_size: "" as const, emergency_name: "", emergency_phone: "", health_notes: "Asthma" };
    await expect(updateProfile(`attendee:${id}`, id, me)).rejects.toThrow(/agree/);
    await updateProfile(`attendee:${id}`, id, { ...me, health_consent: true });
    const agreed = (await getPrivateDetails(id)).health_consent_at;
    expect(agreed).toBeTruthy();
    // Not asked again, and the first agreement's date stays.
    await updateProfile(`attendee:${id}`, id, { ...me, health_notes: "Asthma, inhaler" });
    expect((await getPrivateDetails(id)).health_consent_at).toBe(agreed);
    // Removing the notes takes the agreement back.
    await updateProfile(`attendee:${id}`, id, { ...me, health_notes: "" });
    expect((await getPrivateDetails(id)).health_consent_at).toBeNull();
    // A coordinator noting what they were told doesn't need the tick.
    await updateProfile(ACTOR, id, { ...me, health_notes: "Told us: asthma" });
    expect((await getPrivateDetails(id)).health_notes).toBe("Told us: asthma");
  });
});

describe("addresses", () => {
  it("never gives a camp the address of one of Commune's own pages", async () => {
    const id = await createCamp(ACTOR, {
      name: "Privacy",
      venue: "x",
      starts_on: "2027-01-10",
      ends_on: "2027-01-12",
      registration_opens_on: "2026-11-01",
      registration_closes_on: "2027-01-01",
      payment_due_on: "2027-01-05",
      roommate_deadline_on: "2027-01-06",
      fee_bps: 195,
      status: "draft",
    });
    const [row] = await query<{ slug: string }>("app", "SELECT slug FROM camps WHERE id = ?", [id]);
    expect(row.slug).not.toBe("privacy");
  });
});
