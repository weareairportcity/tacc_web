import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { formatCode, generateCode, hashCode, normalizeCode } from "@/lib/camp/codes";
import { allow } from "@/lib/camp/rate-limit";
import {
  cancelRegistration,
  findByCode,
  getRegistration,
  normalizePhone,
  register,
  resetCode,
} from "@/lib/camp/registrations";
import { createRoomType, deleteRoomType } from "@/lib/camp/rooms";
import { ACTOR, attendee, openCamp, registered } from "./helpers";

describe("registering", () => {
  it("saves the form, derives the PFCC and copies the price", async () => {
    const { id } = await registered({ phone: "+233 24 555 0101", email: " Ama@Example.COM ", fellowship: "Chosen" });
    expect(await getRegistration(id)).toMatchObject({
      phone: "233245550101",
      email: "ama@example.com",
      fellowship: "Chosen",
      pfcc: "PFCC 1",
      church: "TACC",
      price_pesewas: 60000,
      paid_pesewas: 0,
      status: "registered",
      room_type_name: "Hostel",
    });
  });

  it("allows one registration per phone per camp", async () => {
    const { camp, roomTypeId } = await openCamp();
    await register(camp, attendee(roomTypeId, { phone: "0245550202" }));
    await expect(register(camp, attendee(roomTypeId, { phone: "+233245550202" }))).rejects.toThrow("already registered");
  });

  it("lists every problem with the form at once", async () => {
    const { camp, roomTypeId } = await openCamp();
    const bad = attendee(roomTypeId, { full_name: " ", phone: "123", email: "nope", fellowship: "Made Up", church: "Other" });
    await expect(register(camp, bad)).rejects.toThrow(/full name.*phone.*email.*fellowship.*church/);
  });

  it("rejects a room type from another camp", async () => {
    const { camp } = await openCamp();
    const other = await openCamp();
    await expect(register(camp, attendee(other.roomTypeId))).rejects.toThrow("room type");
  });

  it("only takes registrations while the camp is open", async () => {
    const draft = await openCamp({ status: "draft" });
    await expect(register(draft.camp, attendee(draft.roomTypeId))).rejects.toThrow("closed");
    const { camp, roomTypeId } = await openCamp();
    await expect(register(camp, attendee(roomTypeId), "2099-01-01")).rejects.toThrow("closed");
  });

  it("is fully paid straight away for a free room type", async () => {
    const { camp } = await openCamp();
    const free = await createRoomType(ACTOR, camp.id, { name: "Free", price_pesewas: 0, capacity: 2 });
    const { id } = await register(camp, attendee(free));
    expect((await getRegistration(id))?.status).toBe("fully_paid");
  });

  it("keeps a room type with registrations from being deleted", async () => {
    const { roomTypeId } = await registered();
    await expect(deleteRoomType(ACTOR, roomTypeId)).rejects.toThrow("registration");
  });

  it("keeps contact details out of the audit log", async () => {
    const { id } = await registered({ phone: "0245550303" });
    const [entry] = await query<{ after_json: string }>(
      "app",
      "SELECT after_json FROM camp_audit_log WHERE entity_id = ? AND action = 'registration.create'",
      [id],
    );
    expect(entry.after_json).not.toContain("245550303");
    expect(entry.after_json).not.toContain("@");
  });

  it("can be cancelled once, with an audit entry", async () => {
    const { id } = await registered();
    await cancelRegistration(ACTOR, id);
    expect((await getRegistration(id))?.status).toBe("cancelled");
    await expect(cancelRegistration(ACTOR, id)).rejects.toThrow("already cancelled");
  });
});

describe("sign-in codes", () => {
  it("are 8 characters from an unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(normalizeCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(formatCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("are stored only as a keyed hash", async () => {
    const { id, code } = await registered();
    const [row] = await query<{ code_hash: string }>("app", "SELECT code_hash FROM camp_registrations WHERE id = ?", [id]);
    expect(row.code_hash).toBe(hashCode(code));
    expect(row.code_hash).not.toContain(code);
  });

  it("open only their own camp's registration", async () => {
    const { camp, id, code } = await registered();
    expect((await findByCode(camp.id, formatCode(code).toLowerCase()))?.id).toBe(id);
    const other = await openCamp();
    expect(await findByCode(other.camp.id, code)).toBeNull();
    expect(await findByCode(camp.id, "ZZZZZZZZ")).toBeNull();
    expect(await findByCode(camp.id, "short")).toBeNull();
  });

  it("can be replaced by phone, which retires the old code", async () => {
    const { camp, id, code } = await registered({ phone: "0245550404" });
    const reset = await resetCode(camp.id, "+233 24 555 0404");
    expect(reset).toMatchObject({ id, phone: "233245550404" });
    expect(await findByCode(camp.id, code)).toBeNull();
    expect((await findByCode(camp.id, reset!.code))?.id).toBe(id);
    expect(await resetCode(camp.id, "0209999999")).toBeNull();
  });
});

describe("rate limiting", () => {
  it("stops after the limit within the window", async () => {
    const key = `test:${crypto.randomUUID()}`;
    expect(await allow(key, 2, 60_000)).toBe(true);
    expect(await allow(key, 2, 60_000)).toBe(true);
    expect(await allow(key, 2, 60_000)).toBe(false);
  });

  it("holds under parallel attempts", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 12 }, () => allow(key, 5, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it("starts a new window once the old one has passed", async () => {
    const key = `test:${crypto.randomUUID()}`;
    expect(await allow(key, 1, 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(await allow(key, 1, 1)).toBe(true);
  });
});

describe("phone numbers", () => {
  it("normalise to 233 and reject the wrong length", () => {
    expect(normalizePhone("0551112222")).toBe("233551112222");
    expect(normalizePhone("+233 55 111 2222")).toBe("233551112222");
    expect(normalizePhone("551112222")).toBe("233551112222");
    expect(normalizePhone("05511122")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});
