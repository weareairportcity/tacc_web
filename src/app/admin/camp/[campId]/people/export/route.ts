import { requireCampRole } from "@/lib/camp/auth";
import { ID, getCamp } from "@/lib/camp/camps";
import { csvResponse } from "@/lib/camp/csv";
import { leaderCsv, listPeopleForLeader, parsePeopleFilters, scopeFor } from "@/lib/camp/reports";
import { CampError } from "@/lib/camp/types";

/** A leader's people list as CSV: their scope only, no contact details or amounts. */
export async function GET(request: Request, { params }: { params: Promise<{ campId: string }> }) {
  let staff;
  try {
    staff = await requireCampRole("leader", "coordinator");
    scopeFor(staff);
  } catch (err) {
    if (err instanceof CampError) return new Response(err.message, { status: 403 });
    throw err;
  }
  const { campId } = await params;
  const camp = ID.test(campId) ? await getCamp(campId) : null;
  if (!camp || camp.status === "draft") return new Response("Not found", { status: 404 });
  const filters = parsePeopleFilters(Object.fromEntries(new URL(request.url).searchParams));
  return csvResponse(leaderCsv(await listPeopleForLeader(staff, camp.id, filters)), `${camp.slug}-people.csv`);
}
