import { requireCampRole } from "@/lib/camp/auth";
import { ID, getCamp } from "@/lib/camp/camps";
import { csvResponse } from "@/lib/camp/csv";
import { listPeople, parsePeopleFilters, peopleCsv } from "@/lib/camp/reports";
import { CampError } from "@/lib/camp/types";

/** The coordinators' people table as CSV, with the same filters as the page. */
export async function GET(request: Request, { params }: { params: Promise<{ campId: string }> }) {
  try {
    await requireCampRole("coordinator");
  } catch (err) {
    if (err instanceof CampError) return new Response(err.message, { status: 403 });
    throw err;
  }
  const { campId } = await params;
  const camp = ID.test(campId) ? await getCamp(campId) : null;
  if (!camp) return new Response("Not found", { status: 404 });
  const filters = parsePeopleFilters(Object.fromEntries(new URL(request.url).searchParams));
  return csvResponse(peopleCsv(await listPeople(camp.id, filters)), `${camp.slug}-people.csv`);
}
