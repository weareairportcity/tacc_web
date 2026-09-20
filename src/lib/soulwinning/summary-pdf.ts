import { jsPDF } from "jspdf";
import type { HourlyRow, LeaderboardRow, Overview } from "./admin";
import type { SwCampaign } from "./types";

const INK: [number, number, number] = [12, 10, 9];
const BLUE: [number, number, number] = [51, 152, 225];
const MUTED: [number, number, number] = [120, 113, 108];
const RULE: [number, number, number] = [232, 230, 229];
const WASH: [number, number, number] = [193, 225, 247];
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36;

export type SummaryPdfData = {
  campaign: SwCampaign;
  overview: Overview;
  fellowships: LeaderboardRow[];
  pfccs: LeaderboardRow[];
  members: LeaderboardRow[];
  hourly: HourlyRow[];
  logo?: string | null;
  printedAt?: Date;
};

function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function eventLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function hourTick(hour: number) {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

export async function loadLogo(): Promise<string | null> {
  try {
    const response = await fetch("/logo.png");
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function clip(doc: jsPDF, text: string, width: number) {
  const lines = doc.splitTextToSize(text, width);
  return typeof lines === "string" ? lines : lines[0] ?? "";
}

function drawRanks(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: LeaderboardRow[],
  limit: number
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(title, x, y);

  const top = rows[0]?.souls ?? 1;
  let cursor = y + 16;
  const shown = rows.slice(0, limit);
  if (shown.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("None yet", x, cursor);
    return cursor + 8;
  }

  for (let index = 0; index < shown.length; index += 1) {
    const row = shown[index];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(String(index + 1), x, cursor);

    doc.setTextColor(...INK);
    doc.setFontSize(8.5);
    doc.text(clip(doc, row.label, width - 46), x + 12, cursor);

    doc.setFont("helvetica", "bold");
    doc.text(row.souls.toLocaleString(), x + width, cursor, { align: "right" });

    const barTop = cursor + 3.5;
    const barLeft = x + 12;
    const barWidth = width - 12;
    doc.setFillColor(...RULE);
    doc.rect(barLeft, barTop, barWidth, 2.2, "F");
    doc.setFillColor(...BLUE);
    doc.rect(barLeft, barTop, Math.max(barWidth * (row.souls / top), 1.5), 2.2, "F");
    cursor += 17;
  }
  return cursor;
}

export function buildSummaryPdf(data: SummaryPdfData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
  const { campaign, overview, fellowships, pfccs, members, hourly } = data;
  const printed = data.printedAt ?? new Date();
  const goal = campaign.goal_total;
  const total = overview.total_souls;
  const inner = PAGE_W - MARGIN * 2;

  if (data.logo) {
    try {
      const image = doc.getImageProperties(data.logo);
      const height = 26;
      const width = Math.min((image.width / image.height) * height, 92);
      doc.addImage(data.logo, "PNG", MARGIN, 28, width, height);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      doc.text("The Airport City Church", MARGIN + width + 10, 38);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(campaign.name, MARGIN + width + 10, 50);
    } catch {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      doc.text("The Airport City Church", MARGIN, 40);
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text("The Airport City Church", MARGIN, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(campaign.name, MARGIN, 52);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(eventLabel(campaign.event_date), PAGE_W - MARGIN, 40, { align: "right" });
  doc.text("One-page summary", PAGE_W - MARGIN, 52, { align: "right" });

  doc.setFillColor(...BLUE);
  doc.rect(MARGIN, 64, inner, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(64);
  doc.setTextColor(...INK);
  doc.text(total.toLocaleString(), MARGIN, 128);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(total === 1 ? "soul won for Christ" : "souls won for Christ", MARGIN, 148);

  if (goal && goal > 0) {
    const barY = 162;
    const barH = 8;
    const filled = Math.min(total / goal, 1);
    doc.setFillColor(...WASH);
    doc.roundedRect(MARGIN, barY, inner, barH, 2, 2, "F");
    doc.setFillColor(...BLUE);
    if (filled > 0) doc.roundedRect(MARGIN, barY, Math.max(inner * filled, 4), barH, 2, 2, "F");

    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const remaining = Math.max(goal - total, 0);
    const left =
      total >= goal
        ? `Goal ${goal.toLocaleString()} · reached`
        : `${remaining.toLocaleString()} to the goal of ${goal.toLocaleString()}`;
    doc.text(left, MARGIN, barY + 20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE);
    doc.text(`${pct(total, goal)}%`, PAGE_W - MARGIN, barY + 20, { align: "right" });
  }

  const statsY = 204;
  const stats = [
    { value: overview.tongues_count.toLocaleString(), label: "Spoke in tongues", note: `${pct(overview.tongues_count, total)}%` },
    { value: overview.church_count.toLocaleString(), label: "Coming to church", note: `${pct(overview.church_count, total)}%` },
    { value: overview.entrant_count.toLocaleString(), label: "Members entering", note: "" },
    {
      value: overview.located_count.toLocaleString(),
      label: "On the map",
      note: total ? `${pct(overview.located_count, total)}%` : "",
    },
  ];
  const cellW = inner / stats.length;
  stats.forEach((stat, index) => {
    const x = MARGIN + cellW * index;
    if (index > 0) {
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.6);
      doc.line(x, statsY - 12, x, statsY + 28);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text(stat.value, x + 10, statsY + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(stat.label, x + 10, statsY + 16);
    if (stat.note) {
      doc.setTextColor(...BLUE);
      doc.text(stat.note, x + 10, statsY + 28);
    }
  });

  const pfccY = 252;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("PFCCs", MARGIN, pfccY);

  const pfccRows = pfccs.slice(0, 3);
  const pfccW = (inner - 16) / Math.max(pfccRows.length, 1);
  pfccRows.forEach((row, index) => {
    const x = MARGIN + index * (pfccW + 8);
    doc.setFillColor(250, 250, 249);
    doc.roundedRect(x, pfccY + 8, pfccW, 42, 3, 3, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(clip(doc, row.label, pfccW - 16), x + 10, pfccY + 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text(row.souls.toLocaleString(), x + 10, pfccY + 42);
  });

  const ranksY = 322;
  const colGap = 28;
  const colW = (inner - colGap) / 2;
  const leftBottom = drawRanks(doc, MARGIN, ranksY, colW, "Fellowships", fellowships, 12);
  const rightBottom = drawRanks(doc, MARGIN + colW + colGap, ranksY, colW, "Members", members, 12);
  const hourY = Math.max(leftBottom, rightBottom) + 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("How the day moved", MARGIN, hourY);

  const plotTop = hourY + 12;
  const plotH = 88;
  const plotW = inner;
  const series = hourly.length > 0 ? hourly : [];
  const maxHour = Math.max(...series.map((row) => row.souls), 1);
  const band = series.length > 0 ? plotW / series.length : plotW;
  const peak = series.reduce((best, row) => (row.souls > best.souls ? row : best), series[0]);

  if (peak && peak.souls > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${peak.souls.toLocaleString()} at ${hourTick(peak.hour)}`, PAGE_W - MARGIN, hourY, {
      align: "right",
    });
  }

  doc.setFillColor(...RULE);
  doc.rect(MARGIN, plotTop + plotH - 14, inner, 0.6, "F");

  series.forEach((row, index) => {
    const barH = (row.souls / maxHour) * (plotH - 14);
    const w = Math.min(Math.max(band * 0.42, 4), 16);
    const x = MARGIN + index * band + (band - w) / 2;
    doc.setFillColor(...BLUE);
    doc.rect(x, plotTop + (plotH - 14) - barH, w, Math.max(barH, 1), "F");
  });

  if (series.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const first = series[0];
    const mid = series[Math.floor(series.length / 2)];
    const last = series[series.length - 1];
    doc.text(hourTick(first.hour), MARGIN, plotTop + plotH + 4);
    doc.text(hourTick(mid.hour), MARGIN + plotW / 2, plotTop + plotH + 4, { align: "center" });
    doc.text(hourTick(last.hour), PAGE_W - MARGIN, plotTop + plotH + 4, { align: "right" });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("No hourly counts yet.", MARGIN, plotTop + 24);
  }

  let foot = PAGE_H - 28;
  if (overview.pending_duplicates > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      `${overview.pending_duplicates} ${
        overview.pending_duplicates === 1 ? "duplicate still in review" : "duplicates still in review"
      } — not in these totals.`,
      MARGIN,
      foot - 12
    );
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("Soul Winning Tracker  ·  The Airport City Church", MARGIN, foot);
  doc.text(
    printed.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    PAGE_W - MARGIN,
    foot,
    { align: "right" }
  );

  return new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
}
