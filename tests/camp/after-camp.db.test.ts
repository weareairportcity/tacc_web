import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { getCamp } from "@/lib/camp/camps";
import { arrivalCounts, markScan, scanRoster, scanTime, syncScans } from "@/lib/camp/checkin";
import { feedbackPerson, feedbackSummary, hasAnswered, listFeedback, listThanksPending, sendThanks, submitFeedback } from "@/lib/camp/feedback";
import { leaderActor } from "@/lib/camp/leaders";
import { idsInScope, listHistory } from "@/lib/camp/reports";
import { makeToken } from "@/lib/camp/tokens";
import type { Camp } from "@/lib/camp/types";
import { ACTOR, openCamp, paidUp } from "./helpers";

// Scans sent late from a phone with no signal, leaders paying only for their
// own people, and after camp: thank-you texts and anonymous feedback.

const qadash = { kind: "fellowship" as const, value: "Qadash" };

describe("scans kept on a phone with no signal", () => {
  it("keep the time they happened, within a week", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    expect(scanTime("2026-10-26T09:15:00.000Z", now)).toBe("2026-10-26T09:15:00.000Z");
    expect(scanTime("2026-10-27T09:15:00.000Z", now)).toBeNull();
    expect(scanTime("2026-10-01T09:15:00.000Z", now)).toBeNull();
    expect(scanTime("not a time", now)).toBeNull();
  });

  it("go up oldest first, each on its own, and turned-down ones say why", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ama = await paidUp(camp, roomTypeId, { full_name: "Ama Qadash", fellowship: "Qadash" });
    const kofi = await paidUp(camp, roomTypeId, { full_name: "Kofi Qadash", fellowship: "Qadash" });
    const esi = await paidUp(camp, roomTypeId, { full_name: "Esi Chosen", fellowship: "Chosen" });
    await markScan(ACTOR, camp.id, kofi.id, "checkin");
    const at = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const results = await syncScans(leaderActor("fellowship", "Qadash"), camp.id, [
      { key: "b", id: esi.id, mode: "checkin", at },
      { key: "a", id: ama.id, mode: "checkin", at },
      { key: "c", id: kofi.id, mode: "checkin", at },
    ], qadash);
    expect(results).toEqual([
      { key: "b", ok: false, error: "Esi Chosen isn't in Qadash." },
      { key: "a", ok: true, name: "Ama Qadash", already: false },
      { key: "c", ok: true, name: "Kofi Qadash", already: true },
    ]);
    const [row] = await query<{ checked_in_at: string }>("app", "SELECT checked_in_at FROM camp_registrations WHERE id = ?", [ama.id]);
    expect(row.checked_in_at).toBe(at);
    const entry = (await listHistory(camp.id, {})).find((e) => e.entity_id === ama.id && e.action === "registration.check_in");
    expect(entry?.actor).toBe(leaderActor("fellowship", "Qadash"));
  });

  it("the phone's list is the leader's own people, with no phones or health notes", async () => {
    const { camp, roomTypeId } = await openCamp();
    await paidUp(camp, roomTypeId, { full_name: "Ama Qadash", fellowship: "Qadash" });
    await paidUp(camp, roomTypeId, { full_name: "Esi Chosen", fellowship: "Chosen" });
    const list = await scanRoster(camp.id, qadash);
    expect(list.map((p) => p.full_name)).toEqual(["Ama Qadash"]);
    expect(Object.keys(list[0]).sort()).toEqual(["checked_in_at", "fellowship", "full_name", "id", "room_label", "shirt_given_at", "shirt_size", "status"]);
    expect((await scanRoster(camp.id)).length).toBe(2);
  });
});

describe("leaders paying", () => {
  it("can only name their own people", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ama = await paidUp(camp, roomTypeId, { fellowship: "Qadash" });
    const esi = await paidUp(camp, roomTypeId, { fellowship: "Chosen" });
    const other = await openCamp();
    const elsewhere = await paidUp(other.camp, other.roomTypeId, { fellowship: "Qadash" });
    expect(await idsInScope(camp.id, [ama.id, esi.id, elsewhere.id, "nonsense"], qadash)).toEqual([ama.id]);
    expect(await idsInScope(camp.id, [ama.id, esi.id, ama.id], { kind: "all" })).toEqual([ama.id, esi.id]);
  });
});

/** A camp that ended yesterday, with people who arrived and one who didn't. */
async function endedCamp() {
  const { camp: open, roomTypeId } = await openCamp();
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const came = await paidUp(open, roomTypeId, { full_name: "Ama Mensah" });
  const alsoCame = await paidUp(open, roomTypeId, { full_name: "Kofi Boateng" });
  const stayedHome = await paidUp(open, roomTypeId, { full_name: "Esi Owusu" });
  await markScan(ACTOR, open.id, came.id, "checkin");
  await markScan(ACTOR, open.id, alsoCame.id, "checkin");
  await query("app", "UPDATE camps SET starts_on = ?, ends_on = ? WHERE id = ?", [day(-4), day(-1), open.id]);
  return { camp: (await getCamp(open.id)) as Camp, came, alsoCame, stayedHome };
}

describe("after camp", () => {
  it("thank-you texts go to people who arrived, once each; a failed one is retried", async () => {
    const { camp, came, alsoCame } = await endedCamp();
    expect((await listThanksPending(camp.id)).map((p) => p.full_name)).toEqual(["Ama Mensah", "Kofi Boateng"]);

    const texts: { to: string; text: string }[] = [];
    const first = await sendThanks(ACTOR, camp, "https://commune.test", async (to, text) => {
      if (to === alsoCame.phone) return false;
      texts.push({ to, text });
      return true;
    });
    expect(first).toEqual({ sent: 1, failed: 1, remaining: 1 });
    expect(texts[0].to).toBe(came.phone);
    expect(texts[0].text).toContain(`Thank you for coming to ${camp.name}, Ama!`);
    expect(texts[0].text).toContain(`https://commune.test/camps/${camp.slug}/feedback/${makeToken("feedback", came.id)}`);

    const second = await sendThanks(ACTOR, camp, "https://commune.test", async (to) => {
      texts.push({ to, text: "" });
      return true;
    });
    expect(second).toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(texts.map((t) => t.to)).toEqual([came.phone, alsoCame.phone]);
    await expect(sendThanks(ACTOR, camp, "https://commune.test", async () => true)).rejects.toThrow("Everyone who arrived");
    expect((await feedbackSummary(camp.id)).texted).toBe(2);
  });

  it("not before the last day of camp", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ama = await paidUp(camp, roomTypeId);
    await markScan(ACTOR, camp.id, ama.id, "checkin");
    await expect(sendThanks(ACTOR, camp, "https://commune.test", async () => true)).rejects.toThrow("last day");
    await expect(submitFeedback(camp, makeToken("feedback", ama.id), { rating: 5, best: "", change: "" })).rejects.toThrow("last day");
  });

  it("feedback is anonymous, once per person, and only from people who arrived", async () => {
    const { camp, came, alsoCame, stayedHome } = await endedCamp();
    const token = makeToken("feedback", came.id);
    expect(await feedbackPerson(camp, token)).toEqual({ id: came.id, firstName: "Ama", answered: false });
    expect(await feedbackPerson(camp, makeToken("feedback", stayedHome.id))).toBeNull();
    expect(await feedbackPerson(camp, makeToken("pay", came.id))).toBeNull();

    await submitFeedback(camp, token, { rating: 5, best: "  The   worship nights ", change: "More water" });
    await expect(submitFeedback(camp, token, { rating: 1, best: "", change: "" })).rejects.toThrow("already");
    await expect(submitFeedback(camp, makeToken("feedback", alsoCame.id), { rating: 9, best: "", change: "" })).rejects.toThrow("1 to 5");
    await submitFeedback(camp, makeToken("feedback", alsoCame.id), { rating: 3, best: "", change: "" });

    expect(await hasAnswered(camp.id, came.id)).toBe(true);
    const summary = await feedbackSummary(camp.id);
    expect(summary).toMatchObject({ answers: 2, average: 4, ratings: [0, 0, 1, 0, 1], arrived: 2 });
    // Answered people aren't texted afterwards.
    expect(summary.pending).toBe(0);
    const written = await listFeedback(camp.id);
    expect(written.map((a) => [a.rating, a.best, a.change])).toEqual([[5, "The worship nights", "More water"]]);
    // Nothing in an answer says whose it is.
    const [row] = await query<Record<string, unknown>>("app", "SELECT * FROM camp_feedback WHERE camp_id = ? AND rating = 5", [camp.id]);
    expect(JSON.stringify(row)).not.toContain(came.id);
    expect(Object.keys(row).sort()).toEqual(["best", "camp_id", "change", "created_on", "id", "rating"]);
    expect((await arrivalCounts(camp.id)).here).toBe(2);
  });
});
