import { batch } from "@/lib/cf";
import { FELLOWSHIPS } from "@/lib/fellowships";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { fellowshipMoved } from "./notify";
import { getRegistration } from "./registrations";
import { CampError } from "./types";

/**
 * Changing someone's fellowship. Fellowship and PFCC are the only places it
 * is kept (groups and leaders are worked out from it when read), so one
 * update moves them in People, Check-in, Rooms, the leaders' lists and the
 * evening texts. The leaders they leave and join are told.
 */
export async function changeFellowship(actor: string, registrationId: string, fellowship: string) {
  const before = await getRegistration(checkId(registrationId, "registration"));
  if (!before) throw new CampError("Unknown registration.");
  if (before.status === "cancelled") throw new CampError("This registration is cancelled.");
  const next = FELLOWSHIPS.find((f) => f.name === fellowship);
  if (!next) throw new CampError("Choose a fellowship from the list.");
  if (before.fellowship === next.name) throw new CampError("That's already your fellowship.");

  const results = await batch("app", [
    {
      sql: "UPDATE camp_registrations SET fellowship = ?, pfcc = ? WHERE id = ? AND fellowship = ? AND status <> 'cancelled' RETURNING id",
      params: [next.name, next.pfcc, before.id, before.fellowship],
    },
    auditStatement({
      actor,
      campId: before.camp_id,
      action: "registration.fellowship_change",
      entity: "registration",
      entityId: before.id,
      before: { fellowship: before.fellowship, pfcc: before.pfcc },
      after: { fellowship: next.name, pfcc: next.pfcc },
      ifChanged: true,
    }),
  ]);
  if (!results[0].results.length) throw new CampError("This registration changed. Please refresh and try again.");
  await fellowshipMoved(before, before.fellowship, next.name);
  return { from: before.fellowship, to: next.name };
}
