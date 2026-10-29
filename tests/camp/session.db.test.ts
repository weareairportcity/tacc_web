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

const { currentAttendee, startAttendeeSession } = await import("@/lib/camp/session");
const { getRegistrationWithCode } = await import("@/lib/camp/registrations");
const { registered } = await import("./helpers");

beforeEach(() => jar.clear());

describe("the sign-in cookie", () => {
  it("lets in only the person it was signed for", async () => {
    const me = await registered();
    const other = await registered();
    const { codeHash } = (await getRegistrationWithCode(me.id))!;
    await startAttendeeSession(me.id, codeHash);
    expect((await currentAttendee(me.camp.id))?.id).toBe(me.id);

    // Someone edits the cookie in the browser to be another person, keeping the signature.
    const [, expires, signature] = jar.get("camp_attendee")!.split(".");
    jar.set("camp_attendee", `${other.id}.${expires}.${signature}`);
    expect(await currentAttendee(other.camp.id)).toBeNull();

    // Or makes one up.
    jar.set("camp_attendee", `${me.id}.${Date.now() + 86_400_000}.forgedsignature`);
    expect(await currentAttendee(me.camp.id)).toBeNull();

    // Or stretches the expiry.
    jar.set("camp_attendee", `${me.id}.${Number(expires) + 1}.${signature}`);
    expect(await currentAttendee(me.camp.id)).toBeNull();
  });
});
