import { describe, expect, it } from "vitest";
import { actorName, describeAction, visiblePerson } from "@/lib/camp/history-words";

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
});
