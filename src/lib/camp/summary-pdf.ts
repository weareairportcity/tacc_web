import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatAccraLong, formatDate } from "@/components/camp/ui";
import { formatCedis } from "./money";
import type { CampSummary, RankedRow } from "./summary";

/** A4 camp summary: logo, overview, then ranked tables. Who printed and when on every page. */

const INK: [number, number, number] = [12, 10, 9];
const MUTED: [number, number, number] = [120, 113, 108];
const RULE: [number, number, number] = [232, 230, 229];
const WASH: [number, number, number] = [250, 250, 249];
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;
const money = (p: number) => formatCedis(p).replace(/\.00$/, "");
const who = (g: string) => (g === "male" ? "Men" : "Women");

async function campLogo(url: string): Promise<{ data: string; format: "PNG" | "JPEG" } | null> {
  if (!/^https:\/\/media\.theairportcitychurch\.com\//.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0];
    const format = type === "image/png" ? "PNG" : type === "image/jpeg" ? "JPEG" : null;
    if (!format) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { data: `data:${type};base64,${btoa(binary)}`, format };
  } catch {
    return null;
  }
}

function stamp(s: CampSummary) {
  return `Printed by ${s.printedBy} · ${formatAccraLong(s.printedAt)}`;
}

function rankBody(rows: RankedRow[]) {
  return rows.map((r) => [String(r.rank), r.name, String(r.people), String(r.fully_paid), money(r.outstanding)]);
}

export async function summaryPdf(s: CampSummary): Promise<ArrayBuffer> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const inner = PAGE_W - M * 2;
  const printed = stamp(s);
  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(printed, M, PAGE_H - 28);
    doc.text(String(doc.getCurrentPageInfo().pageNumber), PAGE_W - M, PAGE_H - 28, { align: "right" });
  };
  let y = M;

  const logo = s.camp.logo_url ? await campLogo(s.camp.logo_url) : null;
  if (logo) {
    try {
      const image = doc.getImageProperties(logo.data);
      const height = 28;
      const width = Math.min((image.width / image.height) * height, 72);
      doc.addImage(logo.data, logo.format, M, y, width, height);
      y += height + 14;
    } catch {
      /* camp name below is enough */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(s.camp.name, M, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Camp summary", M, y + 26);
  const where = [s.camp.venue, `${formatDate(s.camp.starts_on)} – ${formatDate(s.camp.ends_on)}`].filter(Boolean).join(" · ");
  if (where) doc.text(where, M, y + 38);
  y += 52;

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.8);
  doc.line(M, y, PAGE_W - M, y);
  y += 22;

  const o = s.overview;
  const stats = [
    { value: String(o.people), label: "Registered" },
    { value: String(o.fully_paid), label: "Fully paid" },
    { value: String(o.outstandingPeople), label: "Still to pay" },
    { value: money(o.expected), label: "Expected" },
    { value: money(o.collected), label: "Collected" },
    { value: money(o.outstanding), label: "Outstanding" },
  ];
  const col = inner / 3;
  stats.forEach((stat, i) => {
    const x = M + (i % 3) * col;
    const top = y + Math.floor(i / 3) * 36;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...INK);
    doc.text(stat.value, x, top);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(stat.label, x, top + 12);
  });
  y += 84;
  if (o.cancelled) {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${o.cancelled} cancelled`, M, y);
    y += 8;
  }

  const block = (title: string, head: string[], body: string[][]) => {
    const last = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    let top = (last?.finalY ?? y) + 22;
    if (top > PAGE_H - 140) {
      doc.addPage();
      top = M;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(title, M, top);
    autoTable(doc, {
      startY: top + 8,
      margin: { left: M, right: M, bottom: 48 },
      head: [head],
      body,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 4, bottom: 4, left: 3, right: 3 }, textColor: INK, lineColor: RULE, lineWidth: 0.4, overflow: "linebreak" },
      headStyles: { fontStyle: "bold", fillColor: WASH, textColor: INK },
      didDrawPage: footer,
    });
  };

  const rankedHead = ["#", "Name", "People", "Fully paid", "Outstanding"];
  const roomRows = s.rooms.length
    ? s.rooms.map((r) => [r.room_type_name, who(r.gender), String(r.people), String(r.fully_paid), money(r.outstanding)])
    : [["None yet"]];
  block("Rooms", ["Room type", "Gender", "People", "Fully paid", "Outstanding"], roomRows);
  block("PFCCs", rankedHead, rankBody(s.pfccs));
  block("Groups", rankedHead, rankBody(s.groups));
  block("Fellowships", rankedHead, rankBody(s.fellowships));

  return doc.output("arraybuffer");
}
