import { beforeEach, describe, expect, it, vi } from "vitest";

// The leader cookie without a browser: next/headers' jar replaced by a Map.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (opts: { name: string } | string) => void jar.delete(typeof opts === "string" ? opts : opts.name),
  }),
  headers: async () => new Headers(),
}));

const { query } = await import("@/lib/cf");
const { currentLeader, leaderName, newLeaderCode, signInLeader } = await import("@/lib/camp/leaders");
const { MEDICAL_TEAM } = await import("@/lib/camp/leader-name");
const { logMedicalCall, logMedicalSearch, medicalCard } = await import("@/lib/camp/medical");
const { listHistory } = await import("@/lib/camp/reports");
const { assertRole } = await import("@/lib/camp/roles");
const { createRoom } = await import("@/lib/camp/rooms");
const { assignPerson } = await import("@/lib/camp/assignments");
const { teamOwner } = await import("@/lib/camp/team-app");
const { validateStaff } = await import("@/lib/camp/staff");
const { CampError } = await import("@/lib/camp/types");
const { ACTOR, openCamp, paidUp } = await import("./helpers");

beforeEach(() => jar.clear());

describe("the medical team", () => {
  it("signs in with its shared code as its own role, and is refused everywhere else", async () => {
    await expect(newLeaderCode(ACTOR, "medical", "Nurses")).rejects.toThrow(CampError);
    const { code, id } = await newLeaderCode(ACTOR, "medical", MEDICAL_TEAM);
    expect(await signInLeader(code)).toEqual({ kind: "medical", value: MEDICAL_TEAM });
    const me = (await currentLeader())!;
    expect(me).toMatchObject({ role: "medical", email: "leader:medical:Medical team", codeId: id });
    expect(leaderName(me.email)).toBe(MEDICAL_TEAM);
    expect(teamOwner(me)).toBe(`leader:${id}`);
    // Not a leader, a coordinator or the Pastor: none of their pages or actions.
    for (const role of ["leader", "coordinator", "pastor", "admin"] as const) expect(() => assertRole(me, [role])).toThrow(CampError);
    expect(assertRole(me, ["medical", "coordinator"])).toBe(me);
    // And it can't be given to an email in Staff.
    expect(() => validateStaff({ email: "nurse@example.com", role: "medical", scope_kind: null, scope_value: null })).toThrow(CampError);
    // A new code replaces the old one.
    await newLeaderCode(ACTOR, "medical", MEDICAL_TEAM);
    expect(await currentLeader()).toBeNull();
  });

  it("sees health notes, the emergency contact, the room and roommates with phones; each look goes in the History", async () => {
    const { camp, roomTypeId } = await openCamp();
    const room = await createRoom(ACTOR, camp.id, { label: "M1", room_type_id: roomTypeId, gender: "female", capacity: 3 });
    const ama = await paidUp(camp, roomTypeId, { full_name: "Ama Patient" });
    const esi = await paidUp(camp, roomTypeId, { full_name: "Esi Roommate" });
    const lone = await paidUp(camp, roomTypeId, { full_name: "Akos Alone" });
    await query(
      "app",
      "UPDATE camp_registrations SET health_notes = 'Asthma: inhaler in bag', emergency_name = 'Kwame Patient', emergency_phone = '233245550101', is_minor = 1, guardian_name = 'Abena Patient', guardian_phone = '233245550102' WHERE id = ?",
      [ama.id],
    );
    await assignPerson(ACTOR, room, ama.id);
    await assignPerson(ACTOR, room, esi.id);

    const actor = "leader:medical:Medical team";
    const card = await medicalCard(actor, camp.id, ama.id);
    expect(card).toMatchObject({
      full_name: "Ama Patient",
      phone: ama.phone,
      health_notes: "Asthma: inhaler in bag",
      emergency_name: "Kwame Patient",
      emergency_phone: "233245550101",
      is_minor: 1,
      guardian_name: "Abena Patient",
      guardian_phone: "233245550102",
      room_label: "M1",
      roommates: [{ full_name: "Esi Roommate", phone: esi.phone }],
    });
    expect(await medicalCard(actor, camp.id, lone.id)).toMatchObject({ room_label: null, roommates: [], health_notes: "" });

    const logged = await query<{ actor: string }>("app", "SELECT actor FROM camp_audit_log WHERE action = 'medical.view' AND entity_id = ?", [ama.id]);
    expect(logged.map((l) => l.actor)).toEqual([actor]);

    // Calls: who was called, named from the database.
    await logMedicalCall(actor, camp.id, ama.id, "emergency");
    await logMedicalCall(actor, camp.id, ama.id, `roommate:${esi.id}`);
    await expect(logMedicalCall(actor, camp.id, ama.id, `roommate:${lone.id}`)).rejects.toThrow(CampError);
    const history = await listHistory(camp.id, { kind: "medical" });
    expect(history.map((h) => [h.action, h.note, h.person])).toEqual([
      ["medical.call", "their roommate Esi Roommate", "Ama Patient"],
      ["medical.call", "their emergency contact (Kwame Patient)", "Ama Patient"],
      ["medical.view", null, "Akos Alone"],
      ["medical.view", null, "Ama Patient"],
    ]);

    // Only people in this camp.
    const other = await openCamp();
    await expect(medicalCard(actor, other.camp.id, ama.id)).rejects.toThrow(CampError);
  });

  it("a finished search is one History entry; the same term again within a minute isn't repeated", async () => {
    const { camp } = await openCamp();
    const actor = "leader:medical:Medical team";
    await logMedicalSearch(actor, camp.id, "Ama  Patient ");
    await logMedicalSearch(actor, camp.id, "Ama Patient");
    await logMedicalSearch(actor, camp.id, "Kofi");
    await logMedicalSearch(actor, camp.id, "a");
    const notes = (await listHistory(camp.id, { kind: "medical" })).map((h) => h.note);
    expect(notes).toEqual(["“Kofi”", "“Ama Patient”"]);
  });
});
