import type { jsPDF } from "jspdf";
import { receiptRows, type ReceiptView } from "@/components/camp/ReceiptCard";
import { formatCedis } from "./money";

/**
 * Receipts as real PDF files, made in the browser (no print dialog): one
 * receipt per A5 page, laid out like the on-screen receipt. One receipt or a
 * whole list in one file. jsPDF loads only when someone downloads.
 */

const INK: [number, number, number] = [12, 10, 9];
const MUTED: [number, number, number] = [120, 113, 108];
const RULE: [number, number, number] = [232, 230, 229];
const CANVAS: [number, number, number] = [250, 250, 249];
const GREEN: [number, number, number] = [12, 163, 12];
const W = 419.53; // A5
const M = 32;

const startDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function page(doc: jsPDF, r: ReceiptView, camp: { name: string; starts_on: string }) {
  const { who, refs, left } = receiptRows(r);
  let y = M;

  // Header: who it's from, and that it's a receipt.
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(camp.name, M, y + 10, { maxWidth: W - 2 * M - 70 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`The Airport City Church · ${startDay(camp.starts_on)}`, M, y + 24);
  doc.setFontSize(8);
  doc.text("RECEIPT", W - M, y + 10, { align: "right", charSpace: 1.5 });
  y += 38;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.8);
  doc.line(M, y, W - M, y);

  // The tick and the amount: the first thing anyone looks for.
  y += 34;
  doc.setFillColor(...GREEN);
  doc.circle(W / 2, y, 15, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(2.4);
  doc.lines(
    [
      [5, 5],
      [10, -11],
    ],
    W / 2 - 7,
    y,
  );
  y += 34;
  doc.setTextColor(...MUTED);
  doc.setFontSize(10);
  doc.text(r.bulk ? "Paid for this person" : "Payment received", W / 2, y, { align: "center" });
  y += 30;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text(formatCedis(r.charged_pesewas), W / 2, y, { align: "center" });
  doc.setFont("helvetica", "normal");
  if (r.fee_pesewas > 0) {
    y += 18;
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`${formatCedis(r.amount_pesewas)} towards camp + ${formatCedis(r.fee_pesewas)} payment fee`, W / 2, y, { align: "center" });
  }

  // The torn edge.
  y += 24;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(1.2);
  doc.setLineDashPattern([4, 3], 0);
  doc.line(M, y, W - M, y);
  doc.setLineDashPattern([], 0);

  const row = (k: string, v: string, mono = false) => {
    y += 22;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(k, M, y);
    doc.setTextColor(...INK);
    doc.setFont(mono ? "courier" : "helvetica", "normal");
    doc.setFontSize(mono ? 9 : 10);
    doc.text(v, W - M, y, { align: "right", maxWidth: W - 2 * M - 110 });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(M, y + 8, W - M, y + 8);
  };
  y += 4;
  for (const [k, v] of who) row(k, v);

  // Where they stand now.
  y += 22;
  doc.setFillColor(...CANVAS);
  doc.roundedRect(M, y, W - 2 * M, 34, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(left === 0 ? "Fully paid" : `${formatCedis(left)} left to pay`, M + 12, y + 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(left === 0 ? "See you at camp!" : `of ${formatCedis(r.price_pesewas)}, as of today`, W - M - 12, y + 21, { align: "right" });
  y += 40;

  for (const [k, v] of refs) row(k, v, true);

  y += 30;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("Thank you. Keep this receipt for your records. Questions? Contact the camp coordinators.", W / 2, y, { align: "center", maxWidth: W - 2 * M });
}

/** One PDF with a page per receipt. */
export async function receiptsPdf(receipts: ReceiptView[], camp: { name: string; starts_on: string }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a5" });
  doc.setProperties({ title: receipts.length === 1 ? `Receipt ${receipts[0].reference}` : `${camp.name} receipts`, author: "The Airport City Church" });
  receipts.forEach((r, i) => {
    if (i > 0) doc.addPage();
    page(doc, r, camp);
  });
  return doc;
}

/** Downloads it (a file, no print dialog). */
export async function downloadReceiptsPdf(receipts: ReceiptView[], camp: { name: string; starts_on: string }, filename: string) {
  (await receiptsPdf(receipts, camp)).save(filename);
}
