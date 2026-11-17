import { describe, expect, it } from "vitest";
import { post, query } from "@/lib/cf";
import { markScan } from "@/lib/camp/checkin";
import { listInbox, markAllRead, unreadCount } from "@/lib/camp/inbox";
import { leaderActor, leaderName, newLeaderCode } from "@/lib/camp/leaders";
import { getFellowshipBreakdown, idsInScope, listPeopleForLeader, scopeFor } from "@/lib/camp/reports";
import { inScope, scopeSql } from "@/lib/camp/scope";
import { CampError } from "@/lib/camp/types";
import { FELLOWSHIPS, GROUPS, fellowshipsInGroup, groupForFellowship } from "@/lib/fellowships";
import { ACTOR, openCamp, paidUp } from "./helpers";

// Group Leaders (PFCC → group → fellowship): the group comes from the
// fellowship name, each Group Leader has their own named code, and they see
// everyone in their group's fellowships. Plus the Notifications page's inbox.

const check = (code: string) =>
  post<{ id: string; scope_kind: string; scope_value: string; holder_name: string | null }>("/v1/admin/camp/leader-code/check", { code });

describe("groups", () => {
  it("every fellowship but Children's Church is in exactly one group, under its own PFCC", () => {
    for (const f of FELLOWSHIPS) {
      if (f.name === "Children's Church") expect(f.group).toBeNull();
      else expect(GROUPS).toContain(f.group);
    }
    expect(fellowshipsInGroup("Group 2")).toEqual(["Higher Achievers", "Enthroned", "Blessed Land", "Rabah"]);
    expect(groupForFellowship("Pastor's Fellowship")).toBe("Pastor's Group");
    expect(FELLOWSHIPS.some((f) => f.name === "Fruitful")).toBe(false);
    // A group never spans two PFCCs.
    for (const g of GROUPS) expect(new Set(FELLOWSHIPS.filter((f) => f.group === g).map((f) => f.pfcc)).size).toBe(1);
  });

  it("scope: a group is its fellowships; an unknown group is nobody", () => {
    const g = { kind: "group" as const, value: "Group 1" };
    expect(scopeSql(g)).toEqual({ sql: " AND r.fellowship IN (?,?,?)", params: ["Chosen", "Royalties", "Ecclesia"] });
    expect(scopeSql({ kind: "group", value: "Group 9" }).sql).toBe(" AND 0");
    expect(inScope({ fellowship: "Royalties", pfcc: "PFCC 1" }, g)).toBe(true);
    expect(inScope({ fellowship: "Rabah", pfcc: "PFCC 1" }, g)).toBe(false);
  });

  it("names a Group Leader in History by their own name", () => {
    expect(leaderName(leaderActor("group", "Group 1", "Richmond Asante"))).toBe("Richmond Asante (Group 1 leader)");
    expect(leaderName(leaderActor("fellowship", "Qadash"))).toBe("Qadash leader");
  });
});

describe("Group Leader codes", () => {
  it("one per person: two leaders of a group each have a code; a new one replaces only that person's", async () => {
    await expect(newLeaderCode(ACTOR, "group", "Group 3")).rejects.toThrow(CampError);
    await expect(newLeaderCode(ACTOR, "group", "Group 9", "Ama")).rejects.toThrow(CampError);
    const nana = await newLeaderCode(ACTOR, "group", "Group 3", "Nana Yaa Amoakohene");
    const kofi = await newLeaderCode(ACTOR, "group", "Group 3", "Kofi Test");
    expect(await check(nana.code)).toMatchObject({ scope_kind: "group", scope_value: "Group 3", holder_name: "Nana Yaa Amoakohene" });
    const again = await newLeaderCode(ACTOR, "group", "Group 3", "Nana Yaa Amoakohene");
    await expect(check(nana.code)).rejects.toThrow();
    expect(await check(again.code)).toMatchObject({ id: again.id });
    expect(await check(kofi.code)).toMatchObject({ id: kofi.id });
    // Shared codes are unchanged: one per fellowship.
    const a = await newLeaderCode(ACTOR, "fellowship", "Radah");
    await newLeaderCode(ACTOR, "fellowship", "Radah");
    await expect(check(a.code)).rejects.toThrow();
  });

  it("sees, pays for and scans everyone in the group's fellowships, nobody else", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ha = await paidUp(camp, roomTypeId, { full_name: "Ama Achiever", fellowship: "Higher Achievers" });
    const rabah = await paidUp(camp, roomTypeId, { full_name: "Esi Rabah", fellowship: "Rabah" });
    const chosen = await paidUp(camp, roomTypeId, { full_name: "Kofi Chosen", fellowship: "Chosen" });
    const staff = { email: leaderActor("group", "Group 2", "Philippine Amon"), role: "leader" as const, scope_kind: "group" as const, scope_value: "Group 2" };
    const scope = scopeFor(staff);

    expect((await listPeopleForLeader(staff, camp.id, {})).map((p) => p.full_name).sort()).toEqual(["Ama Achiever", "Esi Rabah"]);
    expect(await idsInScope(camp.id, [ha.id, rabah.id, chosen.id], scope)).toEqual([ha.id, rabah.id]);
    expect((await markScan(staff.email, camp.id, rabah.id, "checkin", scope)).already).toBe(false);
    await expect(markScan(staff.email, camp.id, chosen.id, "checkin", scope)).rejects.toThrow("isn't in Group 2");

    const ranked = await getFellowshipBreakdown(camp.id, scope);
    expect(ranked.map((f) => f.name).sort()).toEqual(["Higher Achievers", "Rabah"]);
    expect(ranked.every((f) => f.group === "Group 2" && f.fully_paid === 1 && f.paid === f.expected && f.expected > 0)).toBe(true);
    expect((await getFellowshipBreakdown(camp.id, { kind: "all" })).map((f) => f.name)).toContain("Chosen");
  });
});

describe("Notifications page (inbox)", () => {
  it("keeps every app notification for the coordinators, the person's leaders (group too) and the attendee, phone or not", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ama = await paidUp(camp, roomTypeId, { full_name: "Ama Inbox", fellowship: "Enthroned" });
    const coordinator = `inbox-${Date.now()}@test.local`;
    await query("app", "INSERT INTO camp_staff (email, role) VALUES (?, 'coordinator')", [coordinator]);
    const group = await newLeaderCode(ACTOR, "group", "Group 2", `Inbox Leader ${Date.now()}`);
    const other = await newLeaderCode(ACTOR, "group", "Group 4", `Other Leader ${Date.now()}`);

    await post("/v1/admin/camp/notify", { to: "staff", kind: "registration", registration_id: ama.id, title: "New registration", body: "Ama Inbox, Enthroned", url: `/admin/camp/${camp.id}/people?person=${ama.id}` });
    await post("/v1/admin/camp/notify", { to: "attendee", kind: "room_ready", registration_id: ama.id, title: "Your room is ready", body: "Room 4", url: `/camps/${camp.slug}/me/room` });

    // Other test files notify coordinators at the same time: find this one by where it points.
    const staffInbox = await listInbox(`staff:${coordinator}`);
    expect(staffInbox.find((i) => i.url === `/admin/camp/${camp.id}/people?person=${ama.id}`)).toMatchObject({ kind: "registration", title: "New registration", read_at: null });
    const leaderInbox = await listInbox(`leader:${group.id}`);
    expect(leaderInbox.find((i) => i.url === `/leaders/${camp.id}/people?person=${ama.id}`)).toMatchObject({ kind: "registration" });
    expect(await listInbox(`leader:${other.id}`)).toEqual([]);
    expect((await listInbox(`attendee:${ama.id}`)).map((i) => i.title)).toEqual(["Your room is ready"]);

    expect(await unreadCount(`attendee:${ama.id}`)).toBe(1);
    await markAllRead(`attendee:${ama.id}`);
    expect(await unreadCount(`attendee:${ama.id}`)).toBe(0);
    expect((await listInbox(`attendee:${ama.id}`))[0].read_at).not.toBeNull();
    await query("app", "DELETE FROM camp_staff WHERE email = ?", [coordinator]);
  });
});

describe("the Pastor and the 7pm summaries", () => {
  it("a Pastor reaches only what lists them, and sees the whole camp", async () => {
    const { assertRole } = await import("@/lib/camp/roles");
    const pastor = { email: "pastor@test.local", role: "pastor" as const, scope_kind: null, scope_value: null };
    expect(() => assertRole(pastor, ["coordinator"])).toThrow(CampError);
    expect(() => assertRole(pastor, ["coordinator", "leader"])).toThrow(CampError);
    expect(assertRole(pastor, ["coordinator", "pastor"])).toBe(pastor);
    expect(scopeFor(pastor)).toEqual({ kind: "all" });
  });

  it("the Pastor gets the whole camp, each Group Leader their group, on their Notifications page", async () => {
    const PASTOR = `pastor-${Date.now()}@test.local`;
    await query("app", "INSERT INTO camp_staff (email, role) VALUES (?, 'pastor')", [PASTOR]);
    const { camp, roomTypeId } = await openCamp();
    await paidUp(camp, roomTypeId, { full_name: "Ama Summary", fellowship: "Rabah" });
    await paidUp(camp, roomTypeId, { full_name: "Kofi Summary", fellowship: "Chosen" });
    const g2 = await newLeaderCode(ACTOR, "group", "Group 2", `Summary Leader ${Date.now()}`);

    await post("/v1/admin/camp/summary", {});
    const [pastor] = (await listInbox(`staff:${PASTOR}`)).filter((i) => i.url === `/admin/camp/${camp.id}/report`);
    expect(pastor).toMatchObject({ kind: "daily", title: `${camp.name}: today` });
    // paidUp marks them paid without a payment row, so nothing came in today.
    expect(pastor.body).toBe("Today: 2 new registrations and GHS 0 received. In total, 2 of 2 people are fully paid, with GHS 0 left to pay.");
    const [group] = (await listInbox(`leader:${g2.id}`)).filter((i) => i.url === `/leaders/${camp.id}/people/fellowships`);
    expect(group).toMatchObject({ kind: "daily", title: `${camp.name}: Group 2 today` });
    expect(group.body).toBe("Today: 1 new registration and GHS 0 received. In total, 1 of 1 person is fully paid, with GHS 0 left to pay.");

    // Once a day: a second run sends nothing new.
    await post("/v1/admin/camp/summary", {});
    expect((await listInbox(`staff:${PASTOR}`)).filter((i) => i.url === `/admin/camp/${camp.id}/report`)).toHaveLength(1);
    await query("app", "DELETE FROM camp_staff WHERE email = ?", [PASTOR]);
  });
});

describe("full names", () => {
  it("need a first name and surname", async () => {
    const { isFullName } = await import("@/lib/camp/names");
    expect(isFullName("Ama")).toBe(false);
    expect(isFullName("Ama .")).toBe(false);
    expect(isFullName("  Ama   Mensah ")).toBe(true);
    expect(isFullName("Ama K. Mensah")).toBe(true);
    expect(isFullName("Adwoa Nyarko-Boateng")).toBe(true);
    const { register } = await import("@/lib/camp/registrations");
    const { attendee } = await import("./helpers");
    const { camp, roomTypeId } = await openCamp();
    await expect(register(camp, attendee(roomTypeId, { full_name: "Ama" }))).rejects.toThrow("first name and surname");
  });
});

describe("iPads install the app too", () => {
  it("a marked Mac counts as an iPad; a real Mac and a phone are unchanged", async () => {
    const { agentFor } = await import("@/lib/camp/ipad");
    const { isPhone, mustSetUpApp } = await import("@/lib/camp/app-first");
    const { mustSetUpTeamApp } = await import("@/lib/camp/team-app");
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
    expect(isPhone(agentFor(mac, undefined))).toBe(false);
    expect(isPhone(agentFor(mac, "1"))).toBe(true);
    expect(agentFor(iphone, "1")).toBe(iphone);
    const notSetUp = { installed: false, push: false, textsOnly: false };
    expect(mustSetUpApp({ app_required: 1 }, { status: "registered" }, notSetUp as never, agentFor(mac, "1"))).toBe(true);
    expect(mustSetUpApp({ app_required: 1 }, { status: "registered" }, notSetUp as never, agentFor(mac, undefined))).toBe(false);
    expect(mustSetUpTeamApp({ installed: false, push: false }, agentFor(mac, "1"))).toBe(true);
  });
});
