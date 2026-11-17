import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { appInfo, markInstalled, mustSetUpApp, setTextsOnly } from "@/lib/camp/app-first";
import { inAudience } from "@/lib/camp/broadcast-audience";
import { listRecipients } from "@/lib/camp/broadcast";
import { logCampSms, smsUse } from "@/lib/camp/sms-log";
import { savePushSub } from "@/lib/camp/push";
import { registered } from "./helpers";

// App first: attendees set up Commune on their phone before their page opens,
// unless they chose texts; coordinators see who has, and what texts cost.

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const none = { installed: false, push: false, textsOnly: false };

describe("setting up the app first", () => {
  it("is asked on phones until the app is on the Home Screen with notifications on", () => {
    const camp = { app_required: 1 };
    const me = { status: "registered" as const };
    expect(mustSetUpApp(camp, me, none, IPHONE)).toBe(true);
    expect(mustSetUpApp(camp, me, { ...none, installed: true }, IPHONE)).toBe(true);
    expect(mustSetUpApp(camp, me, { ...none, push: true }, IPHONE)).toBe(true);
    expect(mustSetUpApp(camp, me, { ...none, installed: true, push: true }, IPHONE)).toBe(false);
  });

  it("isn't asked on computers, of people who chose texts, of cancelled registrations, or when switched off", () => {
    const me = { status: "registered" as const };
    expect(mustSetUpApp({ app_required: 1 }, me, none, MAC)).toBe(false);
    expect(mustSetUpApp({ app_required: 1 }, me, { ...none, textsOnly: true }, IPHONE)).toBe(false);
    expect(mustSetUpApp({ app_required: 1 }, { status: "cancelled" }, none, IPHONE)).toBe(false);
    expect(mustSetUpApp({ app_required: 0 }, me, none, IPHONE)).toBe(false);
  });

  it("remembers the first install, notifications and texts only, and coordinators see each state", async () => {
    const { id, camp } = await registered({ full_name: "Adwoa Appfirst" });
    expect(await appInfo(id)).toEqual(none);
    const state = async () => (await listRecipients(camp.id)).find((r) => r.id === id)?.app;
    expect(await state()).toBe("none");

    await markInstalled(id, "ios");
    const [first] = await query<{ app_installed_at: string; app_platform: string }>("app", "SELECT app_installed_at, app_platform FROM camp_registrations WHERE id = ?", [id]);
    expect(first.app_platform).toBe("ios");
    await markInstalled(id, "ios");
    const [again] = await query<{ app_installed_at: string }>("app", "SELECT app_installed_at FROM camp_registrations WHERE id = ?", [id]);
    expect(again.app_installed_at).toBe(first.app_installed_at);
    expect(await state()).toBe("installed");

    await savePushSub(`attendee:${id}`, { endpoint: `https://push.example/${id}`, keys: { p256dh: "BHxyzBHxyzBHxyzBHxyzBHxyz", auth: "authauthauthauth" } });
    expect(await appInfo(id)).toEqual({ installed: true, push: true, textsOnly: false });
    expect(await state()).toBe("on");

    const other = await registered({ full_name: "Kofi Textsonly" });
    await setTextsOnly(other.id, true);
    expect((await appInfo(other.id)).textsOnly).toBe(true);
    expect((await listRecipients(other.camp.id)).find((r) => r.id === other.id)?.app).toBe("texts");
  });

  it("splits who a message is for", () => {
    expect(inAudience({ status: "partially_paid", app: "on" }, "owing")).toBe(true);
    expect(inAudience({ status: "fully_paid", app: "on" }, "owing")).toBe(false);
    expect(inAudience({ status: "fully_paid", app: "texts" }, "noapp")).toBe(true);
    expect(inAudience({ status: "registered", app: "on" }, "noapp")).toBe(false);
  });
});

describe("what texts cost", () => {
  it("is added up per kind for each camp", async () => {
    const { camp } = await registered();
    await logCampSms({ campId: camp.id, kind: "broadcast", texts: 3, credits: 6, pushed: 2, note: "Hello" });
    await logCampSms({ campId: camp.id, kind: "broadcast", texts: 1, credits: 2 });
    await logCampSms({ campId: camp.id, kind: "room", texts: 4, credits: 4 });
    expect(await smsUse(camp.id)).toEqual([
      { kind: "broadcast", texts: 4, credits: 8, pushed: 2 },
      { kind: "room", texts: 4, credits: 4, pushed: 0 },
    ]);
  });
});

describe("the Home Screen app's pass", () => {
  it("only signs in with a pass made for this person's current code and camp", async () => {
    const { appPass, signInWithAppPass } = await import("@/lib/camp/session");
    const { id, camp } = await registered({ full_name: "Esi Homescreen" });
    const other = await registered();
    const pass = (await appPass(id))!;
    expect(pass).toMatch(/^[0-9a-f-]{36}\.[\w-]{32}$/);
    expect(await signInWithAppPass(camp, `${id}.${"x".repeat(32)}`)).toBe(false);
    expect(await signInWithAppPass(other.camp, pass)).toBe(false);
    expect(await signInWithAppPass(camp, "nonsense")).toBe(false);
    // A new code turns old passes off.
    await query("app", "UPDATE camp_registrations SET code_hash = 'changed' WHERE id = ?", [id]);
    expect(await signInWithAppPass(camp, pass)).toBe(false);
  });
});
