import { batch } from "@/lib/cf";
import { auditStatement } from "@/lib/camp/audit";
import { requireCampRole } from "@/lib/camp/auth";
import { ID, getCamp } from "@/lib/camp/camps";
import { csvResponse } from "@/lib/camp/csv";
import { getCampSummary, summaryCsv, summaryFilename } from "@/lib/camp/summary";
import { summaryPdf } from "@/lib/camp/summary-pdf";
import { CampError } from "@/lib/camp/types";

/** Coordinator, admin or Pastor: one summary file, logged. */
export async function serveSummary(campId: string, format: "pdf" | "csv") {
  let staff;
  try {
    staff = await requireCampRole("coordinator", "pastor");
  } catch (err) {
    if (err instanceof CampError) return new Response(err.message, { status: 403 });
    throw err;
  }
  const camp = ID.test(campId) ? await getCamp(campId) : null;
  if (!camp) return new Response("Not found", { status: 404 });
  const printedAt = new Date().toISOString();
  const summary = await getCampSummary(camp, staff.email, printedAt);
  await batch("app", [
    auditStatement({
      actor: staff.email,
      campId: camp.id,
      action: "people.summary",
      entity: "camp",
      entityId: camp.id,
      after: { format, note: format === "pdf" ? "as PDF" : "as a spreadsheet" },
    }),
  ]);
  const filename = summaryFilename(summary, format);
  if (format === "csv") return csvResponse(summaryCsv(summary), filename);
  return new Response(new Uint8Array(await summaryPdf(summary)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
