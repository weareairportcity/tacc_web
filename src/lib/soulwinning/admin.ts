"use client";

/**
 * The dashboard's data access. The queries themselves are server actions in
 * admin-actions.ts (checked against the admin code cookie, run on Cloudflare
 * D1); this module re-exports them next to the browser-only helpers so the
 * screens keep importing from one place.
 */

export * from "./admin-shared";
export {
  addSmsRecipient,
  clearCampaignEntries,
  deleteSoulEntries,
  exportRawEntries,
  fetchCampaigns,
  fetchCountedEntries,
  fetchDuplicates,
  fetchEntries,
  fetchHourly,
  fetchLeaderboard,
  fetchMapPoints,
  fetchOverview,
  fetchPhotoEntries,
  fetchSmsConfig,
  fetchSmsLog,
  removeSmsRecipient,
  resolveDuplicate,
  searchMap,
  setSmsRecipientEnabled,
  updateCampaignSettings,
} from "./admin-actions";
export type { AdminEntry, MapSearchHit } from "./admin-actions";

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
