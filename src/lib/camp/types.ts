/** Shared camp types. Money is integer pesewas (GHS x 100) everywhere. */

export const CAMP_STATUSES = ["draft", "open", "closed", "archived"] as const;
export type CampStatus = (typeof CAMP_STATUSES)[number];

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const STAFF_ROLES = ["admin", "coordinator", "leader"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type ScopeKind = "fellowship" | "pfcc";

export type Camp = {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  venue: string;
  starts_on: string;
  ends_on: string;
  registration_opens_on: string;
  registration_closes_on: string;
  payment_due_on: string;
  roommate_deadline_on: string;
  min_first_payment_pct: number;
  status: CampStatus;
};

/** What a coordinator fills in; id, slug and created_at are set on save. */
export type CampInput = Omit<Camp, "id" | "created_at" | "slug">;

export type RoomType = {
  id: string;
  camp_id: string;
  name: string;
  price_pesewas: number;
  capacity: number;
};

export type Room = {
  id: string;
  camp_id: string;
  room_type_id: string;
  room_type_name: string;
  label: string;
  gender: Gender;
  capacity: number;
};

export type RoomInput = Pick<Room, "room_type_id" | "label" | "gender" | "capacity">;

export type Staff = {
  email: string;
  role: StaffRole;
  scope_kind: ScopeKind | null;
  scope_value: string | null;
};

/** A user-facing validation problem, safe to show as-is. */
export class CampError extends Error {}
