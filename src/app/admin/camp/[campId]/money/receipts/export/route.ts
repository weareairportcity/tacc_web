import { batch } from "@/lib/cf";
import { auditStatement } from "@/lib/camp/audit";
import { requireCampRole } from "@/lib/camp/auth";
import { ID, getCamp } from "@/lib/camp/camps";
import { csvResponse } from "@/lib/camp/csv";
import { campOrigin } from "@/lib/camp/origin";
import { listReceipts, parseReceiptFilters, receiptsCsv } from "@/lib/camp/receipts";
import { CampError } from "@/lib/camp/types";

/** Every receipt for the camp as CSV, with the same filters as the Receipts page. */
export async function GET(request: Request, { params }: { params: Promise<{ campId: string }> }) {
  let staff;
  try {
    staff = await requireCampRole("coordinator");
  } catch (err) {
    if (err instanceof CampError) return new Response(err.message, { status: 403 });
    throw err;
  }
  const { campId } = await params;
  const camp = ID.test(campId) ? await getCamp(campId) : null;
  if (!camp) return new Response("Not found", { status: 404 });
  const filters = parseReceiptFilters(Object.fromEntries(new URL(request.url).searchParams));
  const rows = await listReceipts(camp.id, filters);
  await batch("app", [auditStatement({ actor: staff.email, campId: camp.id, action: "receipts.export", entity: "camp", entityId: camp.id, after: { rows: rows.length } })]);
  const day = new Date().toISOString().slice(0, 10);
  return csvResponse(receiptsCsv(rows, await campOrigin()), `${camp.slug}-receipts-${day}.csv`);
}
