import { beforeEach, describe, expect, it, vi } from "vitest";

// The sign-in cookie, without a browser: next/headers' cookie jar replaced by a Map.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (opts: { name: string } | string) => void jar.delete(typeof opts === "string" ? opts : opts.name),
  }),
}));

const { appPass, currentAttendee, signInWithAppPass, startAttendeeSession } = await import("@/lib/camp/session");
const { query } = await import("@/lib/cf");
const { getRegistrationWithCode } = await import("@/lib/camp/registrations");
const { registered } = await import("./helpers");

beforeEach(() => jar.clear());

describe("the sign-in cookie", () => {
  it("still lets in people signed in with the older cookie", async () => {
    const me = await registered();
    const { codeHash } = (await getRegistrationWithCode(me.id))!;
    await startAttendeeSession(me.id, codeHash);
    const value = jar.get("commune_attendee")!;
    jar.clear();
    jar.set("camp_attendee", value);
    expect((await currentAttendee(me.camp.id))?.id).toBe(me.id);
  });

  it("lets in only the person it was signed for", async () => {
    const me = await registered();
    const other = await registered();
    const { codeHash } = (await getRegistrationWithCode(me.id))!;
    await startAttendeeSession(me.id, codeHash);
    expect((await currentAttendee(me.camp.id))?.id).toBe(me.id);

    // Someone edits the cookie in the browser to be another person, keeping the signature.
    const [, expires, signature] = jar.get("commune_attendee")!.split(".");
    jar.set("commune_attendee", `${other.id}.${expires}.${signature}`);
    expect(await currentAttendee(other.camp.id)).toBeNull();

    // Or makes one up.
    jar.set("commune_attendee", `${me.id}.${Date.now() + 86_400_000}.forgedsignature`);
    expect(await currentAttendee(me.camp.id)).toBeNull();

    // Or stretches the expiry.
    jar.set("commune_attendee", `${me.id}.${Number(expires) + 1}.${signature}`);
    expect(await currentAttendee(me.camp.id)).toBeNull();
  });
});

describe("the Home Screen app's pass", () => {
  it("signs in once, for this person's current code and camp, so a copied link is no use", async () => {
    const { id, camp } = await registered({ full_name: "Esi Homescreen" });
    const other = await registered();
    const pass = (await appPass(id))!;
    expect(pass).toMatch(/^[0-9a-f-]{36}\.\d{10,16}\.[\w-]{32}$/);
    const [, expires] = pass.split(".");
    expect(await signInWithAppPass(camp, `${id}.${expires}.${"x".repeat(32)}`)).toBe(false);
    expect(await signInWithAppPass(other.camp, pass)).toBe(false);
    expect(await signInWithAppPass(camp, "nonsense")).toBe(false);
    // The expiry can't be pushed later without the signature changing.
    expect(await signInWithAppPass(camp, `${id}.${Number(expires) + 86_400_000}.${pass.split(".")[2]}`)).toBe(false);

    expect(await signInWithAppPass(camp, pass)).toBe(true);
    expect((await currentAttendee(camp.id))?.id).toBe(id);
    // Someone else opening the same link afterwards gets nothing.
    jar.clear();
    expect(await signInWithAppPass(camp, pass)).toBe(false);
    expect(await currentAttendee(camp.id)).toBeNull();
  });

  it("stops working after an hour, and when the code is changed", async () => {
    const { id, camp } = await registered();
    const pass = (await appPass(id))!;
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 61 * 60 * 1000 });
    try {
      expect(await signInWithAppPass(camp, pass)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
    const fresh = (await appPass(id))!;
    await query("app", "UPDATE camp_registrations SET code_hash = 'changed' WHERE id = ?", [id]);
    expect(await signInWithAppPass(camp, fresh)).toBe(false);
  });
});
