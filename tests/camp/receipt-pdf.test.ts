import { describe, expect, it } from "vitest";
import { receiptsPdf } from "@/lib/camp/receipt-pdf";
import type { ReceiptView } from "@/components/camp/ReceiptCard";

const receipt = (n: number): ReceiptView => ({
  reference: `CAMP-000000000000000${n}`,
  paid_at: "2026-11-11T22:43:49.000Z",
  full_name: `Person ${n}`,
  room_type_name: "Hostel",
  payer: n === 2 ? "Kwesi Mensah" : null,
  bulk: false,
  method: "momo",
  amount_pesewas: 20000,
  fee_pesewas: 306,
  charged_pesewas: 20306,
  price_pesewas: 60000,
  paid_pesewas: 20000,
  transaction_id: "e6599fa4xffac",
});

describe("receipt PDFs", () => {
  it("make one A5 page per receipt, with the amount, who paid and the reference", async () => {
    const doc = await receiptsPdf([1, 2, 3].map(receipt), { name: "Therefore Are Saints", starts_on: "2026-12-18" });
    expect(doc.getNumberOfPages()).toBe(3);
    const text = doc.output();
    expect(text.startsWith("%PDF-")).toBe(true);
    for (const part of ["Therefore Are Saints", "GHS 203.06", "Kwesi Mensah", "CAMP-0000000000000002", "GHS 400.00 left to pay", "Mobile money"]) {
      expect(text).toContain(part);
    }
  });
});
