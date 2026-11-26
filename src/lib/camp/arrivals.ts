import { query } from "@/lib/cf";
import { checkId } from "./camps";

export type ArrivalPerson = {
  id: string;
  full_name: string;
  fellowship: string;
  status: string;
  arrival_day: string;
  arrival_time: "" | "morning" | "afternoon" | "evening";
  transport: "" | "bus" | "self";
  checked_in_at: string | null;
};

/** Everyone coming (cancelled and deleted left out), with what they said about getting to camp and whether they've checked in. */
export function listArrivals(campId: string): Promise<ArrivalPerson[]> {
  return query<ArrivalPerson>(
    "app",
    `SELECT id, full_name, fellowship, status, arrival_day, arrival_time, transport, checked_in_at
     FROM camp_registrations
     WHERE camp_id = ? AND status <> 'cancelled' AND deleted_at IS NULL
     ORDER BY full_name COLLATE NOCASE`,
    [checkId(campId, "camp")],
  );
}
