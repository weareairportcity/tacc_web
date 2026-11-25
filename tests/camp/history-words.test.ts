import { describe, expect, it } from "vitest";
import { actorName, describeAction, historyReceiptHref, visiblePerson } from "@/lib/camp/history-words";

describe("history copy", () => {
  it("does not present the wiped name as a person", () => {
    expect(visiblePerson("Deleted")).toBeNull();
    expect(visiblePerson("Ama Mensah")).toBe("Ama Mensah");
    expect(actorName("attendee:1", "Deleted")).toBe("An attendee");
    expect(actorName("attendee:1", "Ama Mensah")).toBe("Ama Mensah");
  });

  it("reads naturally when an attendee cancels or deletes their details", () => {
    expect(`${actorName("attendee:1", "Deleted")} ${describeAction("registration.delete_details", "attendee:1")}`).toBe(
      "An attendee deleted their details",
    );
    expect(`${actorName("attendee:1", "Deleted")} ${describeAction("registration.cancel", "attendee:1")}`).toBe(
      "An attendee cancelled their registration",
    );
    expect(describeAction("registration.cancel", "coordinator@test.local")).toBe("cancelled a registration");
  });

  it("opens the receipt for a confirmed payment", () => {
    expect(historyReceiptHref("payment.success", "CAMP-250E6E0A7DBBB54A", "camp")).toBe("/camps/r/CAMP-250E6E0A7DBBB54A");
    expect(historyReceiptHref("payment.bulk_success", "CAMP-B0123456789ABCDEF", "camp-id")).toBe(
      "/admin/camp/camp-id/money/paid?reference=CAMP-B0123456789ABCDEF",
    );
    expect(historyReceiptHref("registration.create", "CAMP-250E6E0A7DBBB54A", "camp")).toBeNull();
  });
});
