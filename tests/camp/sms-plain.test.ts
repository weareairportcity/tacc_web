import { describe, expect, it } from "vitest";
import { plainSms, smsPartsOf } from "@/lib/sms-plain";
import { plainSms as workerPlainSms } from "../../workers/soulwinning/src/sms-plain";
import { coordinatorText } from "@/lib/camp/sms";

describe("plainSms", () => {
  it("straightens iPhone quotes and dashes", () => {
    expect(plainSms("Don’t forget your “Bible” – and a pen…")).toBe(`Don't forget your "Bible" - and a pen...`);
  });
  it("drops emoji and tidies the gap they leave", () => {
    expect(plainSms("See you there 🙏🏾🎉 !")).toBe("See you there!");
    expect(plainSms("Bring water 💧 and a torch")).toBe("Bring water and a torch");
  });
  it("turns Ghanaian and accented letters into plain ones", () => {
    expect(plainSms("Ɛkwa, Kɔfi, Adwoa Kyeremaa, Zoë, Chloé, ₵50")).toBe("Ekwa, Kofi, Adwoa Kyeremaa, Zoe, Chloé, GHS 50");
  });
  it("leaves plain text alone", () => {
    const t = "Hi Ama, your room at Camp is W-AC6-01 (6 in a room with AC). See you at camp! - The Airport City Church";
    expect(plainSms(t)).toBe(t);
  });
  it("the Worker's copy does the same", () => {
    for (const t of ["Don’t 🙏🏾 – Ɛkwa…", "Plain text, 100%."]) expect(workerPlainSms(t)).toBe(plainSms(t));
  });
});

describe("smsPartsOf", () => {
  it("counts the text as it will be sent, so a curly quote doesn't change the cost", () => {
    const curly = coordinatorText("Ama Mensah", "don’t ".repeat(60).trim());
    expect(smsPartsOf(curly)).toBe(smsPartsOf(curly.replaceAll("’", "'")));
    expect(smsPartsOf(curly)).toBe(3);
  });
  it("160 is one part, 161 is two", () => {
    expect(smsPartsOf("a".repeat(160))).toBe(1);
    expect(smsPartsOf("a".repeat(161))).toBe(2);
    expect(smsPartsOf("€".repeat(80))).toBe(1);
    expect(smsPartsOf("€".repeat(81))).toBe(2);
  });
});
