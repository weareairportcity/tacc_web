"use client";

import JSZip from "jszip";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/utils/supabase/client";
import type { SwCampaign } from "./types";

/**
 * Shareable exports.
 *
 * These files get passed around fellowship and PFCC leaders, so they carry only
 * what a human reader needs: who was won, their phone, the two outcomes, and
 * who logged them. Internal plumbing — ids, coordinates, sync timestamps,
 * duplicate bookkeeping — is deliberately left out.
 */

export type ExportRow = {
  soul_name: string;
  kind: "Person" | "Group";
  souls: number;
  phone: string | null;
  tongues: number;
  church: number;
  entrant_name: string;
  fellowship: string;
  pfcc: string;
};

const HEADERS = [
  "Name",
  "Type",
  "Souls",
  "Phone",
  "Spoke in tongues",
  "Coming to church",
  "Won by",
  "Fellowship",
  "PFCC",
];

const cells = (row: ExportRow) => [
  row.soul_name,
  row.kind,
  String(row.souls),
  row.phone ?? "",
  row.kind === "Group" ? String(row.tongues) : row.tongues ? "Yes" : "No",
  row.kind === "Group" ? String(row.church) : row.church ? "Yes" : "No",
  row.entrant_name,
  row.fellowship,
  row.pfcc,
];

const soulCount = (rows: ExportRow[]) => rows.reduce((sum, row) => sum + row.souls, 0);
const tongueCount = (rows: ExportRow[]) => rows.reduce((sum, row) => sum + row.tongues, 0);
const churchCount = (rows: ExportRow[]) => rows.reduce((sum, row) => sum + row.church, 0);

type Raw = {
  soul_name: string;
  phone: string | null;
  spoke_in_tongues: boolean;
  coming_to_church: boolean;
  created_at: string;
  group_id: string | null;
  sw_entrants: { name: string; fellowship: string | null; pfcc: string | null } | null;
};

function toRow(row: Raw, extra?: { souls: number; tongues: number; church: number; kind: "Person" | "Group" }): ExportRow {
  return {
    soul_name: row.soul_name,
    kind: extra?.kind ?? "Person",
    souls: extra?.souls ?? 1,
    phone: row.phone,
    tongues: extra?.tongues ?? (row.spoke_in_tongues ? 1 : 0),
    church: extra?.church ?? (row.coming_to_church ? 1 : 0),
    entrant_name: row.sw_entrants?.name ?? "—",
    fellowship: row.sw_entrants?.fellowship?.trim() || "Not given",
    pfcc: row.sw_entrants?.pfcc?.trim() || "Not given",
  };
}

/** One class is one row — 75 identical names must not become 75 lines. */
function collapseExportRows(rows: Raw[]): ExportRow[] {
  const grouped = new Map<string, Raw[]>();
  const singles: Raw[] = [];

  for (const row of rows) {
    if (row.group_id) {
      const list = grouped.get(row.group_id) ?? [];
      list.push(row);
      grouped.set(row.group_id, list);
    } else {
      singles.push(row);
    }
  }

  const collapsed: { row: ExportRow; created_at: string }[] = singles.map((row) => ({
    row: toRow(row),
    created_at: row.created_at,
  }));

  for (const members of grouped.values()) {
    const sameName = members.every((item) => item.soul_name === members[0].soul_name);
    if (sameName && members.length > 1) {
      const lead = members.find((item) => item.phone) ?? members[0];
      collapsed.push({
        row: toRow(lead, {
          kind: "Group",
          souls: members.length,
          tongues: members.filter((item) => item.spoke_in_tongues).length,
          church: members.filter((item) => item.coming_to_church).length,
        }),
        created_at: lead.created_at,
      });
    } else {
      for (const member of members) collapsed.push({ row: toRow(member), created_at: member.created_at });
    }
  }

  return collapsed.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((item) => item.row);
}

export async function fetchExportRows(campaignId: string): Promise<ExportRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sw_soul_entries")
    .select(
      "soul_name, phone, spoke_in_tongues, coming_to_church, created_at, group_id, sw_entrants(name, fellowship, pfcc)"
    )
    .eq("campaign_id", campaignId)
    .eq("counted", true)
    .order("created_at")
    .limit(5000);
  if (error) throw error;

  return collapseExportRows((data as unknown as Raw[]) ?? []);
}

function csv(rows: ExportRow[]): string {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return [HEADERS, ...rows.map(cells)].map((row) => row.map(escape).join(",")).join("\r\n");
}

function pdf(rows: ExportRow[], campaign: SwCampaign, title: string): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const souls = soulCount(rows);

  doc.setFontSize(16);
  doc.text(title, 40, 44);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(
    `${campaign.name} · ${souls.toLocaleString()} ${souls === 1 ? "soul" : "souls"} · ${new Date().toLocaleDateString(
      "en-GB",
      {
        day: "numeric",
        month: "long",
        year: "numeric",
      }
    )}`,
    40,
    62
  );

  doc.text(
    `Spoke in tongues: ${tongueCount(rows)} · Coming to church: ${churchCount(rows)}`,
    40,
    78
  );

  autoTable(doc, {
    head: [HEADERS],
    body: rows.map(cells),
    startY: 94,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [51, 152, 225], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 250, 249] },
  });

  return doc.output("blob");
}

export type Format = "csv" | "pdf";

function safeName(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "unnamed";
}

export function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function build(rows: ExportRow[], campaign: SwCampaign, title: string, format: Format): Blob {
  return format === "pdf"
    ? pdf(rows, campaign, title)
    : new Blob([`﻿${csv(rows)}`], { type: "text/csv;charset=utf-8" });
}

/** One file: everything, or a single fellowship / PFCC. */
export function exportSingle(
  rows: ExportRow[],
  campaign: SwCampaign,
  format: Format,
  scope: { kind: "all" } | { kind: "fellowship" | "pfcc"; value: string }
): void {
  const filtered =
    scope.kind === "all"
      ? rows
      : rows.filter((row) => (scope.kind === "fellowship" ? row.fellowship : row.pfcc) === scope.value);

  const title =
    scope.kind === "all"
      ? "All souls won"
      : `${scope.kind === "fellowship" ? "Fellowship" : "PFCC"}: ${scope.value}`;

  const name =
    scope.kind === "all" ? `${campaign.slug}-all-souls` : `${campaign.slug}-${scope.kind}-${safeName(scope.value)}`;

  download(`${name}.${format}`, build(filtered, campaign, title, format));
}

/**
 * Everything, separated: the overall file plus one per fellowship and one per
 * PFCC, zipped so a leader can be handed exactly their own sheet.
 */
export async function exportSeparatedZip(
  rows: ExportRow[],
  campaign: SwCampaign,
  formats: Format[]
): Promise<void> {
  const zip = new JSZip();

  const add = async (folder: string, name: string, list: ExportRow[], title: string) => {
    for (const format of formats) {
      const blob = build(list, campaign, title, format);
      zip.folder(folder)?.file(`${name}.${format}`, await blob.arrayBuffer());
    }
  };

  await add(".", `${campaign.slug}-all-souls`, rows, "All souls won");

  const fellowships = [...new Set(rows.map((row) => row.fellowship))].sort();
  for (const fellowship of fellowships) {
    await add(
      "fellowships",
      safeName(fellowship),
      rows.filter((row) => row.fellowship === fellowship),
      `Fellowship: ${fellowship}`
    );
  }

  const pfccs = [...new Set(rows.map((row) => row.pfcc))].sort();
  for (const pfcc of pfccs) {
    await add("pfccs", safeName(pfcc), rows.filter((row) => row.pfcc === pfcc), `PFCC: ${pfcc}`);
  }

  download(`${campaign.slug}-souls-separated.zip`, await zip.generateAsync({ type: "blob" }));
}
